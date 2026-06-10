"""Admin router — quản trị user, vai trò/phân quyền, thiết bị, thống kê, nhật ký.

Mọi endpoint yêu cầu quyền admin (rbac.require_admin). Prefix /api/admin.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from api.services import rbac

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Đảm bảo bảng tồn tại khi import.
rbac.init_rbac_tables()


# ── Models ───────────────────────────────────────────────────────────────
class CreateUserBody(BaseModel):
    username: str
    password: str
    displayName: Optional[str] = ""
    role: Optional[str] = "user"
    account_status: Optional[str] = "active"
    expires_at: Optional[str] = ""


class UpdateUserBody(BaseModel):
    displayName: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    account_status: Optional[str] = None
    expires_at: Optional[str] = None
    password: Optional[str] = None


class RoleBody(BaseModel):
    role: str
    label: Optional[str] = ""
    tabs: Optional[list[str]] = None


class RolePatchBody(BaseModel):
    label: Optional[str] = None
    tabs: Optional[list[str]] = None


# ── Tổng quan / catalog ──────────────────────────────────────────────────
@router.get("/overview")
def overview(request: Request):
    rbac.require_admin(request)
    return rbac.admin_overview()


@router.get("/permissions/catalog")
def permissions_catalog(request: Request):
    rbac.require_admin(request)
    return {"catalog": rbac.PERMISSION_CATALOG}


# ── Người dùng ───────────────────────────────────────────────────────────
@router.get("/users")
def list_users(request: Request):
    rbac.require_admin(request)
    return {"users": rbac.admin_list_users()}


@router.post("/users")
def create_user_endpoint(body: CreateUserBody, request: Request):
    uid, actor = rbac.require_admin(request)
    if not body.username or not body.password:
        raise HTTPException(status_code=400, detail="Cần tên đăng nhập và mật khẩu")
    if len(body.password) < 4:
        raise HTTPException(status_code=400, detail="Mật khẩu tối thiểu 4 ký tự")
    try:
        user = rbac.admin_create_user(
            body.username, body.password, body.displayName or "",
            role=body.role or "user", account_status=body.account_status or "active",
            expires_at=body.expires_at or "",
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    rbac.log_audit(uid, actor.get("username", ""), "user.create", "user", user["id"],
                   {"username": body.username, "role": body.role}, rbac.client_ip(request))
    return {"ok": True, "user": user}


@router.patch("/users/{user_id}")
def update_user_endpoint(user_id: str, body: UpdateUserBody, request: Request):
    uid, actor = rbac.require_admin(request)
    payload = body.model_dump(exclude_none=True)
    if "password" in payload and len(payload["password"]) < 4:
        raise HTTPException(status_code=400, detail="Mật khẩu tối thiểu 4 ký tự")
    try:
        rbac.admin_update_user(user_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    safe = {k: ("***" if k == "password" else v) for k, v in payload.items()}
    rbac.log_audit(uid, actor.get("username", ""), "user.update", "user", user_id, safe,
                   rbac.client_ip(request))
    return {"ok": True}


@router.delete("/users/{user_id}")
def delete_user_endpoint(user_id: str, request: Request):
    uid, actor = rbac.require_admin(request)
    try:
        rbac.admin_delete_user(user_id, uid)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    rbac.log_audit(uid, actor.get("username", ""), "user.delete", "user", user_id, None,
                   rbac.client_ip(request))
    return {"ok": True}


# ── Vai trò / phân quyền ─────────────────────────────────────────────────
@router.get("/roles")
def get_roles(request: Request):
    rbac.require_admin(request)
    return {"roles": rbac.list_roles()}


@router.post("/roles")
def create_role(body: RoleBody, request: Request):
    uid, actor = rbac.require_admin(request)
    try:
        rbac.upsert_role(body.role, body.label or body.role, body.tabs or [])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    rbac.log_audit(uid, actor.get("username", ""), "role.create", "role", body.role,
                   {"tabs": body.tabs}, rbac.client_ip(request))
    return {"ok": True}


@router.patch("/roles/{role}")
def patch_role(role: str, body: RolePatchBody, request: Request):
    uid, actor = rbac.require_admin(request)
    roles = {r["role"]: r for r in rbac.list_roles()}
    if role not in roles:
        raise HTTPException(status_code=404, detail="Vai trò không tồn tại")
    cur = roles[role]
    try:
        rbac.upsert_role(role, body.label if body.label is not None else cur["label"],
                         body.tabs if body.tabs is not None else cur["tabs"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    rbac.log_audit(uid, actor.get("username", ""), "role.update", "role", role,
                   {"tabs": body.tabs}, rbac.client_ip(request))
    return {"ok": True}


@router.delete("/roles/{role}")
def remove_role(role: str, request: Request):
    uid, actor = rbac.require_admin(request)
    try:
        rbac.delete_role(role)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    rbac.log_audit(uid, actor.get("username", ""), "role.delete", "role", role, None,
                   rbac.client_ip(request))
    return {"ok": True}


# ── Thiết bị toàn hệ thống ───────────────────────────────────────────────
@router.get("/devices")
def list_devices(request: Request, status: Optional[str] = None):
    rbac.require_admin(request)
    return {"devices": rbac.admin_list_devices(status)}


@router.post("/devices/{device_id}/approve")
def approve_device(device_id: str, request: Request):
    uid, actor = rbac.require_admin(request)
    if not rbac.admin_approve_device(device_id):
        raise HTTPException(status_code=404, detail="Thiết bị không tồn tại")
    rbac.log_audit(uid, actor.get("username", ""), "device.approve", "device", device_id, None,
                   rbac.client_ip(request))
    return {"ok": True}


@router.delete("/devices/{device_id}")
def revoke_device(device_id: str, request: Request):
    uid, actor = rbac.require_admin(request)
    if not rbac.admin_revoke_device(device_id):
        raise HTTPException(status_code=404, detail="Thiết bị không tồn tại")
    rbac.log_audit(uid, actor.get("username", ""), "device.revoke", "device", device_id, None,
                   rbac.client_ip(request))
    return {"ok": True}


# ── Nhật ký ──────────────────────────────────────────────────────────────
@router.get("/audit")
def get_audit(request: Request, action: str = "", actor: str = "",
              date_from: str = "", date_to: str = "", limit: int = 200):
    rbac.require_admin(request)
    return {"entries": rbac.query_audit(action, actor, date_from, date_to, limit)}
