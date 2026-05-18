"""OmniChat — unified multi-platform messaging hub."""

from __future__ import annotations

import json
import queue
import threading
import uuid
from datetime import datetime
import requests
import qrcode
import base64
import io

from fastapi import APIRouter, HTTPException, Request, Query
from fastapi.responses import StreamingResponse

from api.schemas import (
    OmniConversation,
    OmniMessage,
    OmniContact,
    OmniStats,
    OmniSendMessageRequest,
    OmniRenameRequest,
    OmniReactionRequest,
    OmniSyncMessagesRequest,
    OmniConnectFacebookRequest,
    OmniQRStatusResponse,
)
from api.services.omni_store import (
    list_conversations,
    get_conversation,
    get_conversation_messages,
    create_message,
    ensure_conversation,
    delete_conversation,
    delete_message,
    toggle_pin_conversation,
    rename_conversation,
    list_contacts,
    get_today_stats,
    add_reaction,
)
from api.services.user_store import resolve_user_id

router = APIRouter(prefix="/omni", tags=["OmniChat"])


def _get_user_id(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    token = auth.replace("Bearer ", "").strip() or request.query_params.get("t", "hat")
    uid = resolve_user_id(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return uid


# ── SSE Event Bus ──────────────────────────────────────────────────────────

_omni_listeners: list[queue.Queue] = []
_omni_listeners_lock = threading.Lock()


def _broadcast(event: dict) -> None:
    with _omni_listeners_lock:
        dead: list[queue.Queue] = []
        for q in _omni_listeners:
            try:
                q.put_nowait(event)
            except Exception:
                dead.append(q)
        for q in dead:
            _omni_listeners.remove(q)


# ── Conversations ──────────────────────────────────────────────────────────


@router.get("/conversations", response_model=list[OmniConversation])
def get_conversations(request: Request):
    uid = _get_user_id(request)
    return [OmniConversation(**c) for c in list_conversations(uid)]


@router.get("/conversations/{id}/messages", response_model=list[OmniMessage])
def get_conversation_messages_endpoint(
    id: str,
    request: Request,
    limit: int = Query(100, le=500),
    before: str | None = Query(None),
):
    _get_user_id(request)
    conv = get_conversation(id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    msgs = get_conversation_messages(id, limit=limit, before_id=before)
    return [
        OmniMessage(
            id=m["id"],
            sender_type=m["sender_type"],
            content=m["content"],
            reply_to=m["reply_to"],
            external_author_name=m["external_author_name"],
            reactions=m["reactions"],
            status=m["status"],
            created_at=m["created_at"],
        )
        for m in msgs
    ]


@router.post("/conversations/{id}/messages")
def send_message(id: str, payload: OmniSendMessageRequest, request: Request):
    uid = _get_user_id(request)
    conv = get_conversation(id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    msg_id = create_message(
        conversation_id=id,
        user_id=uid,
        role="user",
        content=payload.content,
        reply_to_id=payload.reply_to_id or None,
        platform=conv.get("platform"),
    )

    _broadcast({
        "type": "message",
        "conversationId": id,
        "message": {
            "id": msg_id,
            "sender_type": "user",
            "content": payload.content,
            "reply_to_id": payload.reply_to_id,
            "status": "sent",
        },
    })

    return {"id": msg_id, "status": "sent"}


@router.delete("/conversations/{id}")
def delete_conversation_endpoint(id: str, request: Request):
    _get_user_id(request)
    if not delete_conversation(id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"deleted": True}


@router.post("/conversations/{id}/toggle-pin")
def toggle_pin(id: str, request: Request):
    _get_user_id(request)
    new_state = toggle_pin_conversation(id)
    if new_state is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"pinned": new_state}


@router.post("/conversations/{id}/rename")
def rename(id: str, payload: OmniRenameRequest, request: Request):
    _get_user_id(request)
    if not rename_conversation(id, payload.custom_name):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"customName": payload.custom_name}


# ── Messages ───────────────────────────────────────────────────────────────


@router.delete("/messages/{id}")
def delete_message_endpoint(id: str, request: Request):
    _get_user_id(request)
    if not delete_message(id):
        raise HTTPException(status_code=404, detail="Message not found")
    return {"deleted": True}


@router.post("/messages/{id}/reaction")
def react_to_message(id: str, payload: OmniReactionRequest, request: Request):
    uid = _get_user_id(request)
    if not add_reaction(id, payload.emoji, uid):
        raise HTTPException(status_code=404, detail="Message not found")
    return {"emoji": payload.emoji, "added": True}


# ── Contacts ───────────────────────────────────────────────────────────────


@router.get("/contacts", response_model=list[OmniContact])
def get_contacts(
    request: Request,
    platform: str | None = Query(None),
):
    uid = _get_user_id(request)
    return [OmniContact(**c) for c in list_contacts(uid, platform)]


# ── Stats ──────────────────────────────────────────────────────────────────


@router.get("/stats/today", response_model=OmniStats)
def today_stats(request: Request):
    uid = _get_user_id(request)
    return OmniStats(**get_today_stats(uid))


# ── SSE Events ─────────────────────────────────────────────────────────────


@router.get("/events")
def event_stream(request: Request):
    """SSE endpoint for real-time updates. Auth via ?t= query param."""
    # Validate auth
    _get_user_id(request)

    events: queue.Queue = queue.Queue()
    with _omni_listeners_lock:
        _omni_listeners.append(events)

    def _cleanup():
        with _omni_listeners_lock:
            if events in _omni_listeners:
                _omni_listeners.remove(events)

    def event_stream_gen():
        try:
            yield f"data: {json.dumps({'type': 'connected'}, ensure_ascii=False)}\n\n".encode("utf-8")
            while True:
                event = events.get(timeout=30)
                if event is None:
                    break
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n".encode("utf-8")
                # Also emit 'omni' event type that frontend listens for
                yield f"event: omni\ndata: {json.dumps(event, ensure_ascii=False)}\n\n".encode("utf-8")
        except queue.Empty:
            yield ": keepalive\n\n".encode("utf-8")
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


# ── Sync / Connect Stubs ───────────────────────────────────────────────────


@router.post("/sync/zalo/qr/start")
def start_zalo_qr():
    try:
        resp = requests.post("http://127.0.0.1:8080/api/v1/auth/zalo/qrcode/init", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            qr_url = data.get("qr_url")
            if qr_url:
                qr = qrcode.QRCode(version=1, box_size=10, border=4)
                qr.add_data(qr_url)
                qr.make(fit=True)
                img = qr.make_image(fill_color="black", back_color="white")
                buf = io.BytesIO()
                img.save(buf, format="PNG")
                b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
                qr_base64 = f"data:image/png;base64,{b64}"
                
                session_id = str(uuid.uuid4())
                return {
                    "session": session_id,
                    "session_id": session_id,
                    "qr": qr_base64,
                    "status": "pending",
                    "detail": data.get("message", "Quét QR bằng Zalo trên điện thoại.")
                }
    except Exception as e:
        print(f"Lỗi gọi backend Zalo 8080: {e}")
        
    session_id = str(uuid.uuid4())
    return {
        "session": session_id,
        "session_id": session_id,
        "qr": None,
        "status": "unavailable",
        "detail": "Không thể kết nối đến backend Zalo (port 8080). Hãy đảm bảo backend đã chạy.",
    }


@router.get("/sync/zalo/qr/{session}/status", response_model=OmniQRStatusResponse)
def check_zalo_qr_status(session: str):
    try:
        resp = requests.get(f"http://127.0.0.1:8080/api/v1/auth/zalo/qrcode/poll/{session}", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            status = data.get("status", "pending")
            if status == "success":
                status = "connected"
                
            return OmniQRStatusResponse(
                session=session,
                status=status,
                detail=data.get("message", "Đang quét...")
            )
    except Exception:
        pass
        
    return OmniQRStatusResponse(
        session=session,
        status="pending",
        detail="Đang chờ quét QR Zalo...",
    )


@router.post("/sync/zalo/messages")
def sync_zalo_messages(payload: OmniSyncMessagesRequest):
    return {
        "synced_contacts": 0,
        "synced_conversations": 0,
        "synced_messages": 0,
        "status": "Đồng bộ Zalo trong OmniChat chưa được nối với Zalo web session.",
    }


@router.post("/connect/facebook")
def connect_facebook(payload: OmniConnectFacebookRequest):
    return {"connected": False, "status": "Kết nối Facebook trong OmniChat chưa được nối với SDK/web session."}


@router.post("/sync/facebook/messages")
def sync_facebook_messages(payload: OmniSyncMessagesRequest):
    return {
        "synced_conversations": 0,
        "synced_messages": 0,
        "status": "Đồng bộ Facebook trong OmniChat chưa được nối với SDK/web session.",
    }
