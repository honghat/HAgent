from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from api.services.auto_fetch import (
    AutoFetchError,
    create_auto_fetch_source,
    delete_auto_fetch_source,
    get_auto_fetch_source,
    list_auto_fetch_sources,
    run_auto_fetch_source,
    update_auto_fetch_source,
)
from api.services.user_store import resolve_user_id

router = APIRouter(prefix="/api/auto-fetch", tags=["auto-fetch"])


class AutoFetchCreateBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: str = Field(default="rss", max_length=20)
    url: str = Field(min_length=1, max_length=1000)
    config: dict = Field(default_factory=dict)
    enabled: bool = True
    interval_seconds: int = Field(default=1200, ge=60)


class AutoFetchUpdateBody(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    kind: str | None = Field(default=None, max_length=20)
    url: str | None = Field(default=None, min_length=1, max_length=1000)
    config: dict | None = None
    enabled: bool | None = None
    interval_seconds: int | None = Field(default=None, ge=60)
    next_run_at: str | None = None


def _user_id(request: Request) -> str:
    token = request.headers.get("authorization", "").replace("Bearer ", "").strip()
    user_id = resolve_user_id(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user_id


@router.get("")
def list_items(request: Request):
    return {"sources": list_auto_fetch_sources(_user_id(request))}


@router.post("")
def create_item(body: AutoFetchCreateBody, request: Request):
    try:
        return create_auto_fetch_source(
            _user_id(request),
            name=body.name.strip(),
            kind=body.kind,
            url=body.url,
            config=body.config,
            enabled=body.enabled,
            interval_seconds=body.interval_seconds,
        )
    except AutoFetchError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{source_id}")
def get_item(source_id: str, request: Request):
    item = get_auto_fetch_source(source_id, _user_id(request))
    if not item:
        raise HTTPException(status_code=404, detail="Auto-fetch source not found")
    return item


@router.put("/{source_id}")
def update_item(source_id: str, body: AutoFetchUpdateBody, request: Request):
    user_id = _user_id(request)
    if not get_auto_fetch_source(source_id, user_id):
        raise HTTPException(status_code=404, detail="Auto-fetch source not found")
    item = update_auto_fetch_source(source_id, user_id, body.model_dump(exclude_unset=True))
    return item


@router.delete("/{source_id}")
def delete_item(source_id: str, request: Request):
    if not delete_auto_fetch_source(source_id, _user_id(request)):
        raise HTTPException(status_code=404, detail="Auto-fetch source not found")
    return {"deleted": True}


@router.post("/{source_id}/run")
def run_item(source_id: str, request: Request):
    item = get_auto_fetch_source(source_id, _user_id(request))
    if not item:
        raise HTTPException(status_code=404, detail="Auto-fetch source not found")
    try:
        return run_auto_fetch_source(item)
    except AutoFetchError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
