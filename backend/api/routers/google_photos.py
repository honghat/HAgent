from __future__ import annotations

import asyncio
import json
import uuid
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from api.routers.google_accounts import (
    CLIENT_SECRET_PATH,
    PHOTO_SCOPES,
    SCOPE_LABELS,
    _init_tables as init_google_account_tables,
)
from api.services.db import get_connection
from api.services.google_credential_store import encrypt_google_credential, load_google_credential
from api.services.user_store import resolve_user_id


router = APIRouter(prefix="/api/google/photos", tags=["google-photos"])

PHOTOS_API = "https://photoslibrary.googleapis.com/v1"
PICKER_API = "https://photospicker.googleapis.com/v1"
PHOTO_READ_SCOPES = [PHOTO_SCOPES[0]]
PHOTO_EDIT_SCOPES = [PHOTO_SCOPES[1]]
PHOTO_PICKER_SCOPES = [PHOTO_SCOPES[2]]
PICKER_MEDIA_CACHE_LIMIT = 5000
_PICKER_MEDIA_CACHE: dict[tuple[str, str, str], dict[str, Any]] = {}


class AlbumRemoveBody(BaseModel):
    account_id: str = ""
    media_item_ids: list[str] = Field(default_factory=list)
    confirm_remove: bool = False


class PickerSessionCreateBody(BaseModel):
    account_id: str = ""
    max_item_count: int = Field(default=2000, ge=1, le=2000)


def _get_user_id(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    token = auth.replace("Bearer ", "").strip() or request.query_params.get("t", "")
    uid = resolve_user_id(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return uid


def _parse_scopes(row) -> list[str]:
    try:
        scopes = json.loads(row["scopes_json"] or "[]")
        return scopes if isinstance(scopes, list) else []
    except Exception:
        return []


def _missing_scopes(row, required_scopes: list[str]) -> list[str]:
    granted = set(_parse_scopes(row))
    return [scope for scope in required_scopes if scope not in granted]


def _account_summary(row) -> dict[str, Any]:
    missing_photo_scopes = _missing_scopes(row, PHOTO_SCOPES)
    missing_app_created_scopes = _missing_scopes(row, [*PHOTO_READ_SCOPES, *PHOTO_EDIT_SCOPES])
    missing_picker_scopes = _missing_scopes(row, PHOTO_PICKER_SCOPES)
    return {
        "id": row["id"],
        "email": row["email"],
        "isDefault": bool(row["is_default"]),
        "enabledForAgent": bool(row["enabled_for_agent"]),
        "lastStatus": row["last_status"],
        "lastError": row["last_error"] or "",
        "photosReady": not missing_photo_scopes,
        "photosMissingScopes": missing_photo_scopes,
        "photosMissingScopeLabels": [SCOPE_LABELS.get(scope, scope) for scope in missing_photo_scopes],
        "appCreatedReady": not missing_app_created_scopes,
        "appCreatedMissingScopes": missing_app_created_scopes,
        "appCreatedMissingScopeLabels": [SCOPE_LABELS.get(scope, scope) for scope in missing_app_created_scopes],
        "pickerReady": not missing_picker_scopes,
        "pickerMissingScopes": missing_picker_scopes,
        "pickerMissingScopeLabels": [SCOPE_LABELS.get(scope, scope) for scope in missing_picker_scopes],
        "updatedAt": row["updated_at"],
    }


def _account_row(uid: str, account_id: str = ""):
    with get_connection() as conn:
        if account_id:
            row = conn.execute(
                "SELECT * FROM google_accounts WHERE id = ? AND user_id = ?",
                (account_id, uid),
            ).fetchone()
        else:
            row = conn.execute(
                """
                SELECT * FROM google_accounts
                WHERE user_id = ?
                ORDER BY is_default DESC, updated_at DESC, email ASC
                LIMIT 1
                """,
                (uid,),
            ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Chưa kết nối tài khoản Google")
    return row


def _require_scopes(row, required_scopes: list[str]) -> None:
    missing = _missing_scopes(row, required_scopes)
    if missing:
        labels = ", ".join(SCOPE_LABELS.get(scope, scope) for scope in missing)
        raise HTTPException(
            status_code=403,
            detail=f"Tài khoản cần cấp thêm quyền Google Photos: {labels}",
        )


def _client_secret_section() -> dict[str, Any]:
    try:
        config = json.loads(CLIENT_SECRET_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}
    section = config.get("web") or config.get("installed") or {}
    return section if isinstance(section, dict) else {}


def _credential_payload(row) -> dict[str, Any]:
    payload = load_google_credential(row["token_path"])
    if not payload:
        raise HTTPException(status_code=400, detail="Không đọc được Google credential đã lưu")
    section = _client_secret_section()
    payload.setdefault("token_uri", "https://oauth2.googleapis.com/token")
    if section.get("client_id"):
        payload.setdefault("client_id", section["client_id"])
    if section.get("client_secret"):
        payload.setdefault("client_secret", section["client_secret"])
    return payload


def _persist_credential(row, payload: dict[str, Any]) -> None:
    token_path = Path(row["token_path"])
    token_path.parent.mkdir(parents=True, exist_ok=True)
    token_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        token_path.chmod(0o600)
    except OSError:
        pass
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE google_accounts
            SET credential_encrypted = ?, scopes_json = ?, last_status = 'connected', last_error = '', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                encrypt_google_credential(payload),
                json.dumps(payload.get("scopes") or _parse_scopes(row), ensure_ascii=False),
                row["id"],
            ),
        )


def _valid_access_token_sync(row) -> str:
    try:
        from google.auth.transport.requests import Request as GoogleRequest
        from google.oauth2.credentials import Credentials
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Google API libraries are not installed: {exc}") from exc

    payload = _credential_payload(row)
    scopes = payload.get("scopes") or _parse_scopes(row)
    creds = Credentials.from_authorized_user_info(payload, scopes)
    if not creds.valid:
        if not creds.refresh_token:
            raise HTTPException(status_code=401, detail="Google credential thiếu refresh token. Hãy kết nối lại tài khoản.")
        try:
            creds.refresh(GoogleRequest())
        except Exception as exc:
            raise HTTPException(status_code=401, detail=f"Không refresh được Google Photos token: {exc}") from exc
        refreshed = json.loads(creds.to_json())
        if payload.get("refresh_token") and not refreshed.get("refresh_token"):
            refreshed["refresh_token"] = payload["refresh_token"]
        if scopes and not refreshed.get("scopes"):
            refreshed["scopes"] = scopes
        _persist_credential(row, refreshed)
    if not creds.token:
        raise HTTPException(status_code=401, detail="Google không trả access token")
    return creds.token


async def _access_token(row) -> str:
    return await asyncio.to_thread(_valid_access_token_sync, row)


def _google_error_message(response: httpx.Response) -> str:
    try:
        data = response.json()
        error = data.get("error") or {}
        message = error.get("message") or response.text
        status = error.get("status") or ""
    except Exception:
        message = response.text
        status = ""
    if response.status_code in {401, 403}:
        suffix = "Hãy cấp lại quyền Google Photos cho tài khoản này."
        return f"{message}. {suffix}" if message else suffix
    return status or message or "Google Photos API lỗi"


async def _photos_request(row, required_scopes: list[str], method: str, path: str, **kwargs) -> httpx.Response:
    _require_scopes(row, required_scopes)
    token = await _access_token(row)
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.request(method, f"{PHOTOS_API}{path}", headers=headers, **kwargs)
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=_google_error_message(response))
    return response


async def _picker_request(row, method: str, path: str, **kwargs) -> httpx.Response:
    _require_scopes(row, PHOTO_PICKER_SCOPES)
    token = await _access_token(row)
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.request(method, f"{PICKER_API}{path}", headers=headers, **kwargs)
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=_google_error_message(response))
    return response


def _media_size_param(value: str) -> str:
    size = (value or "w560-h420").strip()
    allowed = set("0123456789whc")
    if not size or len(size) > 32 or any(char not in allowed and char != "-" for char in size):
        return "w560-h420"
    return size


def _cache_picker_items(row, session_id: str, items: list[dict[str, Any]]) -> None:
    account_id = str(row["id"])
    for item in items:
        media_id = str(item.get("id") or "")
        if media_id:
            _PICKER_MEDIA_CACHE[(account_id, session_id, media_id)] = item
    overflow = len(_PICKER_MEDIA_CACHE) - PICKER_MEDIA_CACHE_LIMIT
    if overflow > 0:
        for key in list(_PICKER_MEDIA_CACHE)[:overflow]:
            _PICKER_MEDIA_CACHE.pop(key, None)


async def _picked_media_item(row, session_id: str, media_id: str) -> dict[str, Any]:
    cache_key = (str(row["id"]), session_id, media_id)
    cached = _PICKER_MEDIA_CACHE.get(cache_key)
    if cached:
        return cached
    page_token = ""
    for _ in range(25):
        params = {"sessionId": session_id, "pageSize": 100}
        if page_token:
            params["pageToken"] = page_token
        response = await _picker_request(row, "GET", "/mediaItems", params=params)
        data = response.json()
        items = data.get("mediaItems") or []
        _cache_picker_items(row, session_id, items)
        for item in items:
            if item.get("id") == media_id:
                return item
        page_token = data.get("nextPageToken", "")
        if not page_token:
            break
    raise HTTPException(status_code=404, detail="Không tìm thấy ảnh trong phiên Picker")


@router.get("/accounts")
async def list_photo_accounts(request: Request):
    init_google_account_tables()
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
    return {
        "accounts": [_account_summary(row) for row in rows],
        "clientSecretReady": CLIENT_SECRET_PATH.exists(),
        "appCreatedOnly": True,
    }


@router.post("/picker/sessions")
async def create_picker_session(body: PickerSessionCreateBody, request: Request):
    init_google_account_tables()
    uid = _get_user_id(request)
    row = _account_row(uid, body.account_id)
    payload = {"pickingConfig": {"maxItemCount": str(body.max_item_count)}}
    response = await _picker_request(
        row,
        "POST",
        "/sessions",
        params={"requestId": str(uuid.uuid4())},
        json=payload,
    )
    session = response.json()
    picker_uri = session.get("pickerUri", "")
    if picker_uri and not picker_uri.endswith("/autoclose"):
        session["pickerUri"] = f"{picker_uri.rstrip('/')}/autoclose"
    return {"session": session}


@router.get("/picker/sessions/{session_id}")
async def get_picker_session(session_id: str, request: Request, account_id: str = ""):
    init_google_account_tables()
    uid = _get_user_id(request)
    row = _account_row(uid, account_id)
    response = await _picker_request(row, "GET", f"/sessions/{session_id}")
    return {"session": response.json()}


@router.delete("/picker/sessions/{session_id}")
async def delete_picker_session(session_id: str, request: Request, account_id: str = ""):
    init_google_account_tables()
    uid = _get_user_id(request)
    row = _account_row(uid, account_id)
    await _picker_request(row, "DELETE", f"/sessions/{session_id}")
    return {"ok": True}


@router.get("/picker/media")
async def list_picker_media(
    request: Request,
    account_id: str = "",
    session_id: str = "",
    page_size: int = Query(50, ge=1, le=100),
    page_token: str = "",
):
    init_google_account_tables()
    uid = _get_user_id(request)
    row = _account_row(uid, account_id)
    if not session_id:
        raise HTTPException(status_code=400, detail="Thiếu session_id của Google Photos Picker")
    params = {"sessionId": session_id, "pageSize": page_size}
    if page_token:
        params["pageToken"] = page_token
    response = await _picker_request(row, "GET", "/mediaItems", params=params)
    data = response.json()
    items = data.get("mediaItems") or []
    _cache_picker_items(row, session_id, items)
    return {
        "mediaItems": items,
        "nextPageToken": data.get("nextPageToken", ""),
        "sessionId": session_id,
    }


@router.get("/picker/media-file")
async def picker_media_file(
    request: Request,
    account_id: str = "",
    session_id: str = "",
    media_id: str = "",
    size: str = "w560-h420",
):
    init_google_account_tables()
    uid = _get_user_id(request)
    if not session_id or not media_id:
        raise HTTPException(status_code=400, detail="Thiếu thông tin ảnh")
    row = _account_row(uid, account_id)
    item = await _picked_media_item(row, session_id, media_id)
    media_file = item.get("mediaFile") or {}
    base_url = media_file.get("baseUrl") or ""
    if not base_url:
        raise HTTPException(status_code=404, detail="Ảnh không có URL")
    token = await _access_token(row)
    image_url = f"{base_url}={_media_size_param(size)}"
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        response = await client.get(image_url, headers={"Authorization": f"Bearer {token}"})
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=_google_error_message(response))
    return Response(
        content=response.content,
        media_type=media_file.get("mimeType") or response.headers.get("content-type") or "image/jpeg",
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.get("/albums")
async def list_albums(
    request: Request,
    account_id: str = "",
    page_size: int = Query(50, ge=1, le=50),
    page_token: str = "",
):
    init_google_account_tables()
    uid = _get_user_id(request)
    row = _account_row(uid, account_id)
    params = {"pageSize": page_size}
    if page_token:
        params["pageToken"] = page_token
    response = await _photos_request(row, PHOTO_READ_SCOPES, "GET", "/albums", params=params)
    data = response.json()
    return {
        "albums": data.get("albums") or [],
        "nextPageToken": data.get("nextPageToken", ""),
        "appCreatedOnly": True,
    }


@router.get("/media")
async def list_media(
    request: Request,
    account_id: str = "",
    album_id: str = "",
    page_size: int = Query(48, ge=1, le=100),
    page_token: str = "",
):
    init_google_account_tables()
    uid = _get_user_id(request)
    row = _account_row(uid, account_id)
    if album_id:
        payload: dict[str, Any] = {"albumId": album_id, "pageSize": page_size}
        if page_token:
            payload["pageToken"] = page_token
        response = await _photos_request(row, PHOTO_READ_SCOPES, "POST", "/mediaItems:search", json=payload)
    else:
        params = {"pageSize": page_size}
        if page_token:
            params["pageToken"] = page_token
        response = await _photos_request(row, PHOTO_READ_SCOPES, "GET", "/mediaItems", params=params)
    data = response.json()
    return {
        "mediaItems": data.get("mediaItems") or [],
        "nextPageToken": data.get("nextPageToken", ""),
        "albumId": album_id,
        "appCreatedOnly": True,
    }


@router.post("/albums/{album_id}/remove")
async def remove_media_from_album(album_id: str, body: AlbumRemoveBody, request: Request):
    init_google_account_tables()
    uid = _get_user_id(request)
    row = _account_row(uid, body.account_id)
    media_ids = []
    seen: set[str] = set()
    for media_id in body.media_item_ids:
        value = str(media_id or "").strip()
        if value and value not in seen:
            seen.add(value)
            media_ids.append(value)
    if not body.confirm_remove:
        raise HTTPException(status_code=400, detail="Thiếu xác nhận xoá khỏi album")
    if not media_ids:
        raise HTTPException(status_code=400, detail="Chưa chọn ảnh để xoá khỏi album")
    if len(media_ids) > 50:
        raise HTTPException(status_code=400, detail="Google Photos chỉ cho gỡ tối đa 50 media item mỗi lần")
    await _photos_request(
        row,
        PHOTO_EDIT_SCOPES,
        "POST",
        f"/albums/{album_id}:batchRemoveMediaItems",
        json={"mediaItemIds": media_ids},
    )
    return {
        "ok": True,
        "removedCount": len(media_ids),
        "message": "Đã gỡ ảnh khỏi album. Ảnh không bị xoá vĩnh viễn khỏi Google Photos.",
    }


@router.delete("/media/{media_item_id}")
async def delete_media_item(media_item_id: str, request: Request):
    _get_user_id(request)
    raise HTTPException(
        status_code=400,
        detail="Không hỗ trợ xoá vĩnh viễn qua Google Photos API",
    )
