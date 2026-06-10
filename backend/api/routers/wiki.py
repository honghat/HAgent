"""Wiki router -- full CRUD, search, export, synthesis, RAG reindex."""

import asyncio
import json
import zipfile
import io

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from api.services.db import get_db
from api.services.wiki_memory import resolve_user_id, save_wiki_entry, search_wiki
from api.services.wiki_store import (
    get_entry, update_entry, delete_entry, list_topics,
    export_to_markdown, synthesize_topic, auto_restructure, reindex_all,
)

router = APIRouter(prefix="/api/wiki", tags=["wiki"])


def _sse(data: dict) -> bytes:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n".encode()


def _uid(request):
    return resolve_user_id(request.headers.get("authorization"))


@router.get("")
def list_wiki(request: Request):
    uid = _uid(request)
    with get_db() as conn:
        conn.row_factory = None
        rows = conn.execute(
            "SELECT id, title, summary, content, topics, created_at, updated_at FROM wiki_entries WHERE user_id = ? ORDER BY updated_at DESC",
            (uid,),
        ).fetchall()
        entries, tmap = [], {}
        for r in rows:
            raw = r[4]
            if not raw:
                tl = ["general"]
            else:
                try:
                    tl = json.loads(raw)
                    if not isinstance(tl, list):
                        tl = [str(tl)]
                except (json.JSONDecodeError, TypeError):
                    tl = [t.strip() for t in str(raw).split(",") if t.strip()] or ["general"]
            e = {"id": r[0], "title": r[1], "summary": r[2], "content": r[3], "topics": tl,
                 "created_at": r[5], "updated_at": r[6]}
            entries.append(e)
            for t in tl:
                tmap.setdefault(t, []).append(e)
        return {"entries": entries, "topics": tmap, "total": len(entries)}


@router.get("/search")
def search(request: Request, q: str = ""):
    if not q:
        return []
    return search_wiki(_uid(request), q)


@router.get("/topics")
def topics(request: Request):
    return list_topics(_uid(request))


@router.get("/export")
def export(request: Request):
    result = export_to_markdown(_uid(request))
    if not result or not result.get("files"):
        raise HTTPException(status_code=404, detail="No entries")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in result["files"]:
            zf.writestr(f["path"], f["content"])
    buf.seek(0)
    return StreamingResponse(
        buf, media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="wiki.zip"'},
    )


@router.get("/{entry_id}")
def get_entry_endpoint(entry_id: str, request: Request):
    e = get_entry(entry_id, _uid(request))
    if not e:
        raise HTTPException(status_code=404, detail="Not found")
    return e


@router.post("")
def create(request: Request, payload: dict):
    uid = _uid(request)
    entry = {"title": payload.get("title", ""), "summary": payload.get("summary", ""),
             "content": payload.get("content", ""), "topics": payload.get("topics", ["general"])}
    r = save_wiki_entry(uid, entry, source="manual")
    if not r:
        raise HTTPException(status_code=400, detail="Could not save")
    return {"id": r["id"], "title": r["title"]}


@router.put("/{entry_id}")
def update(entry_id: str, request: Request, payload: dict):
    uid = _uid(request)
    if not get_entry(entry_id, uid):
        raise HTTPException(status_code=404, detail="Not found")
    updates = {}
    for field in ("title", "summary", "content", "topics"):
        if field in payload:
            v = payload[field]
            if field == "topics" and isinstance(v, list):
                v = json.dumps(v)
            updates[field] = v
    try:
        r = update_entry(entry_id, uid, updates)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return r or {"ok": True}


@router.delete("/{entry_id}")
def delete(entry_id: str, request: Request):
    if not delete_entry(entry_id, _uid(request)):
        raise HTTPException(status_code=404, detail="Not found")
    return {"deleted": True}


@router.post("/synthesize/{topic}")
async def synthesize(topic: str, request: Request, payload: dict = {}):
    uid = _uid(request)
    provider = payload.get("provider")

    async def event_stream():
        yield _sse({"type": "start", "message": f"Đang tổng hợp chủ đề '{topic}'..."})
        try:
            result = await asyncio.to_thread(synthesize_topic, topic, uid, provider)
            yield _sse({"type": "done", **result})
        except Exception as exc:
            yield _sse({"type": "error", "error": str(exc)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/restructure")
async def restructure(request: Request, payload: dict = {}):
    """SSE streaming: push events khi restructure đang chạy thay vì block."""
    uid = _uid(request)
    provider = payload.get("provider")

    async def event_stream():
        yield _sse({"type": "start", "message": "Đang phân tích wiki..."})
        try:
            result = await asyncio.to_thread(auto_restructure, uid, provider)
            yield _sse({"type": "done", **result})
        except Exception as exc:
            yield _sse({"type": "error", "error": str(exc)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/reindex")
def reindex(request: Request):
    return reindex_all(_uid(request))
