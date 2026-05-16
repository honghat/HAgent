"""Telegram OmniChat endpoints — QR login + sync stubs."""

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
    _qr_sessions[session_id] = "pending"
    return {
        "session_id": session_id,
        "qr": "data:image/png;base64,",
        "status": "pending",
    }


@router.get("/qr/{session}/status", response_model=OmniQRStatusResponse)
def qr_status(session: str):
    status = _qr_sessions.get(session, "expired")
    return OmniQRStatusResponse(
        session=session,
        status=status,
    )


@router.post("/sync/messages")
def sync_messages(payload: OmniSyncMessagesRequest):
    return {
        "synced_conversations": 0,
        "synced_messages": 0,
        "status": "stub — Telegram SDK not installed",
    }
