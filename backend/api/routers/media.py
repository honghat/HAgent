"""Media router — agent pushes URLs here, frontend polls and opens in new tab."""

from fastapi import APIRouter, HTTPException, Request

from api.services.media_queue import ack, pending, push
from api.services.wiki_memory import resolve_user_id

router = APIRouter(prefix="/api/media", tags=["media"])


def _uid(request: Request) -> str:
    return resolve_user_id(request.headers.get("authorization"))


@router.get("/pending")
def list_pending(request: Request):
    return {"items": pending(_uid(request))}


@router.post("/push")
async def push_item(request: Request):
    """Manual/test endpoint — usually the agent calls the tool, not this."""
    body = await request.json()
    url = (body.get("url") or "").strip()
    title = (body.get("title") or "").strip()
    if not url:
        raise HTTPException(400, "url required")
    return push(_uid(request), url, title=title)


@router.post("/ack/{item_id}")
def ack_item(item_id: str, request: Request):
    ok = ack(_uid(request), item_id)
    return {"ok": ok}
