"""RBAC + audit + admin store — roles, permissions, activity log, user admin.

Hoạt động trên data/hagent.db (dùng chung get_connection). Không import api.routers.*
để tránh vòng lặp import.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException, Request

from api.services.db import get_connection
from api.services.user_store import (
    resolve_user_id, get_user_by_id, get_user_by_username,
    create_user, update_user,
)

# ── Catalog quyền (nguồn chuẩn) ──────────────────────────────────────────
PERMISSION_CATALOG = [
    {"key": "chat", "label": "Chat", "children": [
        {"key": "chat:chat", "label": "Chat"},
        {"key": "chat:omni", "label": "Omni"},
    ]},
    {"key": "system", "label": "Hệ thống", "children": [
        {"key": "system:files", "label": "Files"},
        {"key": "system:code", "label": "Code"},
        {"key": "system:ports", "label": "Cổng"},
        {"key": "system:camera", "label": "Camera"},
        {"key": "system:gphotos", "label": "Photos"},
        {"key": "system:backup", "label": "Sao lưu"},
        {"key": "system:devices", "label": "Thiết bị"},
    ]},
    {"key": "automation", "label": "Công cụ", "children": [
        {"key": "automation:editor", "label": "Video"},
        {"key": "automation:editor:projects", "label": "Video: Projects"},
        {"key": "automation:editor:outputs", "label": "Video: Đã render"},
        {"key": "automation:editor:photo", "label": "Video: Photo"},
        {"key": "automation:editor:animate", "label": "Video: Animate"},
        {"key": "automation:editor:comfyui", "label": "Video: ComfyUI"},
        {"key": "automation:editor:tts", "label": "Video: TTS"},
        {"key": "automation:editor:stt", "label": "Video: STT"},
        {"key": "automation:editor:videoai", "label": "Video: Dịch Video"},
        {"key": "automation:editor:story", "label": "Video: Story"},
        {"key": "automation:pdf", "label": "PDF"},
        {"key": "automation:pdf:edit", "label": "PDF: Sắp xếp trang"},
        {"key": "automation:pdf:text", "label": "PDF: Text to PDF"},
        {"key": "automation:pdf:images", "label": "PDF: Ảnh thành PDF"},
        {"key": "automation:pdf:docx", "label": "PDF: Word sang PDF"},
        {"key": "automation:pdf:merge", "label": "PDF: Gộp tài liệu"},
        {"key": "automation:pdf:translate", "label": "PDF: Dịch PDF"},
        {"key": "automation:workflows", "label": "Workflow"},
        {"key": "automation:workflows:flow", "label": "Workflow: Flow"},
        {"key": "automation:workflows:cron", "label": "Workflow: Cron"},
        {"key": "automation:ketoan", "label": "Lệnh kế toán"},
    ]},
    {"key": "personal", "label": "Cá nhân", "children": [
        {"key": "personal:expenses", "label": "Thu Chi"},
        {"key": "personal:balance", "label": "Tài khoản"},
        {"key": "personal:food", "label": "Ăn uống"},
        {"key": "personal:diennuoc", "label": "Tiền nhà"},
        {"key": "personal:notes", "label": "Ghi chú"},
        {"key": "personal:tasks", "label": "Công việc"},
    ]},
    {"key": "learning", "label": "Học tập", "children": [
        {"key": "learning:review", "label": "Cần ôn"},
        {"key": "learning:learn", "label": "Learn Code"},
        {"key": "learning:english", "label": "Tiếng Anh"},
        {"key": "learning:mindmap", "label": "Mindmap"},
    ]},
    {"key": "entertainment", "label": "Giải trí", "children": [
        {"key": "entertainment:browse", "label": "Truyện"},
        {"key": "entertainment:video", "label": "Video"},
        {"key": "entertainment:app-api", "label": "App API"},
    ]},
    {"key": "video", "label": "Video đàn tranh", "children": [
        {"key": "video:dub", "label": "Lồng tiếng"},
    ]},
    {"key": "settings", "label": "Settings", "children": [
        {"key": "settings:user", "label": "Tài khoản"},
        {"key": "settings:controls", "label": "Điều khiển"},
        {"key": "settings:system", "label": "Agent"},
        {"key": "settings:models", "label": "Models"},
        {"key": "settings:connections", "label": "Kết nối"},
        {"key": "settings:tools", "label": "Tool"},
        {"key": "settings:skills", "label": "Skill"},
        {"key": "settings:context", "label": "Ngữ cảnh"},
        {"key": "settings:services", "label": "Dịch vụ"},
    ]},
]

DEFAULT_USER_PERMS = [
    "chat:chat",
    "settings:user",
    "personal:expenses",
    "personal:balance",
    "personal:food",
    "personal:diennuoc",
    "personal:notes",
    "personal:tasks",
]
SLUG_OK = set("abcdefghijklmnopqrstuvwxyz0123456789_-")


# ── Khởi tạo bảng ─────────────────────────────────────────────────────────
def init_rbac_tables() -> None:
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS role_permissions (
                role TEXT PRIMARY KEY,
                label TEXT DEFAULT '',
                tabs TEXT DEFAULT '[]',
                is_system INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT DEFAULT (datetime('now')),
                actor_id TEXT DEFAULT '',
                actor_name TEXT DEFAULT '',
                action TEXT NOT NULL,
                target_type TEXT DEFAULT '',
                target_id TEXT DEFAULT '',
                detail TEXT DEFAULT '',
                ip_address TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id);
            CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
            """
        )
        conn.execute(
            "INSERT OR IGNORE INTO role_permissions (role, label, tabs, is_system) VALUES (?,?,?,1)",
            ("admin", "Quản trị viên", json.dumps(["*"])),
        )
        conn.execute(
            "INSERT OR IGNORE INTO role_permissions (role, label, tabs, is_system) VALUES (?,?,?,1)",
            ("user", "Người dùng", json.dumps(DEFAULT_USER_PERMS)),
        )
        # Admin luôn toàn quyền.
        conn.execute("UPDATE role_permissions SET tabs = ? WHERE role = 'admin'", (json.dumps(["*"]),))


# ── Quyền ────────────────────────────────────────────────────────────────
def resolve_permissions(role: str) -> list[str]:
    role = role or "user"
    if role == "admin":
        return ["*"]
    with get_connection() as conn:
        row = conn.execute("SELECT tabs FROM role_permissions WHERE role = ?", (role,)).fetchone()
    if not row:
        return list(DEFAULT_USER_PERMS)
    try:
        tabs = json.loads(row["tabs"] or "[]")
    except Exception:
        tabs = []
    return tabs if isinstance(tabs, list) else []


def can_role(role: str, key: str) -> bool:
    perms = resolve_permissions(role)
    if "*" in perms or key in perms:
        return True
    if ":" in key:
        return key.split(":", 1)[0] in perms
    return False


def list_roles() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT role, label, tabs, is_system FROM role_permissions ORDER BY is_system DESC, role ASC"
        ).fetchall()
        counts = {
            r["role"]: r["c"]
            for r in conn.execute("SELECT role, COUNT(*) c FROM users GROUP BY role").fetchall()
        }
    out = []
    for r in rows:
        try:
            tabs = json.loads(r["tabs"] or "[]")
        except Exception:
            tabs = []
        out.append({
            "role": r["role"],
            "label": r["label"] or r["role"],
            "tabs": tabs,
            "is_system": bool(r["is_system"]),
            "user_count": counts.get(r["role"], 0),
        })
    return out


def upsert_role(role: str, label: str, tabs: list[str], is_system: bool = False) -> None:
    role = (role or "").strip().lower()
    if not role or any(c not in SLUG_OK for c in role):
        raise ValueError("Mã vai trò chỉ gồm chữ thường, số, gạch dưới/ngang")
    if role == "admin":
        tabs = ["*"]  # admin luôn toàn quyền
    tabs = [t for t in (tabs or []) if isinstance(t, str)]
    with get_connection() as conn:
        existing = conn.execute("SELECT role, is_system FROM role_permissions WHERE role = ?", (role,)).fetchone()
        if existing:
            conn.execute(
                "UPDATE role_permissions SET label = ?, tabs = ?, updated_at = datetime('now') WHERE role = ?",
                (label or role, json.dumps(tabs), role),
            )
        else:
            conn.execute(
                "INSERT INTO role_permissions (role, label, tabs, is_system) VALUES (?,?,?,?)",
                (role, label or role, json.dumps(tabs), 1 if is_system else 0),
            )


def delete_role(role: str) -> None:
    with get_connection() as conn:
        row = conn.execute("SELECT is_system FROM role_permissions WHERE role = ?", (role,)).fetchone()
        if not row:
            raise ValueError("Vai trò không tồn tại")
        if row["is_system"]:
            raise ValueError("Không thể xoá vai trò hệ thống")
        used = conn.execute("SELECT COUNT(*) c FROM users WHERE role = ?", (role,)).fetchone()["c"]
        if used:
            raise ValueError(f"Còn {used} người dùng thuộc vai trò này")
        conn.execute("DELETE FROM role_permissions WHERE role = ?", (role,))


# ── Nhật ký ──────────────────────────────────────────────────────────────
def log_audit(actor_id: str = "", actor_name: str = "", action: str = "",
              target_type: str = "", target_id: str = "",
              detail=None, ip: str = "") -> None:
    if isinstance(detail, (dict, list)):
        detail = json.dumps(detail, ensure_ascii=False)
    try:
        with get_connection() as conn:
            conn.execute(
                """INSERT INTO audit_log (actor_id, actor_name, action, target_type, target_id, detail, ip_address)
                   VALUES (?,?,?,?,?,?,?)""",
                (actor_id or "", actor_name or "", action or "", target_type or "",
                 target_id or "", detail or "", ip or ""),
            )
    except Exception:
        pass  # nhật ký không được làm hỏng luồng chính


def query_audit(action: str = "", actor: str = "", date_from: str = "",
                date_to: str = "", limit: int = 200) -> list[dict]:
    where, params = [], []
    if action:
        where.append("action = ?"); params.append(action)
    if actor:
        where.append("(actor_id = ? OR actor_name LIKE ?)"); params.extend([actor, f"%{actor}%"])
    if date_from:
        where.append("created_at >= ?"); params.append(date_from)
    if date_to:
        where.append("created_at <= ?"); params.append(date_to)
    sql = "SELECT * FROM audit_log"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY id DESC LIMIT ?"
    params.append(max(1, min(int(limit or 200), 1000)))
    with get_connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


# ── Admin: người dùng ────────────────────────────────────────────────────
USER_UPDATE_MAP = {
    "displayName": "displayName",
    "role": "role",
    "account_status": "account_status",
    "expires_at": "expires_at",
    "password": "password",
    "email": "email",
}


def admin_list_users() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT u.id, u.username, u.display_name, u.email, u.avatar, u.role,
                   u.account_status, u.expires_at, u.created_at,
                   (SELECT MAX(last_active) FROM sessions s WHERE s.user_id = u.id) AS last_active,
                   (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id) AS device_count,
                   (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id AND d.status='pending') AS pending_count
            FROM users u
            ORDER BY u.created_at DESC
            """
        ).fetchall()
    return [dict(r) for r in rows]


def admin_create_user(username: str, password: str, display_name: str = "",
                      role: str = "user", account_status: str = "active",
                      expires_at: str = "") -> dict:
    user = create_user(username, password, display_name)
    updates = {"role": role or "user", "account_status": account_status or "active"}
    if expires_at:
        updates["expires_at"] = expires_at
    update_user(user["id"], updates)
    return get_user_by_id(user["id"]) or user


def admin_update_user(user_id: str, payload: dict) -> None:
    updates = {}
    for k, v in payload.items():
        if k in USER_UPDATE_MAP and v is not None:
            updates[k] = v
    if not updates:
        return
    if "username" in payload and payload["username"]:
        other = get_user_by_username(payload["username"])
        if other and other["id"] != user_id:
            raise ValueError("Tên đăng nhập đã tồn tại")
        updates["username"] = payload["username"]
    update_user(user_id, updates)


def admin_delete_user(user_id: str, actor_id: str) -> None:
    if user_id == actor_id:
        raise ValueError("Không thể tự xoá tài khoản của bạn")
    with get_connection() as conn:
        target = conn.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
        if not target:
            raise ValueError("Người dùng không tồn tại")
        if target["role"] == "admin":
            admins = conn.execute("SELECT COUNT(*) c FROM users WHERE role = 'admin'").fetchone()["c"]
            if admins <= 1:
                raise ValueError("Không thể xoá admin cuối cùng")
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


# ── Admin: thiết bị toàn hệ thống ────────────────────────────────────────
def admin_list_devices(status: Optional[str] = None) -> list[dict]:
    sql = (
        """
        SELECT d.id, d.user_id, u.username, u.display_name, d.device_name,
               d.first_ip_address, d.last_ip_address, d.status, d.created_at, d.last_active
        FROM devices d JOIN users u ON u.id = d.user_id
        """
    )
    params = []
    if status:
        sql += " WHERE d.status = ?"; params.append(status)
    sql += " ORDER BY (d.status='pending') DESC, COALESCE(d.last_active, d.created_at) DESC"
    with get_connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def admin_approve_device(device_id: str) -> bool:
    with get_connection() as conn:
        cur = conn.execute(
            "UPDATE devices SET status='approved', last_active=datetime('now') WHERE id = ?",
            (device_id,),
        )
        if cur.rowcount:
            conn.execute("UPDATE sessions SET status='approved' WHERE device_id = ?", (device_id,))
        return cur.rowcount > 0


def admin_revoke_device(device_id: str) -> bool:
    with get_connection() as conn:
        conn.execute("DELETE FROM sessions WHERE device_id = ?", (device_id,))
        cur = conn.execute("DELETE FROM devices WHERE id = ?", (device_id,))
        return cur.rowcount > 0


# ── Admin: thống kê tổng quan ────────────────────────────────────────────
def _scalar(conn, sql, params=()):
    row = conn.execute(sql, params).fetchone()
    return row[0] if row else 0


def admin_overview() -> dict:
    with get_connection() as conn:
        total = _scalar(conn, "SELECT COUNT(*) FROM users")
        active = _scalar(
            conn,
            "SELECT COUNT(*) FROM users WHERE COALESCE(account_status,'active') NOT IN ('disabled','expired','revoked','deleted')",
        )
        by_role = {r["role"] or "user": r["c"] for r in conn.execute(
            "SELECT role, COUNT(*) c FROM users GROUP BY role").fetchall()}
        by_status = {r["account_status"] or "active": r["c"] for r in conn.execute(
            "SELECT account_status, COUNT(*) c FROM users GROUP BY account_status").fetchall()}
        devices_total = _scalar(conn, "SELECT COUNT(*) FROM devices")
        devices_pending = _scalar(conn, "SELECT COUNT(*) FROM devices WHERE status='pending'")
        sessions_online = _scalar(
            conn, "SELECT COUNT(*) FROM sessions WHERE last_active >= datetime('now','-15 minutes')")
        sessions_total = _scalar(conn, "SELECT COUNT(*) FROM sessions")
        new_7d = _scalar(conn, "SELECT COUNT(*) FROM users WHERE created_at >= datetime('now','-7 days')")
        new_30d = _scalar(conn, "SELECT COUNT(*) FROM users WHERE created_at >= datetime('now','-30 days')")
        actions_7d = [
            {"action": r["action"], "count": r["c"]}
            for r in conn.execute(
                "SELECT action, COUNT(*) c FROM audit_log WHERE created_at >= datetime('now','-7 days') GROUP BY action ORDER BY c DESC"
            ).fetchall()
        ]
        login_rows = {
            r["d"]: r["c"]
            for r in conn.execute(
                "SELECT date(created_at) d, COUNT(*) c FROM audit_log WHERE action='login' AND created_at >= datetime('now','-13 days') GROUP BY date(created_at)"
            ).fetchall()
        }
    today = datetime.now().date()
    logins_14d = []
    for i in range(13, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        logins_14d.append({"date": d, "count": login_rows.get(d, 0)})
    return {
        "users": {"total": total, "active": active, "inactive": total - active,
                  "by_role": by_role, "by_status": by_status, "new_7d": new_7d, "new_30d": new_30d},
        "devices": {"total": devices_total, "pending": devices_pending},
        "sessions": {"online": sessions_online, "total": sessions_total},
        "activity": {"actions_7d": actions_7d, "logins_14d": logins_14d},
    }


# ── Bảo vệ admin ─────────────────────────────────────────────────────────
def _request_token(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    return (
        auth.replace("Bearer ", "").strip()
        or request.query_params.get("t", "")
        or request.cookies.get("hagent_token", "")
    )


def require_admin(request: Request) -> tuple[str, dict]:
    """Trả (uid, user) nếu là admin, ngược lại raise HTTPException."""
    token = _request_token(request)
    uid = resolve_user_id(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Phiên không hợp lệ hoặc đã hết hạn")
    user = get_user_by_id(uid)
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Chỉ admin mới được truy cập")
    return uid, user


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""
