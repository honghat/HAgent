"""SSE endpoint toàn cục để agent push real-time data xuống mọi frontend tab.

Endpoint: GET /api/agent/stream?t={token}

Frontend subscribe một lần duy nhất, nhận tất cả event từ agent.
"""

from __future__ import annotations

import asyncio
import json
import queue
import time

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from api.services.agent_events import (
    broadcast_agent_event,
    listener_count,
    register_listener,
    unregister_listener,
)
from api.services.user_store import resolve_user_id

router = APIRouter(prefix="/agent", tags=["agent-stream"])


@router.get("/stream")
async def agent_event_stream(request: Request):
    """SSE stream: agent push data xuống frontend theo thời gian thực."""
    auth = request.headers.get("authorization", "")
    token = auth.replace("Bearer ", "").strip() or request.query_params.get("t", "")
    uid = resolve_user_id(token)
    if not uid:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

    q = register_listener()

    async def event_gen():
        try:
            yield f"data: {json.dumps({'type': 'agent.connected', 'clients': listener_count()}, ensure_ascii=False)}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.to_thread(q.get, True, 10)
                    if event is None:
                        break
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                except queue.Empty:
                    yield ": keepalive\n\n"
        finally:
            unregister_listener(q)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Content-Type": "text/event-stream; charset=utf-8",
        },
    )


@router.get("/stream/status")
def agent_stream_status():
    """Kiểm tra số client đang kết nối SSE."""
    return {"connected_clients": listener_count()}


@router.post("/stream/broadcast")
def agent_broadcast(event_type: str, payload: dict):
    """Manually push một event từ bất kỳ nơi nào trong backend."""
    broadcast_agent_event(event_type, payload)
    return {"ok": True, "clients": listener_count()}
