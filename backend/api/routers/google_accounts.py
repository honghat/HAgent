from __future__ import annotations

import json
import os
import re
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from api.services.db import get_connection
from api.services.google_credential_store import decrypt_google_credential, encrypt_google_credential
from api.services.google_email_keepalive import get_google_email_keepalive_status
from api.services.user_store import resolve_user_id
from hagent_constants import get_hagent_home, get_token_file_path, get_tokens_home


router = APIRouter(prefix="/api/google/accounts", tags=["google-accounts"])

HAGENT_HOME = get_hagent_home()
CLIENT_SECRET_PATH = get_token_file_path("google_client_secret.json")
ACTIVE_TOKEN_PATH = get_token_file_path("google_token.json")
ACCOUNT_TOKEN_DIR = get_tokens_home() / "google_tokens"
REDIRECT_URI = "http://localhost:8004/oauth2callback"
API_CALLBACK_PATH = "/api/google/accounts/oauth2callback"
CALLBACK_HOST = "127.0.0.1"
CALLBACK_PORT = 8004
_callback_server: ThreadingHTTPServer | None = None
_callback_lock = threading.Lock()

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/contacts.readonly",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/documents",
]

PHOTO_SCOPES = [
    "https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata",
    "https://www.googleapis.com/auth/photoslibrary.edit.appcreateddata",
    "https://www.googleapis.com/auth/photospicker.mediaitems.readonly",
]

SCOPE_LABELS = {
    "https://www.googleapis.com/auth/gmail.readonly": "Gmail read",
    "https://www.googleapis.com/auth/gmail.send": "Gmail send",
    "https://www.googleapis.com/auth/gmail.modify": "Gmail modify",
    "https://www.googleapis.com/auth/calendar": "Calendar",
    "https://www.googleapis.com/auth/drive": "Drive",
    "https://www.googleapis.com/auth/contacts.readonly": "Contacts",
    "https://www.googleapis.com/auth/spreadsheets": "Sheets",
    "https://www.googleapis.com/auth/documents": "Docs",
    "https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata": "Google Photos read",
    "https://www.googleapis.com/auth/photoslibrary.edit.appcreateddata": "Google Photos edit",
    "https://www.googleapis.com/auth/photospicker.mediaitems.readonly": "Google Photos Picker",
}


class ExchangeBody(BaseModel):
    state: str
    callback: str


class PermissionBody(BaseModel):
    enabled: bool


class AuthUrlBody(BaseModel):
    email: str = ""
    scope_group: str = "workspace"


class GmailInventoryBody(BaseModel):
    emails: list[str]


def _get_user_id(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    token = auth.replace("Bearer ", "").strip() or request.query_params.get("t", "")
    uid = resolve_user_id(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return uid


def _dedupe_scopes(scopes: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for scope in scopes:
        if scope and scope not in seen:
            seen.add(scope)
            output.append(scope)
    return output


def _requested_scopes(scope_group: str | None = None) -> list[str]:
    group = (scope_group or "workspace").strip().lower().replace("-", "_")
    if group in {"photos", "google_photos", "workspace_photos", "photos_workspace"}:
        return _dedupe_scopes([*SCOPES, *PHOTO_SCOPES])
    return list(SCOPES)


def _init_tables() -> None:
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS google_accounts (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                email TEXT NOT NULL,
                token_path TEXT NOT NULL,
                credential_encrypted TEXT NOT NULL DEFAULT '',
                scopes_json TEXT NOT NULL DEFAULT '[]',
                enabled_for_agent INTEGER NOT NULL DEFAULT 1,
                is_default INTEGER NOT NULL DEFAULT 0,
                last_status TEXT NOT NULL DEFAULT 'connected',
                last_error TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, email)
            );

            CREATE TABLE IF NOT EXISTS google_oauth_pending (
                state TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                code_verifier TEXT DEFAULT '',
                redirect_uri TEXT DEFAULT '',
                scopes_json TEXT NOT NULL DEFAULT '[]',
                created_at REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS google_oauth_results (
                state TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                status TEXT NOT NULL,
                account_json TEXT DEFAULT '',
                error TEXT DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS google_account_inventory (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                email TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, email)
            );
            """
        )
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(google_oauth_pending)").fetchall()}
        if "redirect_uri" not in columns:
            conn.execute("ALTER TABLE google_oauth_pending ADD COLUMN redirect_uri TEXT DEFAULT ''")
        if "scopes_json" not in columns:
            conn.execute("ALTER TABLE google_oauth_pending ADD COLUMN scopes_json TEXT NOT NULL DEFAULT '[]'")
        account_columns = {row["name"] for row in conn.execute("PRAGMA table_info(google_accounts)").fetchall()}
        if "credential_encrypted" not in account_columns:
            conn.execute("ALTER TABLE google_accounts ADD COLUMN credential_encrypted TEXT NOT NULL DEFAULT ''")
        rows = conn.execute(
            "SELECT id, token_path FROM google_accounts WHERE credential_encrypted = ''"
        ).fetchall()
        for row in rows:
            try:
                payload = json.loads(Path(row["token_path"]).read_text(encoding="utf-8"))
                encrypted = encrypt_google_credential(payload)
                conn.execute(
                    "UPDATE google_accounts SET credential_encrypted = ? WHERE id = ?",
                    (encrypted, row["id"]),
                )
            except Exception:
                continue


def _client_config() -> dict:
    try:
        return json.loads(CLIENT_SECRET_PATH.read_text())
    except Exception:
        return {}


def _authorized_redirect_uris() -> list[str]:
    config = _client_config()
    section = config.get("web") or config.get("installed") or {}
    uris = section.get("redirect_uris") or []
    return [uri for uri in uris if isinstance(uri, str) and uri]


def _request_origin(request: Request) -> str:
    origin = (request.headers.get("origin") or "").rstrip("/")
    if origin:
        return origin
    referer = request.headers.get("referer") or ""
    if referer:
        parsed = urlparse(referer)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto}://{host}".rstrip("/")


def _choose_redirect_uri(request: Request) -> tuple[str, str, str | None]:
    authorized = set(_authorized_redirect_uris())
    api_redirect = f"{_request_origin(request)}{API_CALLBACK_PATH}"
    if api_redirect in authorized:
        return api_redirect, "api", None
    if REDIRECT_URI in authorized:
        return REDIRECT_URI, "local", api_redirect
    if authorized:
        return sorted(authorized)[0], "registered", api_redirect
    return REDIRECT_URI, "local", api_redirect


def _client_is_web_app() -> bool:
    return "web" in _client_config()


def _normalize_authorized_user_payload(payload: dict) -> dict:
    normalized = dict(payload)
    normalized.setdefault("type", "authorized_user")
    return normalized


def _safe_email_filename(email: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "_", email.strip().lower())
    return stem or f"account_{uuid.uuid4().hex}"


def _extract_code_and_state(callback: str, fallback_scopes: list[str] | None = None) -> tuple[str, str | None, list[str]]:
    value = (callback or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="Missing OAuth callback URL or code")
    fallback = fallback_scopes or list(SCOPES)
    if not value.startswith("http"):
        return value, None, fallback

    parsed = urlparse(value)
    params = parse_qs(parsed.query)
    if "error" in params:
        raise HTTPException(status_code=400, detail=params.get("error_description", params["error"])[0])
    if "code" not in params:
        raise HTTPException(status_code=400, detail="Callback URL has no code parameter")
    scope_val = (params.get("scope") or [""])[0].strip()
    scopes = scope_val.split() if scope_val else fallback
    return params["code"][0], (params.get("state") or [None])[0], scopes


def _account_dict(row) -> dict:
    scopes = []
    try:
        scopes = json.loads(row["scopes_json"] or "[]")
    except Exception:
        scopes = []
    missing_scopes = [scope for scope in SCOPES if scope not in set(scopes)]
    missing_photo_scopes = [scope for scope in PHOTO_SCOPES if scope not in set(scopes)]
    return {
        "id": row["id"],
        "email": row["email"],
        "scopes": scopes,
        "missingScopes": missing_scopes,
        "missingScopeLabels": [SCOPE_LABELS.get(scope, scope) for scope in missing_scopes],
        "workspaceReady": not missing_scopes,
        "photosReady": not missing_photo_scopes,
        "photosMissingScopes": missing_photo_scopes,
        "photosMissingScopeLabels": [SCOPE_LABELS.get(scope, scope) for scope in missing_photo_scopes],
        "enabledForAgent": bool(row["enabled_for_agent"]),
        "isDefault": bool(row["is_default"]),
        "lastStatus": row["last_status"],
        "lastError": row["last_error"] or "",
        "updatedAt": row["updated_at"],
    }


def _has_refresh_token(credential_encrypted: str, token_path: str) -> bool:
    payload = decrypt_google_credential(credential_encrypted)
    if payload.get("refresh_token"):
        return True
    try:
        payload = json.loads(Path(token_path).read_text())
        return bool(payload.get("refresh_token"))
    except Exception:
        return False


def _inventory_rows(uid: str) -> list[dict]:
    with get_connection() as conn:
        connected = conn.execute(
            "SELECT email FROM google_accounts WHERE user_id = ?",
            (uid,),
        ).fetchall()
        for row in connected:
            conn.execute(
                """
                INSERT OR IGNORE INTO google_account_inventory (id, user_id, email)
                VALUES (?, ?, ?)
                """,
                (str(uuid.uuid4()), uid, row["email"].strip().lower()),
            )
        rows = conn.execute(
            """
            SELECT
              inventory.id,
              inventory.email,
              inventory.created_at,
              account.id AS account_id,
              account.token_path,
              account.credential_encrypted,
              account.last_status,
              account.last_error
            FROM google_account_inventory AS inventory
            LEFT JOIN google_accounts AS account
              ON account.user_id = inventory.user_id
             AND account.email = inventory.email
            WHERE inventory.user_id = ?
            ORDER BY inventory.email ASC
            """,
            (uid,),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "email": row["email"],
            "connected": bool(row["account_id"]),
            "storedInDb": bool(row["credential_encrypted"]),
            "autoAccess": bool(row["account_id"]) and _has_refresh_token(
                row["credential_encrypted"] or "",
                row["token_path"] or "",
            ),
            "accountId": row["account_id"] or "",
            "lastStatus": row["last_status"] or "not_connected",
            "lastError": row["last_error"] or "",
            "createdAt": row["created_at"],
        }
        for row in rows
    ]


def _copy_to_active_token(token_path: str) -> None:
    src = Path(token_path)
    if not src.exists():
        return
    ACTIVE_TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    ACTIVE_TOKEN_PATH.write_text(src.read_text())
    try:
        os.chmod(ACTIVE_TOKEN_PATH, 0o600)
    except Exception:
        pass


def _store_oauth_result(state: str, user_id: str, status: str, account: dict | None = None, error: str = "") -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO google_oauth_results (state, user_id, status, account_json, error, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(state) DO UPDATE SET
              status = excluded.status,
              account_json = excluded.account_json,
              error = excluded.error,
              updated_at = CURRENT_TIMESTAMP
            """,
            (state, user_id, status, json.dumps(account or {}, ensure_ascii=False), error),
        )


def _exchange_pending_callback(*, uid: str, state: str, callback: str) -> dict:
    with get_connection() as conn:
        pending = conn.execute(
            "SELECT * FROM google_oauth_pending WHERE state = ? AND user_id = ?",
            (state, uid),
        ).fetchone()
    if not pending:
        raise HTTPException(status_code=400, detail="OAuth session expired. Start again.")

    try:
        requested_scopes = json.loads(pending["scopes_json"] or "[]")
    except Exception:
        requested_scopes = []
    if not requested_scopes:
        requested_scopes = list(SCOPES)
    code, returned_state, granted_scopes = _extract_code_and_state(callback, requested_scopes)
    if returned_state and returned_state != state:
        raise HTTPException(status_code=400, detail="OAuth state mismatch. Start again.")

    try:
        from google_auth_oauthlib.flow import Flow
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request as GoogleRequest
        from googleapiclient.discovery import build
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Google API libraries are not installed: {exc}")

    flow_kwargs = {
        "client_secrets_file": str(CLIENT_SECRET_PATH),
        "scopes": granted_scopes,
        "redirect_uri": pending["redirect_uri"] or REDIRECT_URI,
        "state": state,
    }
    if pending["code_verifier"]:
        flow_kwargs["code_verifier"] = pending["code_verifier"]
    flow = Flow.from_client_secrets_file(**flow_kwargs)

    try:
        os.environ["OAUTHLIB_RELAX_TOKEN_SCOPE"] = "1"
        flow.fetch_token(code=code)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {exc}")

    token_payload = _normalize_authorized_user_payload(json.loads(flow.credentials.to_json()))
    if _client_is_web_app():
        try:
            web = _client_config().get("web", {})
            token_payload.setdefault("client_id", web.get("client_id"))
            token_payload.setdefault("client_secret", web.get("client_secret"))
        except Exception:
            pass
    if flow.credentials.granted_scopes:
        token_payload["scopes"] = list(flow.credentials.granted_scopes)
    elif granted_scopes:
        token_payload["scopes"] = granted_scopes

    creds = Credentials.from_authorized_user_info(token_payload, token_payload.get("scopes") or SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(GoogleRequest())
    try:
        profile = build("gmail", "v1", credentials=creds, cache_discovery=False).users().getProfile(userId="me").execute()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read Gmail profile: {exc}")

    email = (profile.get("emailAddress") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Google did not return an email address")

    ACCOUNT_TOKEN_DIR.mkdir(parents=True, exist_ok=True)
    token_path = ACCOUNT_TOKEN_DIR / f"{_safe_email_filename(email)}.json"
    token_path.write_text(json.dumps(token_payload, indent=2))
    try:
        os.chmod(token_path, 0o600)
    except Exception:
        pass

    account_id = str(uuid.uuid4())
    scopes_json = json.dumps(token_payload.get("scopes") or [], ensure_ascii=False)
    credential_encrypted = encrypt_google_credential(token_payload)
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM google_accounts WHERE user_id = ? AND email = ?",
            (uid, email),
        ).fetchone()
        if existing:
            account_id = existing["id"]
        has_default = conn.execute(
            "SELECT 1 FROM google_accounts WHERE user_id = ? AND is_default = 1",
            (uid,),
        ).fetchone()
        is_default = 0 if has_default else 1
        conn.execute(
            """
            INSERT INTO google_accounts
              (id, user_id, email, token_path, credential_encrypted, scopes_json, enabled_for_agent, is_default, last_status, last_error, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'connected', '', CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, email) DO UPDATE SET
              token_path = excluded.token_path,
              credential_encrypted = excluded.credential_encrypted,
              scopes_json = excluded.scopes_json,
              enabled_for_agent = 1,
              last_status = 'connected',
              last_error = '',
              updated_at = CURRENT_TIMESTAMP
            """,
            (account_id, uid, email, str(token_path), credential_encrypted, scopes_json, is_default),
        )
        conn.execute(
            """
            INSERT INTO google_account_inventory (id, user_id, email, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, email) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
            """,
            (str(uuid.uuid4()), uid, email),
        )
        conn.execute("DELETE FROM google_oauth_pending WHERE state = ?", (state,))
        row = conn.execute("SELECT * FROM google_accounts WHERE id = ?", (account_id,)).fetchone()

    if row and row["is_default"]:
        _copy_to_active_token(str(token_path))
    return _account_dict(row)


def _http_error_detail(exc: Exception) -> str:
    if isinstance(exc, HTTPException):
        return str(exc.detail)
    return str(exc)


def _ensure_callback_server() -> None:
    global _callback_server
    with _callback_lock:
        if _callback_server:
            return

        class OAuthCallbackHandler(BaseHTTPRequestHandler):
            def log_message(self, format, *args):
                return

            def do_GET(self):
                parsed = urlparse(self.path)
                if parsed.path != "/oauth2callback":
                    self.send_response(404)
                    self.end_headers()
                    self.wfile.write(b"Not found")
                    return

                params = parse_qs(parsed.query)
                state = (params.get("state") or [""])[0]
                status = "error"
                message = "OAuth callback failed."
                if not state:
                    message = "Missing OAuth state."
                else:
                    try:
                        _init_tables()
                        with get_connection() as conn:
                            pending = conn.execute(
                                "SELECT user_id FROM google_oauth_pending WHERE state = ?",
                                (state,),
                            ).fetchone()
                        if not pending:
                            raise HTTPException(status_code=400, detail="OAuth session expired. Start again.")
                        redirect_uri = REDIRECT_URI
                        try:
                            with get_connection() as conn:
                                pending_row = conn.execute(
                                    "SELECT redirect_uri FROM google_oauth_pending WHERE state = ?",
                                    (state,),
                                ).fetchone()
                                redirect_uri = pending_row["redirect_uri"] or REDIRECT_URI
                        except Exception:
                            pass
                        account = _exchange_pending_callback(
                            uid=pending["user_id"],
                            state=state,
                            callback=f"{redirect_uri}?{parsed.query}",
                        )
                        _store_oauth_result(state, pending["user_id"], "success", account=account)
                        status = "success"
                        message = f"Google connected: {account.get('email', '')}"
                    except Exception as exc:
                        error = _http_error_detail(exc)
                        user_id = ""
                        try:
                            with get_connection() as conn:
                                pending = conn.execute(
                                    "SELECT user_id FROM google_oauth_pending WHERE state = ?",
                                    (state,),
                                ).fetchone()
                                user_id = pending["user_id"] if pending else ""
                        except Exception:
                            pass
                        if user_id:
                            _store_oauth_result(state, user_id, "error", error=error)
                        message = error

                html = f"""
                <!doctype html>
                <html><head><meta charset="utf-8"><title>Google OAuth</title></head>
                <body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:32px">
                  <h2>{'Google connected' if status == 'success' else 'Google OAuth failed'}</h2>
                  <p>{message}</p>
                  <p>You can close this tab and return to HAgent.</p>
                  <script>setTimeout(() => window.close(), 1200)</script>
                </body></html>
                """.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(html)))
                self.end_headers()
                self.wfile.write(html)

        try:
            _callback_server = ThreadingHTTPServer((CALLBACK_HOST, CALLBACK_PORT), OAuthCallbackHandler)
        except OSError as exc:
            raise HTTPException(status_code=409, detail=f"OAuth callback port {CALLBACK_PORT} is not available: {exc}")
        thread = threading.Thread(target=_callback_server.serve_forever, name="google-oauth-callback", daemon=True)
        thread.start()


@router.get("")
async def list_accounts(request: Request):
    _init_tables()
    uid = _get_user_id(request)
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM google_accounts
            WHERE user_id = ?
            ORDER BY is_default DESC, email ASC
            """,
            (uid,),
        ).fetchall()
    return {"accounts": [_account_dict(row) for row in rows], "clientSecretReady": CLIENT_SECRET_PATH.exists()}


@router.get("/inventory")
async def list_inventory(request: Request):
    _init_tables()
    uid = _get_user_id(request)
    return {
        "items": _inventory_rows(uid),
        "clientSecretReady": CLIENT_SECRET_PATH.exists(),
        "keepalive": get_google_email_keepalive_status(uid),
    }


@router.post("/inventory")
async def add_inventory(body: GmailInventoryBody, request: Request):
    _init_tables()
    uid = _get_user_id(request)
    valid: list[str] = []
    invalid: list[str] = []
    for raw in body.emails:
        email = str(raw or "").strip().lower()
        if not email:
            continue
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            invalid.append(email)
            continue
        if email not in valid:
            valid.append(email)
    with get_connection() as conn:
        for email in valid:
            conn.execute(
                """
                INSERT INTO google_account_inventory (id, user_id, email, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id, email) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
                """,
                (str(uuid.uuid4()), uid, email),
            )
    return {"items": _inventory_rows(uid), "added": len(valid), "invalid": invalid}


@router.delete("/inventory/{item_id}")
async def delete_inventory(item_id: str, request: Request):
    _init_tables()
    uid = _get_user_id(request)
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT inventory.id, account.id AS account_id
            FROM google_account_inventory AS inventory
            LEFT JOIN google_accounts AS account
              ON account.user_id = inventory.user_id
             AND account.email = inventory.email
            WHERE inventory.id = ? AND inventory.user_id = ?
            """,
            (item_id, uid),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Gmail không tồn tại trong danh sách")
        if row["account_id"]:
            raise HTTPException(status_code=400, detail="Gỡ quyền Google trước khi xoá Gmail đã kết nối")
        conn.execute("DELETE FROM google_account_inventory WHERE id = ?", (item_id,))
    return {"ok": True}


@router.post("/auth-url")
async def create_auth_url(request: Request, body: AuthUrlBody | None = None):
    _init_tables()
    uid = _get_user_id(request)
    if not CLIENT_SECRET_PATH.exists():
        raise HTTPException(status_code=400, detail="Missing Google client secret")
    requested_scopes = _requested_scopes(body.scope_group if body else "")
    redirect_uri, callback_mode, required_redirect_uri = _choose_redirect_uri(request)
    if callback_mode == "local":
        _ensure_callback_server()

    try:
        from google_auth_oauthlib.flow import Flow
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Google OAuth libraries are not installed: {exc}")

    use_pkce = not _client_is_web_app()
    flow = Flow.from_client_secrets_file(
        str(CLIENT_SECRET_PATH),
        scopes=requested_scopes,
        redirect_uri=redirect_uri,
        autogenerate_code_verifier=use_pkce,
    )
    auth_params = {"access_type": "offline", "prompt": "consent select_account"}
    login_hint = (body.email if body else "").strip().lower()
    if login_hint:
        auth_params["login_hint"] = login_hint
    auth_url, state = flow.authorization_url(**auth_params)
    with get_connection() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO google_oauth_pending (state, user_id, code_verifier, redirect_uri, scopes_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                state,
                uid,
                flow.code_verifier if use_pkce else "",
                redirect_uri,
                json.dumps(requested_scopes, ensure_ascii=False),
                time.time(),
            ),
        )
    return {
        "authUrl": auth_url,
        "state": state,
        "scopeGroup": body.scope_group if body else "workspace",
        "redirectUri": redirect_uri,
        "callbackMode": callback_mode,
        "requiredRedirectUri": required_redirect_uri,
        "redirectUriRegistered": required_redirect_uri is None or required_redirect_uri in set(_authorized_redirect_uris()),
    }


@router.get("/oauth2callback")
async def oauth2callback(request: Request):
    _init_tables()
    state = request.query_params.get("state", "")
    if not state:
        raise HTTPException(status_code=400, detail="Missing OAuth state")
    with get_connection() as conn:
        pending = conn.execute(
            "SELECT user_id, redirect_uri FROM google_oauth_pending WHERE state = ?",
            (state,),
        ).fetchone()
    if not pending:
        raise HTTPException(status_code=400, detail="OAuth session expired. Start again.")
    redirect_uri = pending["redirect_uri"] or f"{_request_origin(request)}{API_CALLBACK_PATH}"
    try:
        account = _exchange_pending_callback(
            uid=pending["user_id"],
            state=state,
            callback=f"{redirect_uri}?{request.url.query}",
        )
        _store_oauth_result(state, pending["user_id"], "success", account=account)
        message = f"Google connected: {account.get('email', '')}"
        title = "Google connected"
    except Exception as exc:
        error = _http_error_detail(exc)
        _store_oauth_result(state, pending["user_id"], "error", error=error)
        message = error
        title = "Google OAuth failed"
    return HTMLResponse(
        f"""
        <!doctype html>
        <html><head><meta charset="utf-8"><title>Google OAuth</title></head>
        <body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:32px">
          <h2>{title}</h2>
          <p>{message}</p>
          <p>You can close this tab and return to HAgent.</p>
          <script>setTimeout(() => window.close(), 1200)</script>
        </body></html>
        """
    )


@router.get("/pending/{state}")
async def get_oauth_pending_status(state: str, request: Request):
    _init_tables()
    uid = _get_user_id(request)
    with get_connection() as conn:
        result = conn.execute(
            "SELECT * FROM google_oauth_results WHERE state = ? AND user_id = ?",
            (state, uid),
        ).fetchone()
        if result:
            account = {}
            try:
                account = json.loads(result["account_json"] or "{}")
            except Exception:
                account = {}
            return {
                "status": result["status"],
                "account": account,
                "error": result["error"] or "",
            }
        pending = conn.execute(
            "SELECT state FROM google_oauth_pending WHERE state = ? AND user_id = ?",
            (state, uid),
        ).fetchone()
    return {"status": "pending" if pending else "expired"}


@router.post("/exchange")
async def exchange_code(body: ExchangeBody, request: Request):
    _init_tables()
    uid = _get_user_id(request)
    try:
        account = _exchange_pending_callback(uid=uid, state=body.state, callback=body.callback)
        _store_oauth_result(body.state, uid, "success", account=account)
    except Exception as exc:
        _store_oauth_result(body.state, uid, "error", error=_http_error_detail(exc))
        raise
    return {"ok": True, "account": account}


@router.post("/{account_id}/default")
async def set_default(account_id: str, request: Request):
    _init_tables()
    uid = _get_user_id(request)
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM google_accounts WHERE id = ? AND user_id = ?",
            (account_id, uid),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Account not found")
        conn.execute("UPDATE google_accounts SET is_default = 0 WHERE user_id = ?", (uid,))
        conn.execute(
            "UPDATE google_accounts SET is_default = 1, enabled_for_agent = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (account_id,),
        )
    _copy_to_active_token(row["token_path"])
    return {"ok": True}


@router.put("/{account_id}/permission")
async def update_permission(account_id: str, body: PermissionBody, request: Request):
    _init_tables()
    uid = _get_user_id(request)
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM google_accounts WHERE id = ? AND user_id = ?",
            (account_id, uid),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Account not found")
        if row["is_default"] and not body.enabled:
            raise HTTPException(status_code=400, detail="Default account must stay enabled for the agent")
        conn.execute(
            "UPDATE google_accounts SET enabled_for_agent = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (1 if body.enabled else 0, account_id),
        )
    return {"ok": True}


@router.delete("/{account_id}")
async def delete_account(account_id: str, request: Request):
    _init_tables()
    uid = _get_user_id(request)
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM google_accounts WHERE id = ? AND user_id = ?",
            (account_id, uid),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Account not found")
        conn.execute("DELETE FROM google_accounts WHERE id = ?", (account_id,))
        next_default = conn.execute(
            "SELECT * FROM google_accounts WHERE user_id = ? AND enabled_for_agent = 1 ORDER BY email ASC LIMIT 1",
            (uid,),
        ).fetchone()
        if next_default:
            conn.execute("UPDATE google_accounts SET is_default = 1 WHERE id = ?", (next_default["id"],))
    try:
        Path(row["token_path"]).unlink(missing_ok=True)
    except Exception:
        pass
    if next_default:
        _copy_to_active_token(next_default["token_path"])
    elif row["is_default"]:
        ACTIVE_TOKEN_PATH.unlink(missing_ok=True)
    return {"ok": True}
