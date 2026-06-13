"""User and auth store — operates on shared data/hagent.db."""

import sqlite3
import hashlib
import secrets
import uuid
from pathlib import Path
from typing import Optional, Dict, Any, List

import bcrypt
import yaml

from api.services.db import get_connection

DEFAULT_USERNAME = "hat"
DEFAULT_SESSION_TOKEN = "hat"
DEFAULT_PASSWORD = "Thaco@2018"


def init_user_tables():
    with get_connection() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL, display_name TEXT DEFAULT '',
                default_provider TEXT DEFAULT 'deepseek',
                claude_mode TEXT DEFAULT 'qwen',
                default_agent TEXT DEFAULT '',
                email TEXT DEFAULT '',
                avatar TEXT DEFAULT '',
                account_status TEXT DEFAULT 'active',
                expires_at TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')), expires_at TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS devices (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                secret_hash TEXT DEFAULT '',
                device_name TEXT DEFAULT '',
                user_agent TEXT DEFAULT '',
                first_ip_address TEXT DEFAULT '',
                last_ip_address TEXT DEFAULT '',
                status TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT (datetime('now')),
                last_active TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_devices_user_last_active
                ON devices(user_id, last_active DESC);
            CREATE TABLE IF NOT EXISTS custom_providers (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
                name TEXT NOT NULL, label TEXT NOT NULL,
                type TEXT DEFAULT 'openai', base_url TEXT DEFAULT '',
                api_key TEXT DEFAULT '', model TEXT DEFAULT '',
                context_length INTEGER DEFAULT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, name)
            );
        """)
        for col, ddl in [
            ("default_provider", "TEXT DEFAULT 'deepseek'"),
            ("claude_mode", "TEXT DEFAULT 'qwen'"),
            ("default_agent", "TEXT DEFAULT ''"),
            ("pinned_folders", "TEXT DEFAULT '[]'"),
            ("email", "TEXT DEFAULT ''"),
            ("avatar", "TEXT DEFAULT ''"),
            ("account_status", "TEXT DEFAULT 'active'"),
            ("expires_at", "TEXT DEFAULT ''"),
            ("role", "TEXT DEFAULT 'user'"),
        ]:
            existing = {r["name"] for r in conn.execute("PRAGMA table_info(users)").fetchall()}
            if col not in existing:
                conn.execute(f"ALTER TABLE users ADD COLUMN {col} {ddl}")
        existing_provider_cols = {r["name"] for r in conn.execute("PRAGMA table_info(custom_providers)").fetchall()}
        if "context_length" not in existing_provider_cols:
            conn.execute("ALTER TABLE custom_providers ADD COLUMN context_length INTEGER DEFAULT NULL")
        existing_session_cols = {r["name"] for r in conn.execute("PRAGMA table_info(sessions)").fetchall()}
        for col, ddl in [
            ("ip_address", "TEXT DEFAULT ''"),
            ("user_agent", "TEXT DEFAULT ''"),
            ("device_name", "TEXT DEFAULT ''"),
            ("device_id", "TEXT DEFAULT ''"),
            ("last_active", "TEXT"),
            ("status", "TEXT DEFAULT 'approved'"),
        ]:
            if col not in existing_session_cols:
                conn.execute(f"ALTER TABLE sessions ADD COLUMN {col} {ddl}")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user_device ON sessions(user_id, device_id)")
        existing_device_cols = {r["name"] for r in conn.execute("PRAGMA table_info(devices)").fetchall()}
        for col, ddl in [
            ("secret_hash", "TEXT DEFAULT ''"),
            ("device_name", "TEXT DEFAULT ''"),
            ("user_agent", "TEXT DEFAULT ''"),
            ("first_ip_address", "TEXT DEFAULT ''"),
            ("last_ip_address", "TEXT DEFAULT ''"),
            ("status", "TEXT DEFAULT 'pending'"),
            ("last_active", "TEXT"),
        ]:
            if col not in existing_device_cols:
                conn.execute(f"ALTER TABLE devices ADD COLUMN {col} {ddl}")
        if "last_active" in {r["name"] for r in conn.execute("PRAGMA table_info(sessions)").fetchall()}:
            conn.execute("UPDATE sessions SET last_active = created_at WHERE last_active IS NULL")
        conn.execute("UPDATE devices SET last_active = created_at WHERE last_active IS NULL")
        _backfill_legacy_devices(conn)
    ensure_default_user()


def _backfill_legacy_devices(conn) -> None:
    rows = conn.execute(
        """
        SELECT id, user_id, ip_address, user_agent, device_name, created_at, last_active, status
        FROM sessions
        WHERE (device_id IS NULL OR device_id = '')
          AND (
            COALESCE(device_name, '') != ''
            OR COALESCE(user_agent, '') != ''
            OR COALESCE(ip_address, '') != ''
          )
        """
    ).fetchall()
    for row in rows:
        user_agent = row["user_agent"] or ""
        device_name = row["device_name"] or _parse_device_name(user_agent) or "Thiết bị cũ"
        fingerprint = hashlib.sha256(
            f"{row['user_id']}\0{device_name}\0{user_agent}".encode("utf-8")
        ).hexdigest()[:24]
        device_id = f"legacy-{fingerprint}"
        last_active = row["last_active"] or row["created_at"]
        status = row["status"] or "approved"
        existing = conn.execute("SELECT status, last_active FROM devices WHERE id = ?", (device_id,)).fetchone()
        if existing:
            merged_status = "approved" if "approved" in {existing["status"], status} else status
            merged_last_active = max(existing["last_active"] or "", last_active or "")
            conn.execute(
                """
                UPDATE devices
                SET device_name = ?, user_agent = ?, last_ip_address = ?,
                    status = ?, last_active = ?
                WHERE id = ?
                """,
                (device_name, user_agent, row["ip_address"] or "", merged_status, merged_last_active, device_id),
            )
        else:
            conn.execute(
                """
                INSERT INTO devices
                  (id, user_id, device_name, user_agent, first_ip_address, last_ip_address,
                   status, created_at, last_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    device_id,
                    row["user_id"],
                    device_name,
                    user_agent,
                    row["ip_address"] or "",
                    row["ip_address"] or "",
                    status,
                    row["created_at"],
                    last_active,
                ),
            )
        conn.execute("UPDATE sessions SET device_id = ? WHERE id = ?", (device_id, row["id"]))


def ensure_default_user():
    """Seed the default user if not exists (matching Node's db.js)."""
    with get_connection() as conn:
        user = conn.execute("SELECT id FROM users WHERE username = ?", (DEFAULT_USERNAME,)).fetchone()
        if not user:
            pw_hash = bcrypt.hashpw(DEFAULT_PASSWORD.encode(), bcrypt.gensalt()).decode()
            conn.execute(
                "INSERT INTO users (id, username, password_hash, display_name, default_provider, claude_mode, role) VALUES (?,?,?,?,?,?,?)",
                (DEFAULT_USERNAME, DEFAULT_USERNAME, pw_hash, "Anh Hat", "lmstudio_local", "lmstudio_local", "admin"),
            )
            user_id = DEFAULT_USERNAME
        else:
            user_id = user["id"]
        # Default user luôn là admin (không bị giới hạn thiết bị).
        conn.execute("UPDATE users SET role = 'admin' WHERE id = ?", (user_id,))
        conn.execute(
            "INSERT OR REPLACE INTO sessions (id, user_id, status) VALUES (?, ?, 'approved')",
            (DEFAULT_SESSION_TOKEN, user_id),
        )


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, stored: str) -> bool:
    return bcrypt.checkpw(password.encode(), stored.encode() if isinstance(stored, str) else stored)


def _hash_device_secret(secret: str) -> str:
    return bcrypt.hashpw(secret.encode(), bcrypt.gensalt()).decode()


def _verify_device_secret(secret: str, stored: str) -> bool:
    if not secret or not stored:
        return False
    try:
        return bcrypt.checkpw(secret.encode(), stored.encode() if isinstance(stored, str) else stored)
    except Exception:
        return False


def _new_device_secret() -> str:
    return secrets.token_urlsafe(32)


def _new_device_id() -> str:
    return f"dev_{uuid.uuid4().hex}"


def create_user(username: str, password: str, display_name: str = None) -> dict:
    if get_user_by_username(username):
        raise ValueError("Username already exists")
    uid = str(uuid.uuid4())
    with get_connection() as conn:
        conn.execute("INSERT INTO users (id, username, password_hash, display_name) VALUES (?,?,?,?)",
                     (uid, username, _hash_password(password), display_name or username))
    return {"id": uid, "username": username, "displayName": display_name or username}


def get_user_by_username(username: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    return dict(row) if row else None


def get_user_by_id(user_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id, username, display_name, created_at, default_provider,
                   claude_mode, default_agent, pinned_folders, email, avatar,
                   account_status, expires_at, role
            FROM users
            WHERE id = ?
            """,
            (user_id,)).fetchone()
    return dict(row) if row else None


def get_user_role(user_id: str) -> str:
    with get_connection() as conn:
        row = conn.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
    return (row["role"] if row and row["role"] else "user")


def is_admin(user_id: str) -> bool:
    return get_user_role(user_id) == "admin"


def is_user_active(user_id: str) -> bool:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id
            FROM users
            WHERE id = ?
              AND COALESCE(account_status, 'active') NOT IN ('disabled', 'expired', 'revoked', 'deleted')
              AND (
                expires_at IS NULL
                OR trim(expires_at) = ''
                OR datetime(expires_at) > datetime('now')
              )
            """,
            (user_id,),
        ).fetchone()
    return bool(row)


def update_user(user_id: str, updates: dict) -> None:
    fields, params = [], []
    for key, val in updates.items():
        if key == "password":
            fields.append("password_hash = ?")
            params.append(_hash_password(val))
        elif key == "displayName":
            fields.append("display_name = ?")
            params.append(val)
        elif key == "username":
            fields.append("username = ?")
            params.append(val)
        elif key in ("default_provider", "claude_mode", "default_agent", "pinned_folders", "account_status", "expires_at"):
            fields.append(f"{key} = ?")
            params.append(val)
        else:
            fields.append(f"{key} = ?")
            params.append(val)
    if not fields:
        return
    fields.append("updated_at = datetime('now')")
    params.append(user_id)
    with get_connection() as conn:
        conn.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", params)


def authenticate_user(username: str, password: str) -> dict | None:
    user = get_user_by_username(username)
    if user and _verify_password(password, user["password_hash"]) and is_user_active(user["id"]):
        return user
    return None


def _device_payload(row, generated_secret: str | None = None) -> dict:
    data = dict(row) if row else {}
    if generated_secret:
        data["device_secret"] = generated_secret
    return data


def upsert_login_device(
    user_id: str,
    device_id: str | None = None,
    device_secret: str | None = None,
    ip_address: str = "",
    user_agent: str = "",
    trusted: bool = False,
) -> dict:
    clean_device_id = (device_id or "").strip()
    clean_secret = (device_secret or "").strip()
    generated_secret = ""
    if not clean_device_id:
        clean_device_id = _new_device_id()
    if not clean_secret:
        clean_secret = _new_device_secret()
        generated_secret = clean_secret

    device_name = _parse_device_name(user_agent) or "Thiết bị không xác định"
    with get_connection() as conn:
        owner = conn.execute("SELECT user_id FROM devices WHERE id = ?", (clean_device_id,)).fetchone()
        if owner and owner["user_id"] != user_id:
            clean_device_id = _new_device_id()
            if not generated_secret:
                generated_secret = clean_secret
        existing = conn.execute(
            "SELECT * FROM devices WHERE id = ? AND user_id = ?",
            (clean_device_id, user_id),
        ).fetchone()
        if existing:
            secret_hash = existing["secret_hash"] or ""
            verified = _verify_device_secret(clean_secret, secret_hash)
            can_claim_legacy = not secret_hash
            if not verified and not can_claim_legacy:
                clean_device_id = _new_device_id()
                if not generated_secret:
                    generated_secret = clean_secret
                existing = None
            else:
                status = "approved" if trusted else (existing["status"] or "pending")
                secret_update = _hash_device_secret(clean_secret) if can_claim_legacy else secret_hash
                conn.execute(
                    """
                    UPDATE devices
                    SET secret_hash = ?, device_name = ?, user_agent = ?,
                        last_ip_address = ?, status = ?, last_active = datetime('now')
                    WHERE id = ? AND user_id = ?
                    """,
                    (secret_update, device_name, user_agent, ip_address, status, clean_device_id, user_id),
                )
                row = conn.execute("SELECT * FROM devices WHERE id = ?", (clean_device_id,)).fetchone()
                return _device_payload(row, generated_secret or None)

        # Chỉ admin (trusted) mới được tự duyệt thiết bị; mọi thiết bị mới của
        # user thường đều ở trạng thái pending chờ admin duyệt.
        status = "approved" if trusted else "pending"
        conn.execute(
            """
            INSERT INTO devices
              (id, user_id, secret_hash, device_name, user_agent, first_ip_address,
               last_ip_address, status, last_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            """,
            (
                clean_device_id,
                user_id,
                _hash_device_secret(clean_secret),
                device_name,
                user_agent,
                ip_address,
                ip_address,
                status,
            ),
        )
        row = conn.execute("SELECT * FROM devices WHERE id = ?", (clean_device_id,)).fetchone()
        return _device_payload(row, generated_secret or None)


def create_session(
    user_id: str,
    ip_address: str = "",
    user_agent: str = "",
    trusted: bool = False,
    device_id: str | None = None,
    device_secret: str | None = None,
) -> tuple[str, str, dict]:
    token = str(uuid.uuid4())
    # Admin không bị giới hạn thiết bị — luôn được duyệt tự động.
    # Role videodub cũng tự duyệt thiết bị (portal riêng, không qua admin gate).
    trusted = trusted or is_admin(user_id) or get_user_role(user_id) == "videodub"
    device = upsert_login_device(
        user_id,
        device_id=device_id,
        device_secret=device_secret,
        ip_address=ip_address,
        user_agent=user_agent,
        trusted=trusted,
    )
    device_name = device.get("device_name") or _parse_device_name(user_agent)
    status = "approved" if trusted else (device.get("status") or "pending")
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO sessions
              (id, user_id, ip_address, user_agent, device_name, device_id, last_active, status)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
            """,
            (token, user_id, ip_address, user_agent, device_name, device.get("id") or "", status),
        )
    return token, status, device


def create_session_from_device(
    device_id: str,
    device_secret: str,
    ip_address: str = "",
    user_agent: str = "",
) -> tuple[str, str] | None:
    clean_device_id = (device_id or "").strip()
    clean_secret = (device_secret or "").strip()
    if not clean_device_id or not clean_secret:
        return None
    with get_connection() as conn:
        device = conn.execute("SELECT * FROM devices WHERE id = ?", (clean_device_id,)).fetchone()
        if not device:
            return None
        dev_status = device["status"] or "pending"
        # Role videodub tự duyệt thiết bị (portal riêng).
        if dev_status != "approved" and get_user_role(device["user_id"]) == "videodub":
            conn.execute("UPDATE devices SET status='approved', last_active=datetime('now') WHERE id=?", (clean_device_id,))
            conn.execute("UPDATE sessions SET status='approved' WHERE device_id=?", (clean_device_id,))
            dev_status = "approved"
        if dev_status != "approved":
            return None
        if not is_user_active(device["user_id"]):
            return None
        if not _verify_device_secret(clean_secret, device["secret_hash"] or ""):
            return None

        token = str(uuid.uuid4())
        device_name = _parse_device_name(user_agent) or device["device_name"] or "Thiết bị không xác định"
        conn.execute(
            """
            UPDATE devices
            SET device_name = ?, user_agent = ?, last_ip_address = ?, last_active = datetime('now')
            WHERE id = ?
            """,
            (device_name, user_agent, ip_address, clean_device_id),
        )
        conn.execute(
            """
            INSERT INTO sessions
              (id, user_id, ip_address, user_agent, device_name, device_id, last_active, status)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'approved')
            """,
            (token, device["user_id"], ip_address, user_agent, device_name, clean_device_id),
        )
        return token, device["user_id"]


def _parse_device_name(ua: str) -> str:
    if not ua:
        return ""
    ua_lower = ua.lower()
    os_part = ""
    if "windows nt 10" in ua_lower:
        os_part = "Windows 10/11"
    elif "windows nt 6.1" in ua_lower:
        os_part = "Windows 7"
    elif "windows" in ua_lower:
        os_part = "Windows"
    elif "iphone" in ua_lower:
        os_part = "iPhone"
    elif "ipad" in ua_lower:
        os_part = "iPad"
    elif "android" in ua_lower:
        os_part = "Android"
    elif "mac os" in ua_lower or "macos" in ua_lower:
        os_part = "macOS"
    elif "linux" in ua_lower:
        os_part = "Linux"
    browser_part = ""
    if "edg/" in ua_lower or "edge/" in ua_lower:
        browser_part = "Edge"
    elif "chrome/" in ua_lower and "chromium" not in ua_lower:
        browser_part = "Chrome"
    elif "firefox/" in ua_lower:
        browser_part = "Firefox"
    elif "safari/" in ua_lower:
        browser_part = "Safari"
    elif "curl" in ua_lower:
        browser_part = "cURL"
    elif "hagent-cli" in ua_lower:
        browser_part = "HAgent CLI"
    if browser_part and os_part:
        return f"{browser_part} — {os_part}"
    return browser_part or os_part or ""


def touch_session(token: str) -> None:
    with get_connection() as conn:
        conn.execute("UPDATE sessions SET last_active = datetime('now') WHERE id = ?", (token,))
        conn.execute(
            """
            UPDATE devices
            SET last_active = datetime('now')
            WHERE id = (SELECT device_id FROM sessions WHERE id = ?)
            """,
            (token,),
        )


def list_user_sessions(user_id: str) -> list:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, device_id, ip_address, user_agent, device_name, created_at, last_active, status FROM sessions WHERE user_id = ? ORDER BY last_active DESC",
            (user_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def list_user_devices(user_id: str) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                d.id,
                d.device_name,
                d.first_ip_address,
                d.last_ip_address,
                d.created_at,
                d.last_active,
                d.status,
                COUNT(s.id) AS session_count
            FROM devices d
            LEFT JOIN sessions s ON s.device_id = d.id AND s.user_id = d.user_id
            WHERE d.user_id = ?
            GROUP BY d.id
            ORDER BY COALESCE(d.last_active, d.created_at) DESC
            """,
            (user_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_device(device_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM devices WHERE id = ?", (device_id,)).fetchone()
    return dict(row) if row else None


def approve_session(token: str, user_id: str) -> bool:
    with get_connection() as conn:
        cur = conn.execute(
            "UPDATE sessions SET status = 'approved' WHERE id = ? AND user_id = ?",
            (token, user_id),
        )
        row = conn.execute(
            "SELECT device_id FROM sessions WHERE id = ? AND user_id = ?",
            (token, user_id),
        ).fetchone()
        if row and row["device_id"]:
            conn.execute(
                "UPDATE devices SET status = 'approved', last_active = datetime('now') WHERE id = ? AND user_id = ?",
                (row["device_id"], user_id),
            )
    return cur.rowcount > 0


def approve_device(device_id: str, user_id: str) -> bool:
    with get_connection() as conn:
        cur = conn.execute(
            "UPDATE devices SET status = 'approved', last_active = datetime('now') WHERE id = ? AND user_id = ?",
            (device_id, user_id),
        )
        if cur.rowcount:
            conn.execute(
                "UPDATE sessions SET status = 'approved' WHERE device_id = ? AND user_id = ?",
                (device_id, user_id),
            )
            return True
    return approve_session(device_id, user_id)


def revoke_session_for_user(token: str, user_id: str) -> bool:
    with get_connection() as conn:
        cur = conn.execute("DELETE FROM sessions WHERE id = ? AND user_id = ?", (token, user_id))
    return cur.rowcount > 0


def revoke_device_for_user(device_id: str, user_id: str) -> bool:
    with get_connection() as conn:
        cur = conn.execute("DELETE FROM devices WHERE id = ? AND user_id = ?", (device_id, user_id))
        if cur.rowcount:
            conn.execute("DELETE FROM sessions WHERE device_id = ? AND user_id = ?", (device_id, user_id))
            return True
    return revoke_session_for_user(device_id, user_id)


def revoke_other_sessions(current_token: str, user_id: str) -> int:
    with get_connection() as conn:
        cur = conn.execute("DELETE FROM sessions WHERE user_id = ? AND id != ?", (user_id, current_token))
    return cur.rowcount


def revoke_other_devices(current_token: str, user_id: str) -> int:
    with get_connection() as conn:
        current = conn.execute(
            "SELECT device_id FROM sessions WHERE id = ? AND user_id = ?",
            (current_token, user_id),
        ).fetchone()
        current_device_id = current["device_id"] if current and current["device_id"] else ""
        if not current_device_id:
            return revoke_other_sessions(current_token, user_id)
        device_rows = conn.execute(
            "SELECT id FROM devices WHERE user_id = ? AND id != ?",
            (user_id, current_device_id),
        ).fetchall()
        device_ids = [row["id"] for row in device_rows]
        for other_device_id in device_ids:
            conn.execute("DELETE FROM sessions WHERE user_id = ? AND device_id = ?", (user_id, other_device_id))
            conn.execute("DELETE FROM devices WHERE user_id = ? AND id = ?", (user_id, other_device_id))
        cur = conn.execute(
            """
            DELETE FROM sessions
            WHERE user_id = ? AND id != ? AND (device_id IS NULL OR device_id = '')
            """,
            (user_id, current_token),
        )
    return len(device_ids) + cur.rowcount


def get_session(token: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (token,)).fetchone()
    return dict(row) if row else None


def delete_session(token: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM sessions WHERE id = ?", (token,))


def resolve_user_id(token: str, default_token: str = "hat", default_user: str = "hat") -> str | None:
    session = get_session(token)
    if session:
        if not is_user_active(session["user_id"]):
            return None
        if (session.get("status") or "approved") == "pending":
            return None
        device_id = session.get("device_id") or ""
        if device_id:
            device = get_device(device_id)
            if device and (device.get("status") or "pending") != "approved":
                return None
        return session["user_id"]
    if token == default_token:
        user = get_user_by_username(default_user)
        if user and is_user_active(user["id"]):
            return user["id"]
        return None
    return None


def is_session_pending(token: str) -> bool:
    session = get_session(token)
    if not session:
        return False
    if (session.get("status") or "approved") == "pending":
        return True
    device_id = session.get("device_id") or ""
    if not device_id:
        return False
    device = get_device(device_id)
    return bool(device and (device.get("status") or "pending") == "pending")


BUILTIN_PROVIDERS = [
    {"name": "pekpik", "label": "Pekpik API", "type": "openai", "baseURL": "https://aiapiv2.pekpik.com/v1", "model": "smart-chat", "contextLength": 1_000_000},
    {"name": "deepseek", "label": "DeepSeek", "type": "openai", "baseURL": "https://api.deepseek.com", "model": "deepseek-chat", "contextLength": 1_000_000},
    {"name": "ollama", "label": "Ollama (Remote)", "type": "openai", "baseURL": "http://100.69.50.64:11434/v1", "model": "qwen3.5:4b", "contextLength": 32_768},
    {"name": "lmstudio", "label": "LM Studio (Remote)", "type": "openai", "baseURL": "http://100.69.50.64:1234/v1", "model": "qwen/qwen3.5-9b", "contextLength": 65_536},
    {"name": "llamacpp", "label": "Llama.cpp (Remote)", "type": "openai", "baseURL": "http://100.69.50.64:8080/v1", "model": "qwen", "contextLength": 8_192},
    {"name": "lmstudio_local", "label": "LM Studio (Local)", "type": "openai", "baseURL": "http://127.0.0.1:1234/v1", "model": "google/gemma-4-e2b", "contextLength": 8_192},
    {"name": "cx", "label": "CX/9Router", "type": "openai", "baseURL": "http://127.0.0.1:20128/v1", "model": "cx/gpt-5.5", "contextLength": 1_050_000},
    {"name": "gemini", "label": "Gemini", "type": "gemini", "baseURL": "", "model": "gemini-2.0-flash", "contextLength": 1_048_576},
    {"name": "openai", "label": "OpenAI", "type": "openai", "baseURL": "https://api.openai.com/v1", "model": "gpt-4o-mini", "contextLength": 128_000},
    {"name": "anthropic", "label": "Anthropic", "type": "anthropic", "baseURL": "https://api.anthropic.com", "model": "claude-3-5-sonnet", "contextLength": 200_000},
    {"name": "chatgpt2api", "label": "ChatGPT2API (local)", "type": "openai", "baseURL": "http://127.0.0.1:8010/api/chat-bridge/v1", "model": "gpt-5-mini", "contextLength": 128_000},
    {"name": "alibaba", "label": "Alibaba Cloud", "type": "openai", "baseURL": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", "model": "qwen-plus", "contextLength": 131_072},
    {"name": "groq", "label": "Groq", "type": "openai", "baseURL": "https://api.groq.com/openai/v1", "model": "llama-3.1-8b-instant", "contextLength": 131_072},
]


def get_providers(user_id: str) -> list[dict]:
    with get_connection() as conn:
        stored = conn.execute(
            "SELECT name, label, type, base_url, api_key, model, context_length FROM custom_providers WHERE user_id = ? ORDER BY created_at ASC",
            (user_id,)).fetchall()
    override = {r["name"]: r for r in stored}
    builtin_names = {p["name"] for p in BUILTIN_PROVIDERS}
    merged = []
    for p in BUILTIN_PROVIDERS:
        ovr = override.get(p["name"])
        merged.append({
            "name": p["name"], "label": ovr["label"] if ovr else p["label"],
            "type": ovr["type"] if ovr else p["type"],
            "baseURL": ovr["base_url"] if ovr and ovr["base_url"] else p["baseURL"],
            "api_key": ovr["api_key"] if ovr and ovr["api_key"] else "",
            "model": ovr["model"] if ovr and ovr["model"] else p["model"],
            "contextLength": ovr["context_length"] if ovr and ovr["context_length"] else p.get("contextLength"),
            "custom": False,
        })
    for r in stored:
        if r["name"] not in builtin_names:
            merged.append({
                "name": r["name"], "label": r["label"], "type": r["type"],
                "baseURL": r["base_url"] or "", "api_key": r["api_key"] or "",
                "model": r["model"] or "", "custom": True,
                "contextLength": r["context_length"],
            })
    return merged


def upsert_provider(user_id: str, data: dict) -> None:
    with get_connection() as conn:
        existing = conn.execute("SELECT id FROM custom_providers WHERE user_id = ? AND name = ?",
                                (user_id, data["name"])).fetchone()
        if existing:
            conn.execute("""UPDATE custom_providers SET label=?, type=?, base_url=?,
                api_key=CASE WHEN ? != '' THEN ? ELSE api_key END, model=?, context_length=?, updated_at=datetime('now')
                WHERE user_id=? AND name=?""",
                (data.get("label", ""), data.get("type", "openai"),
                 data.get("base_url", "") or data.get("baseURL", ""),
                 data.get("api_key", ""), data.get("api_key", ""),
                 data.get("model", ""), data.get("contextLength") or data.get("context_length"),
                 user_id, data["name"]))
        else:
            conn.execute(
                "INSERT INTO custom_providers (id, user_id, name, label, type, base_url, api_key, model, context_length) VALUES (?,?,?,?,?,?,?,?,?)",
                (str(uuid.uuid4()), user_id, data["name"], data.get("label", ""),
                 data.get("type", "openai"), data.get("base_url", "") or data.get("baseURL", ""),
                 data.get("api_key", "") or data.get("apiKey", ""), data.get("model", ""),
                 data.get("contextLength") or data.get("context_length")))
    _sync_provider_to_config_yaml(user_id, data["name"])


def delete_provider(user_id: str, name: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM custom_providers WHERE user_id = ? AND name = ?", (user_id, name))
    _sync_provider_to_config_yaml(user_id, name, deleted=True)


def _config_yaml_path() -> Path:
    return Path(__file__).resolve().parents[2] / "config.yaml"


def _sync_provider_to_config_yaml(user_id: str, provider_name: str, deleted: bool = False) -> None:
    """Sao chép provider sang config.yaml để agent runtime (hagent_cli) đọc được api_key."""
    try:
        cfg_path = _config_yaml_path()
        cfg: dict = {}
        if cfg_path.exists():
            try:
                cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
            except Exception:
                cfg = {}
        providers = cfg.get("providers")
        if not isinstance(providers, dict):
            providers = {}

        if deleted:
            providers.pop(provider_name, None)
        else:
            with get_connection() as conn:
                row = conn.execute(
                    "SELECT label, type, base_url, api_key, model FROM custom_providers WHERE user_id = ? AND name = ?",
                    (user_id, provider_name),
                ).fetchone()
            if not row:
                return
            base_url = row["base_url"] or ""
            api_key = row["api_key"] or ""
            if not base_url and not api_key:
                providers.pop(provider_name, None)
            else:
                entry = {
                    "name": row["label"] or provider_name,
                    "base_url": base_url,
                    "api_key": api_key,
                    "default_model": row["model"] or "",
                }
                providers[provider_name] = entry

        cfg["providers"] = providers
        cfg_path.write_text(yaml.safe_dump(cfg, sort_keys=False, allow_unicode=True), encoding="utf-8")
    except Exception:
        pass
