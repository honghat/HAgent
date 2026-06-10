"""Auth router — register, login, logout, me, providers, claude-mode."""

import asyncio
import threading
import time
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
from typing import Optional

from api.services.user_store import (
    init_user_tables, create_user, get_user_by_id, get_user_by_username, update_user,
    authenticate_user, create_session, delete_session, resolve_user_id,
    get_providers, upsert_provider, delete_provider, BUILTIN_PROVIDERS,
    _verify_password, list_user_sessions, list_user_devices, revoke_device_for_user,
    revoke_other_devices, touch_session, approve_device as approve_device_for_user, is_session_pending,
    create_session_from_device, get_session, get_device, is_user_active, is_admin,
)
from api.services import rbac

router = APIRouter(prefix="/api/auth", tags=["auth"])

_PROVIDER_HEALTH_TTL_SECONDS = 60.0
_provider_health_cache: dict[str, tuple[float, dict]] = {}
_provider_health_lock = threading.Lock()


def _clear_provider_health_cache(uid: str, name: str | None = None) -> None:
    prefix = f"{uid}:"
    with _provider_health_lock:
        for key in list(_provider_health_cache):
            if key == f"{uid}:{name}" or (name is None and key.startswith(prefix)):
                _provider_health_cache.pop(key, None)

# Ensure tables on first import
init_user_tables()


DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 3650
TOKEN_COOKIE_MAX_AGE = 60 * 60 * 24 * 365


def _request_token(request: Request, default: str = "hat") -> str:
    auth = request.headers.get("authorization", "")
    token = (
        auth.replace("Bearer ", "").strip()
        or request.query_params.get("t", "")
        or request.cookies.get("hagent_token", "")
    )
    if token:
        return token
    if request.cookies.get("hagent_signed_out") == "1":
        return ""
    return default


def _set_cookie(response: Response, key: str, value: str, max_age: int, httponly: bool = True) -> None:
    if not value:
        return
    response.set_cookie(
        key,
        value,
        max_age=max_age,
        httponly=httponly,
        secure=False,
        samesite="lax",
        path="/",
    )


def _set_auth_cookies(
    response: Response,
    token: str,
    device_id: str | None = None,
    device_secret: str | None = None,
) -> None:
    _set_cookie(response, "hagent_token", token, TOKEN_COOKIE_MAX_AGE)
    _set_cookie(response, "hagent_device_id", device_id or "", DEVICE_COOKIE_MAX_AGE)
    _set_cookie(response, "hagent_device_secret", device_secret or "", DEVICE_COOKIE_MAX_AGE)
    response.delete_cookie("hagent_signed_out", path="/")


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie("hagent_token", path="/")
    response.set_cookie(
        "hagent_signed_out",
        "1",
        max_age=TOKEN_COOKIE_MAX_AGE,
        httponly=True,
        secure=False,
        samesite="lax",
        path="/",
    )


def _get_user_id(request: Request) -> str:
    """Extract user ID from auth header/cookie, matching Node's requireAuth."""
    token = _request_token(request)
    uid = resolve_user_id(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if token:
        touch_session(token)
    return uid


# ── Models ───────────────────────────────────────────────────────────────

class RegisterBody(BaseModel):
    username: str
    password: str
    displayName: Optional[str] = None
    deviceId: Optional[str] = None
    deviceSecret: Optional[str] = None

class LoginBody(BaseModel):
    username: str
    password: str
    deviceId: Optional[str] = None
    deviceSecret: Optional[str] = None

class DeviceSessionBody(BaseModel):
    deviceId: Optional[str] = None
    deviceSecret: Optional[str] = None

class UpdateMeBody(BaseModel):
    displayName: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    email: Optional[str] = None
    avatar: Optional[str] = None

class SetProviderBody(BaseModel):
    provider: str

class CustomProviderBody(BaseModel):
    name: str
    label: str
    type: Optional[str] = "openai"
    base_url: Optional[str] = ""
    api_key: Optional[str] = ""
    model: Optional[str] = ""
    contextLength: Optional[int] = None

class BulkProvidersBody(BaseModel):
    providers: list[dict]

class UpdateProviderParam(BaseModel):
    label: Optional[str] = None
    type: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    contextLength: Optional[int] = None

class ResolveProviderContextBody(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = "openai"
    base_url: Optional[str] = ""
    api_key: Optional[str] = ""
    model: str

class SetClaudeModeBody(BaseModel):
    mode: str

class SetAgentBody(BaseModel):
    agentId: str


# ── Endpoints ────────────────────────────────────────────────────────────

def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""


def _public_user(user: dict) -> dict:
    return {"id": user["id"], "username": user["username"], "displayName": user["display_name"]}


@router.post("/register")
async def register(body: RegisterBody, request: Request, response: Response):
    if not body.username or not body.password:
        raise HTTPException(status_code=400, detail="Username and password required")
    if len(body.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    try:
        user = create_user(body.username, body.password, body.displayName)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    ip = _client_ip(request)
    ua = request.headers.get("user-agent", "")
    token, status, device = create_session(
        user["id"],
        ip_address=ip,
        user_agent=ua,
        trusted=True,
        device_id=body.deviceId,
        device_secret=body.deviceSecret,
    )
    payload = {"token": token, "status": status, "deviceId": device.get("id"), "user": user}
    if device.get("device_secret"):
        payload["deviceSecret"] = device["device_secret"]
    device_secret = device.get("device_secret") or body.deviceSecret
    _set_auth_cookies(response, token, device.get("id"), device_secret)
    return payload


@router.post("/login")
async def login(body: LoginBody, request: Request, response: Response):
    if not body.username or not body.password:
        raise HTTPException(status_code=400, detail="Tên đăng nhập và mật khẩu không được để trống")
    user = get_user_by_username(body.username)
    if not user:
        raise HTTPException(status_code=401, detail="Tên đăng nhập không tồn tại")
    if not _verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Sai mật khẩu")
    if not is_user_active(user["id"]):
        raise HTTPException(status_code=403, detail="Tài khoản đã hết hạn hoặc bị vô hiệu hóa")
    ip = _client_ip(request)
    ua = request.headers.get("user-agent", "")
    token, status, device = create_session(
        user["id"],
        ip_address=ip,
        user_agent=ua,
        device_id=body.deviceId,
        device_secret=body.deviceSecret,
    )
    payload = {
        "token": token,
        "status": status,
        "deviceId": device.get("id"),
        "user": _public_user(user),
    }
    if device.get("device_secret"):
        payload["deviceSecret"] = device["device_secret"]
    device_secret = device.get("device_secret") or body.deviceSecret
    _set_auth_cookies(response, token, device.get("id"), device_secret)
    rbac.log_audit(user["id"], user["username"], "login", "session", token,
                   {"status": status, "device": device.get("device_name", "")}, ip)
    return payload


@router.post("/device-session")
async def restore_device_session(request: Request, response: Response, body: DeviceSessionBody | None = None):
    ip = _client_ip(request)
    ua = request.headers.get("user-agent", "")
    device_id = (body.deviceId if body else None) or request.cookies.get("hagent_device_id", "")
    device_secret = (body.deviceSecret if body else None) or request.cookies.get("hagent_device_secret", "")
    if request.cookies.get("hagent_signed_out") == "1":
        raise HTTPException(status_code=401, detail="Đã đăng xuất thủ công")
    restored = create_session_from_device(device_id, device_secret, ip_address=ip, user_agent=ua)
    if not restored:
        raise HTTPException(status_code=401, detail="Thiết bị chưa được duyệt hoặc đã bị thu hồi")
    token, uid = restored
    user = get_user_by_id(uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    _set_auth_cookies(response, token, device_id, device_secret)
    return {"token": token, "status": "approved", "deviceId": device_id, "user": _public_user(user)}


@router.post("/logout")
async def logout(request: Request, response: Response):
    token = _request_token(request, default="")
    if token:
        session = get_session(token)
        if session:
            user = get_user_by_id(session["user_id"])
            rbac.log_audit(session["user_id"], user.get("username", "") if user else "",
                           "logout", "session", token, None, _client_ip(request))
        delete_session(token)
    _clear_session_cookie(response)
    return {"ok": True}


@router.get("/me")
async def get_me(request: Request):
    uid = _get_user_id(request)
    user = get_user_by_id(uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    role = user.get("role") or "user"
    user["role"] = role
    user["permissions"] = rbac.resolve_permissions(role)
    return user


@router.put("/me")
async def update_me(body: UpdateMeBody, request: Request):
    uid = _get_user_id(request)
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items() if v is not None}
    if "username" in updates:
        existing = get_user_by_username(updates["username"])
        if existing and existing["id"] != uid:
            raise HTTPException(status_code=409, detail="Username already exists")
    if "password" in updates and len(updates["password"]) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    if updates:
        update_user(uid, updates)
    return {"ok": True}


@router.get("/provider")
async def get_provider(request: Request):
    uid = _get_user_id(request)
    user = get_user_by_id(uid)
    return {"provider": user.get("default_provider", "deepseek") if user else "deepseek"}


@router.put("/provider")
async def set_provider(body: SetProviderBody, request: Request):
    uid = _get_user_id(request)
    provider = body.provider
    if not provider:
        raise HTTPException(status_code=400, detail="Provider required")
    builtin_names = {p["name"] for p in BUILTIN_PROVIDERS}
    if provider not in builtin_names:
        from api.services.user_store import get_connection
        with get_connection() as conn:
            custom = conn.execute(
                "SELECT id FROM custom_providers WHERE user_id = ? AND name = ?",
                (uid, provider)).fetchone()
        if not custom:
            raise HTTPException(status_code=400, detail="Invalid provider")
    # Chat provider is independent from Claude Code settings; use /claude-mode
    # or /chuyenclaude for that separate control.
    update_user(uid, {"default_provider": provider})
    _clear_provider_health_cache(uid, provider)
    return {"provider": provider}


@router.get("/providers")
async def list_providers(request: Request):
    uid = _get_user_id(request)
    return get_providers(uid)


@router.post("/providers")
async def create_provider(body: CustomProviderBody, request: Request):
    uid = _get_user_id(request)
    if not body.name or not body.label:
        raise HTTPException(status_code=400, detail="name and label required")
    if body.name in {p["name"] for p in BUILTIN_PROVIDERS}:
        raise HTTPException(status_code=409, detail="Name conflicts with built-in provider")
    try:
        upsert_provider(uid, body.model_dump())
        _clear_provider_health_cache(uid, body.name)
    except Exception as e:
        if "UNIQUE" in str(e):
            raise HTTPException(status_code=409, detail="Provider already exists")
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True, "name": body.name, "label": body.label, "custom": True}


@router.put("/providers")
async def bulk_update_providers(body: BulkProvidersBody, request: Request):
    uid = _get_user_id(request)
    for p in body.providers:
        if not p.get("name") or not p.get("label"):
            continue
        upsert_provider(uid, p)
    _clear_provider_health_cache(uid)
    return {"ok": True}


@router.put("/providers/{name}")
async def update_provider(name: str, body: UpdateProviderParam, request: Request):
    uid = _get_user_id(request)
    if body.label is None:
        raise HTTPException(status_code=400, detail="label required")
    upsert_provider(uid, {"name": name, **body.model_dump(exclude_none=True)})
    _clear_provider_health_cache(uid, name)
    return {"ok": True}


@router.post("/providers/resolve-context")
async def resolve_provider_context(body: ResolveProviderContextBody, request: Request):
    uid = _get_user_id(request)
    provider_name = (body.name or "").strip()
    model = " ".join((body.model or "").split()).strip()
    if not model:
        raise HTTPException(status_code=400, detail="model required")

    base_url = (body.base_url or "").strip()
    api_key = body.api_key or ""
    provider_type = body.type or "openai"

    if provider_name:
        builtin = next((p for p in BUILTIN_PROVIDERS if p["name"] == provider_name), None)
        if builtin:
            base_url = base_url or builtin.get("baseURL") or ""
            provider_type = provider_type or builtin.get("type") or "openai"
            try:
                from api.services.provider_config import get_provider_config
                cfg = get_provider_config(provider_name, model)
                base_url = base_url or cfg.base_url or ""
                api_key = api_key or cfg.api_key or ""
                provider_type = cfg.type or provider_type
            except Exception:
                pass
        else:
            from api.services.user_store import get_connection
            with get_connection() as conn:
                row = conn.execute(
                    "SELECT type, base_url, api_key, model FROM custom_providers WHERE user_id = ? AND name = ?",
                    (uid, provider_name),
                ).fetchone()
            if row:
                base_url = base_url or row["base_url"] or ""
                api_key = api_key or row["api_key"] or ""
                provider_type = provider_type or row["type"] or "openai"
                model = model or row["model"] or ""

    try:
        from agent.model_metadata import get_model_context_length
        resolver_provider = "lmstudio" if provider_name in {"lmstudio", "lmstudio_local"} else (provider_name or provider_type or "")
        context_length = get_model_context_length(
            model,
            base_url=base_url,
            api_key=api_key,
            provider=resolver_provider,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Không dò được context model: {exc}") from exc

    return {
        "contextLength": context_length,
        "model": model,
        "provider": provider_name,
        "baseURL": base_url,
    }


@router.get("/providers/{name}/health")
async def check_provider_health(name: str, request: Request):
    """Check if a provider is reachable by pinging its API."""
    import aiohttp
    uid = _get_user_id(request)
    cache_key = f"{uid}:{name}"
    now = time.monotonic()
    with _provider_health_lock:
        cached = _provider_health_cache.get(cache_key)
        if cached and now - cached[0] < _PROVIDER_HEALTH_TTL_SECONDS:
            return {**cached[1], "cached": True}

    providers = get_providers(uid)
    prov = next((p for p in providers if p.get("name") == name), None)
    if not prov:
        prov = {"name": name}
    # Try to reach the provider
    base_url = prov.get("baseURL") or prov.get("base_url") or ""
    if not base_url:
        builtin_urls = {
            "deepseek": "https://api.deepseek.com",
            "openai": "https://api.openai.com",
            "anthropic": "https://api.anthropic.com",
            "gemini": "https://generativelanguage.googleapis.com",
        }
        base_url = builtin_urls.get(name, "")
    if base_url:
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as s:
                async with s.get(base_url) as r:
                    result = {"status": "ok" if r.status < 500 else "error", "code": r.status}
        except (asyncio.TimeoutError, Exception):
            result = {"status": "error", "code": 0}
    else:
        result = {"status": "unknown", "code": 0}
    with _provider_health_lock:
        _provider_health_cache[cache_key] = (time.monotonic(), result)
    return result


@router.delete("/providers/{name}")
async def remove_provider(name: str, request: Request):
    uid = _get_user_id(request)
    if name in {p["name"] for p in BUILTIN_PROVIDERS}:
        raise HTTPException(status_code=400, detail="Cannot delete built-in provider")
    delete_provider(uid, name)
    _clear_provider_health_cache(uid, name)
    return {"ok": True}


@router.get("/providers/{name}/models")
async def list_provider_models(name: str, request: Request):
    """Liệt kê model mà provider hỗ trợ (gọi /v1/models trên upstream)."""
    import aiohttp

    uid = _get_user_id(request)
    try:
        from api.services.provider_config import get_provider_config

        cfg = get_provider_config(name, "")
        base_url = (cfg.base_url or "").rstrip("/")
        api_key = cfg.api_key or ""
    except Exception:
        prov = next((p for p in get_providers(uid) if p.get("name") == name), None)
        if not prov:
            raise HTTPException(status_code=404, detail="Provider not found")
        base_url = (prov.get("baseURL") or "").rstrip("/")
        api_key = ""

    if not base_url:
        return {"models": []}
    if not base_url.endswith("/v1"):
        base_url = base_url + "/v1"

    headers = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=6)) as s:
            async with s.get(f"{base_url}/models", headers=headers) as r:
                if r.status >= 400:
                    return {"models": [], "error": f"HTTP {r.status}"}
                data = await r.json()
    except Exception as exc:
        return {"models": [], "error": str(exc)}

    items = data.get("data") or data.get("models") or []
    out: list[dict] = []
    for m in items:
        if isinstance(m, dict) and m.get("id"):
            out.append({"id": m["id"], "owned_by": m.get("owned_by", "")})
    return {"models": out}


@router.get("/claude-mode")
async def get_claude_mode(request: Request):
    uid = _get_user_id(request)
    user = get_user_by_id(uid)
    return {"mode": user.get("claude_mode", "qwen") if user else "qwen"}


@router.put("/claude-mode")
async def set_claude_mode(body: SetClaudeModeBody, request: Request):
    uid = _get_user_id(request)
    mode = body.mode
    if mode not in ("qwen", "deepseek"):
        raise HTTPException(status_code=400, detail='Invalid mode. Use "qwen" or "deepseek"')
    result = {"ok": True, "label": mode}
    try:
        from api.services.claude_settings import apply_claude_mode
        res = apply_claude_mode(mode)
        if not res.get("ok"):
            raise HTTPException(status_code=500, detail=res.get("error", "Failed"))
        result["label"] = res.get("label", mode)
    except ImportError:
        pass
    update_user(uid, {"claude_mode": mode})
    return {"mode": mode, "label": result["label"]}


@router.get("/agent")
async def get_default_agent(request: Request):
    uid = _get_user_id(request)
    user = get_user_by_id(uid)
    return {"agentId": user.get("default_agent", "") if user else ""}


@router.put("/agent")
async def set_default_agent(body: SetAgentBody, request: Request):
    uid = _get_user_id(request)
    update_user(uid, {"default_agent": body.agentId})
    return {"ok": True, "agentId": body.agentId}


@router.get("/devices")
async def list_devices(request: Request):
    uid = _get_user_id(request)
    current_token = _request_token(request, default="")
    current_session = get_session(current_token) if current_token else None
    current_device_id = current_session.get("device_id") if current_session else ""
    devices = list_user_devices(uid)
    legacy_sessions = [
        s for s in list_user_sessions(uid)
        if not s.get("device_id") and (s.get("device_name") or s.get("ip_address"))
    ]
    result = []
    for d in devices:
        d["current"] = bool(current_device_id and d["id"] == current_device_id)
        d["ip_address"] = d.get("last_ip_address") or d.get("first_ip_address") or ""
        d.pop("first_ip_address", None)
        d.pop("last_ip_address", None)
        result.append(d)
    for s in legacy_sessions:
        s["current"] = s["id"] == current_token
        s["session_count"] = 1
        s.pop("user_agent", None)
        result.append(s)
    hidden = max(0, len(list_user_sessions(uid)) - sum(int(d.get("session_count") or 0) for d in result))
    return {"devices": result, "hidden": hidden}


@router.get("/device-status")
async def device_status(request: Request):
    """Endpoint không cần auth — thiết bị pending dùng để poll trạng thái duyệt."""
    token = request.query_params.get("t", "")
    if not token:
        raise HTTPException(status_code=400, detail="missing token")
    from api.services.user_store import get_session
    session = get_session(token)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    device_id = session.get("device_id") or ""
    if device_id:
        device = get_device(device_id)
        if not device:
            return {"status": "revoked"}
        return {"status": device.get("status") or session.get("status") or "approved"}
    return {"status": session.get("status") or "approved"}


@router.post("/devices/{device_id}/approve")
async def approve_device(device_id: str, request: Request):
    uid = _get_user_id(request)
    # Chỉ admin mới được duyệt thiết bị truy cập cho user.
    if not is_admin(uid):
        raise HTTPException(status_code=403, detail="Chỉ admin mới được duyệt thiết bị")
    ok = rbac.admin_approve_device(device_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Thiết bị không tồn tại")
    user = get_user_by_id(uid)
    rbac.log_audit(uid, user.get("username", "") if user else "", "device.approve",
                   "device", device_id, None, _client_ip(request))
    return {"ok": True}


@router.delete("/devices/empty")
async def purge_empty_devices(request: Request):
    uid = _get_user_id(request)
    auth = request.headers.get("authorization", "")
    current_token = auth.replace("Bearer ", "").strip() or request.query_params.get("t", "")
    from api.services.user_store import get_connection
    with get_connection() as conn:
        cur = conn.execute(
            "DELETE FROM sessions WHERE user_id = ? AND id != ? AND (ip_address = '' OR ip_address IS NULL) AND (device_name = '' OR device_name IS NULL)",
            (uid, current_token),
        )
    return {"ok": True, "deleted": cur.rowcount}


@router.delete("/devices/others")
async def revoke_others(request: Request):
    uid = _get_user_id(request)
    auth = request.headers.get("authorization", "")
    current_token = auth.replace("Bearer ", "").strip() or request.query_params.get("t", "")
    count = revoke_other_devices(current_token, uid)
    return {"ok": True, "revoked": count}


@router.delete("/devices/{device_id}")
async def revoke_device(device_id: str, request: Request):
    uid = _get_user_id(request)
    ok = revoke_device_for_user(device_id, uid)
    if not ok:
        raise HTTPException(status_code=404, detail="Thiết bị không tồn tại")
    return {"ok": True}


@router.get("/models/status")
async def get_models_status(request: Request):
    """Return all providers with health + account usage/balance info."""
    uid = _get_user_id(request)
    providers = get_providers(uid)

    import aiohttp
    from agent.account_usage import fetch_account_usage, AccountUsageSnapshot, AccountUsageWindow, render_account_usage_lines

    builtin_urls = {
        "deepseek": "https://api.deepseek.com",
        "openai": "https://api.openai.com",
        "anthropic": "https://api.anthropic.com",
        "gemini": "https://generativelanguage.googleapis.com",
    }

    results = []
    for prov in providers:
        name = prov.get("name", "")
        label = prov.get("label", name)
        base_url = prov.get("baseURL") or prov.get("base_url") or builtin_urls.get(name, "")
        ptype = prov.get("type", "openai")

        health = {"status": "unknown", "code": 0}
        if base_url:
            try:
                async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=4)) as s:
                    async with s.get(base_url) as r:
                        health = {"status": "ok" if r.status < 500 else "error", "code": r.status}
            except Exception:
                health = {"status": "error", "code": 0}

        usage = None
        try:
            snapshot = fetch_account_usage(
                name,
                base_url=base_url,
                api_key=prov.get("api_key") or "",
            )
            if snapshot and snapshot.available:
                usage = {"title": snapshot.title, "plan": snapshot.plan or ""}
                windows = []
                for w in snapshot.windows:
                    remaining = max(0, round(100 - float(w.used_percent))) if w.used_percent is not None else None
                    windows.append({
                        "label": w.label,
                        "used_percent": w.used_percent,
                        "remaining_percent": remaining,
                        "reset_at": w.reset_at.isoformat() if w.reset_at else None,
                        "detail": w.detail,
                    })
                usage["windows"] = windows
                usage["details"] = list(snapshot.details)
        except Exception:
            pass

        results.append({
            "name": name,
            "label": label,
            "type": ptype,
            "base_url": base_url,
            "authenticated": bool(prov.get("api_key") or ptype in {"ollama", "lmstudio", "lmstudio_local", "llamacpp", "cx"}),
            "health": health,
            "usage": usage,
        })

    return {"providers": results}


@router.post("/models/test")
async def test_model_key(request: Request):
    """Send a minimal chat-completion request to verify the provider's API key works."""
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="missing provider name")

    uid = _get_user_id(request)
    providers = get_providers(uid)
    prov = next((p for p in providers if p.get("name") == name), None)
    if not prov:
        raise HTTPException(status_code=404, detail=f"provider '{name}' not found")

    api_key = (prov.get("api_key") or "").strip()
    ptype = (prov.get("type") or "openai").lower()
    base_url = (prov.get("baseURL") or prov.get("base_url") or "").rstrip("/")
    model = (prov.get("model") or "").strip()

    builtin_urls = {
        "deepseek": "https://api.deepseek.com",
        "openai": "https://api.openai.com",
        "anthropic": "https://api.anthropic.com",
        "gemini": "https://generativelanguage.googleapis.com",
    }
    if not base_url:
        base_url = builtin_urls.get(name, "")

    is_local = ptype in {"ollama", "lmstudio", "lmstudio_local", "llamacpp", "cx"}

    if ptype == "anthropic" or name == "anthropic":
        if not base_url:
            return {"ok": False, "status": 0, "error": "no base_url for anthropic"}
        url = f"{base_url}/v1/messages"
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        payload = {"model": model or "claude-3-5-haiku-latest", "max_tokens": 1, "messages": [{"role": "user", "content": "hi"}]}
    elif ptype == "gemini" or name == "gemini":
        if not base_url:
            return {"ok": False, "status": 0, "error": "no base_url for gemini"}
        gemini_model = model or "gemini-2.0-flash"
        url = f"{base_url}/v1beta/models/{gemini_model}:generateContent"
        headers = {"Content-Type": "application/json", "x-goog-api-key": api_key}
        payload = {"contents": [{"parts": [{"text": "hi"}]}], "generationConfig": {"maxOutputTokens": 1}}
    else:
        if not base_url:
            return {"ok": False, "status": 0, "error": "no base_url"}
        url = f"{base_url}/chat/completions"
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        chat_model = model or "gpt-3.5-turbo"
        payload = {"model": chat_model, "messages": [{"role": "user", "content": "hi"}], "max_tokens": 1}

    import aiohttp
    try:
        timeout = aiohttp.ClientTimeout(total=12)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, headers=headers, json=payload) as r:
                body_text = await r.text()
                ok = 200 <= r.status < 300
                return {
                    "ok": ok,
                    "status": r.status,
                    "endpoint": url,
                    "error": None if ok else body_text[:300],
                }
    except asyncio.TimeoutError:
        return {"ok": False, "status": 0, "endpoint": url, "error": "timeout after 12s"}
    except Exception as exc:
        return {"ok": False, "status": 0, "endpoint": url, "error": str(exc)[:300]}
