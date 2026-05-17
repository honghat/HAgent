"""Telegram OmniChat endpoints — sync placeholders."""

from __future__ import annotations

import uuid

from fastapi import APIRouter

from api.schemas import OmniSyncMessagesRequest, OmniQRStatusResponse

router = APIRouter(prefix="/telegram", tags=["OmniChat - Telegram"])

# In-memory QR session store (resets on server restart)
_qr_sessions: dict[str, str] = {}


@router.post("/qr/start")
def start_qr():
    session_id = str(uuid.uuid4())
    _qr_sessions[session_id] = "unavailable"
    return {
        "session_id": session_id,
        "qr": None,
        "status": "unavailable",
        "detail": "OmniChat hiện chưa bật đăng nhập QR Telegram. Telegram đang dùng bot token ở dịch vụ riêng.",
    }


@router.get("/qr/{session}/status", response_model=OmniQRStatusResponse)
def qr_status(session: str):
    status = _qr_sessions.get(session, "expired")
    return OmniQRStatusResponse(
        session=session,
        status=status,
        detail="OmniChat hiện chưa bật đăng nhập QR Telegram. Telegram đang dùng bot token ở dịch vụ riêng." if status == "unavailable" else None,
    )


@router.post("/sync/messages")
def sync_messages(payload: OmniSyncMessagesRequest):
    return {
        "synced_conversations": 0,
        "synced_messages": 0,
        "status": "Đồng bộ Telegram trong OmniChat chưa được nối với bot/gateway.",
    }
