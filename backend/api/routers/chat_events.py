"""SSE endpoint for real-time chat events (session/message updates)."""

from __future__ import annotations

import json
import time

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from api.services.chat_events import broadcast_chat_event, register_listener, unregister_listener
from api.services.user_store import resolve_user_id

router = APIRouter(prefix="/chat", tags=["chat-events"])


@router.get("/events")
def event_stream(request: Request):
    auth = request.headers.get("authorization", "")
    token = auth.replace("Bearer ", "").strip() or request.query_params.get("t", "")
    uid = resolve_user_id(token)
    if not uid:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

    q = register_listener()

    def _cleanup():
        unregister_listener(q)

    def event_stream_gen():
        last_keepalive = time.time()
        try:
            yield f"data: {json.dumps({'type': 'connected'}, ensure_ascii=False)}\n\n".encode("utf-8")
            while True:
                try:
                    event = q.get(timeout=15)
                    if event is None:
                        break
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n".encode("utf-8")
                    last_keepalive = time.time()
                except Exception:
                    if time.time() - last_keepalive > 15:
                        yield ": keepalive\n\n".encode("utf-8")
                        last_keepalive = time.time()
        except GeneratorExit:
            _cleanup()
            raise
        finally:
            _cleanup()

    return StreamingResponse(
        event_stream_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
