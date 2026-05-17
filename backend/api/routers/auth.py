"""Auth router — register, login, logout, me, providers, claude-mode."""

import asyncio
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from api.services.user_store import (
    init_user_tables, create_user, get_user_by_id, get_user_by_username, update_user,
    authenticate_user, create_session, delete_session, resolve_user_id,
    get_providers, upsert_provider, delete_provider, BUILTIN_PROVIDERS,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Ensure tables on first import
init_user_tables()


def _get_user_id(request: Request) -> str:
    """Extract user ID from auth header, matching Node's requireAuth."""
    auth = request.headers.get("authorization", "")
    token = auth.replace("Bearer ", "").strip() or request.query_params.get("t", "hat")
    uid = resolve_user_id(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return uid


# ── Models ───────────────────────────────────────────────────────────────

class RegisterBody(BaseModel):
    username: str
    password: str
    displayName: Optional[str] = None

class LoginBody(BaseModel):
    username: str
    password: str

class UpdateMeBody(BaseModel):
    displayName: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None

class SetProviderBody(BaseModel):
    provider: str

class CustomProviderBody(BaseModel):
    name: str
    label: str
    type: Optional[str] = "openai"
    base_url: Optional[str] = ""
    api_key: Optional[str] = ""
    model: Optional[str] = ""

class BulkProvidersBody(BaseModel):
    providers: list[dict]

class UpdateProviderParam(BaseModel):
    label: Optional[str] = None
    type: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None

class SetClaudeModeBody(BaseModel):
    mode: str


# ── Endpoints ────────────────────────────────────────────────────────────

@router.post("/register")
async def register(body: RegisterBody):
    if not body.username or not body.password:
        raise HTTPException(status_code=400, detail="Username and password required")
    if len(body.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    try:
        user = create_user(body.username, body.password, body.displayName)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    token = create_session(user["id"])
    return {"token": token, "user": user}


@router.post("/login")
async def login(body: LoginBody):
    if not body.username or not body.password:
        raise HTTPException(status_code=400, detail="Username and password required")
    user = authenticate_user(body.username, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_session(user["id"])
    return {
        "token": token,
        "user": {"id": user["id"], "username": user["username"], "displayName": user["display_name"]},
    }


@router.post("/logout")
async def logout(request: Request):
    auth = request.headers.get("authorization", "")
    token = auth.replace("Bearer ", "").strip() or request.query_params.get("t", "")
    if token:
        delete_session(token)
    return {"ok": True}


@router.get("/me")
async def get_me(request: Request):
    uid = _get_user_id(request)
    user = get_user_by_id(uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
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
    update_user(uid, {"default_provider": provider})
    if provider in builtin_names:
        update_user(uid, {"claude_mode": provider})
        # Try to apply claude settings (best-effort)
        try:
            from api.services.claude_settings import apply_claude_mode
            apply_claude_mode(provider)
        except ImportError:
            pass
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
    return {"ok": True}


@router.put("/providers/{name}")
async def update_provider(name: str, body: UpdateProviderParam, request: Request):
    uid = _get_user_id(request)
    if body.label is None:
        raise HTTPException(status_code=400, detail="label required")
    upsert_provider(uid, {"name": name, **body.model_dump(exclude_none=True)})
    return {"ok": True}


@router.get("/providers/{name}/health")
async def check_provider_health(name: str, request: Request):
    """Check if a provider is reachable by pinging its API."""
    import aiohttp
    uid = _get_user_id(request)
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
                    return {"status": "ok" if r.status < 500 else "error", "code": r.status}
        except (asyncio.TimeoutError, Exception):
            return {"status": "error", "code": 0}
    return {"status": "unknown", "code": 0}


@router.delete("/providers/{name}")
async def remove_provider(name: str, request: Request):
    uid = _get_user_id(request)
    if name in {p["name"] for p in BUILTIN_PROVIDERS}:
        raise HTTPException(status_code=400, detail="Cannot delete built-in provider")
    delete_provider(uid, name)
    return {"ok": True}


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
