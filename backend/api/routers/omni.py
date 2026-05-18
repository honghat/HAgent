"""OmniChat — unified multi-platform messaging hub."""

from __future__ import annotations

import json
import queue
import asyncio
import base64
import io
import logging
import os
import re
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.request
import uuid
import hashlib
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List
from PIL import Image, ImageOps

from api.schemas import (
    OmniConversation,
    OmniMessage,
    OmniContact,
    OmniStats,
    OmniSendMessageRequest,
    OmniSendMediaRequest,
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
    delete_contact,
    delete_message,
    toggle_pin_conversation,
    rename_conversation,
    list_contacts,
    get_today_stats,
    add_reaction,
    upsert_contact,
    update_conversation_preview,
    refresh_conversation_preview,
)
from api.services.db import get_connection
from api.services.user_store import resolve_user_id
from api.services.agent_reply import generate_reply

router = APIRouter(prefix="/omni", tags=["OmniChat"])

BACKEND_ROOT = Path(__file__).resolve().parents[2]
ZALO_SYNC_BRIDGE = BACKEND_ROOT / "plugins/platforms/omnichannel/backend/zalo_bridges/zalo_sync_bridge.py"
ZALO_SEND_BRIDGE = BACKEND_ROOT / "plugins/platforms/omnichannel/backend/zalo_bridges/zalo_send_bridge.py"
ZALO_LISTEN_BRIDGE = BACKEND_ROOT / "plugins/platforms/omnichannel/backend/zalo_bridges/zalo_listen_bridge.py"
FACEBOOK_SEND_BRIDGE = BACKEND_ROOT / "plugins/platforms/omnichannel/backend/facebook_bridges/facebook_send_bridge.py"
FACEBOOK_SYNC_BRIDGE = BACKEND_ROOT / "plugins/platforms/omnichannel/backend/facebook_bridges/facebook_sync_bridge.py"


class OmniAgentReplyRequest(BaseModel):
    provider: str | None = None
    model: str | None = None


class OmniAgentAutoReplyToggleRequest(BaseModel):
    enabled: bool
    provider: str | None = None
    model: str | None = None


def _get_user_id(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    token = auth.replace("Bearer ", "").strip() or request.query_params.get("t", "hat")
    uid = resolve_user_id(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return uid


def _resolve_omni_conversation(id: str, user_id: str) -> dict | None:
    conv = get_conversation(id)
    if conv:
        return conv
    with get_connection() as conn:
        contact = conn.execute(
            """SELECT platform, external_id, name, avatar_url
               FROM omni_contacts
               WHERE id = ? AND user_id = ?
               LIMIT 1""",
            (id, user_id),
        ).fetchone()
    if not contact or not contact["external_id"]:
        return None
    return ensure_conversation(
        user_id,
        contact["platform"],
        contact["name"] or contact["external_id"],
        contact["external_id"],
        "user",
        contact["avatar_url"] or "",
    )


def _agent_session_id(user_id: str, conversation_id: str) -> str:
    return f"omni-agent-{user_id[:8]}-{conversation_id}"


def _latest_incoming_message_id(conversation_id: str) -> str:
    with get_connection() as conn:
        row = conn.execute(
            """SELECT id FROM omni_messages
               WHERE conversation_id = ? AND role != 'user'
               ORDER BY created_at DESC LIMIT 1""",
            (conversation_id,),
        ).fetchone()
    return str(row["id"] or "") if row else ""


def _get_agent_auto_reply_state(user_id: str, conversation_id: str) -> dict:
    with get_connection() as conn:
        row = conn.execute(
            """SELECT * FROM omni_agent_auto_reply
               WHERE user_id = ? AND conversation_id = ?""",
            (user_id, conversation_id),
        ).fetchone()
    if row:
        return {
            "enabled": bool(row["enabled"]),
            "session_id": row["session_id"] or _agent_session_id(user_id, conversation_id),
            "provider": row["provider"] or "",
            "model": row["model"] or "",
            "last_processed_message_id": row["last_processed_message_id"] or "",
            "last_error": row["last_error"] or "",
        }
    return {
        "enabled": False,
        "session_id": _agent_session_id(user_id, conversation_id),
        "provider": "",
        "model": "",
        "last_processed_message_id": "",
        "last_error": "",
    }


def _set_agent_auto_reply_state(
    user_id: str,
    conversation_id: str,
    enabled: bool,
    provider: str | None = None,
    model: str | None = None,
) -> dict:
    session_id = _agent_session_id(user_id, conversation_id)
    last_processed = _latest_incoming_message_id(conversation_id) if enabled else ""
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO omni_agent_auto_reply
               (user_id, conversation_id, enabled, session_id, provider, model,
                last_processed_message_id, last_error, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, '', datetime('now', 'localtime'))
               ON CONFLICT(user_id, conversation_id) DO UPDATE SET
                 enabled = excluded.enabled,
                 session_id = excluded.session_id,
                 provider = COALESCE(excluded.provider, omni_agent_auto_reply.provider),
                 model = COALESCE(excluded.model, omni_agent_auto_reply.model),
                 last_processed_message_id = excluded.last_processed_message_id,
                 last_error = '',
                 updated_at = datetime('now', 'localtime')""",
            (
                user_id,
                conversation_id,
                1 if enabled else 0,
                session_id,
                provider,
                model,
                last_processed,
            ),
        )
    return _get_agent_auto_reply_state(user_id, conversation_id)


def _build_agent_reply_for_conversation(
    uid: str,
    conv: dict,
    provider: str | None,
    model: str | None,
) -> tuple[str, dict, str]:
    msgs = get_conversation_messages(conv["id"], limit=40)
    incoming = None
    incoming_index = -1
    for idx in range(len(msgs) - 1, -1, -1):
        msg = msgs[idx]
        if msg.get("sender_type") == "assistant" and str(msg.get("content") or "").strip():
            incoming = msg
            incoming_index = idx
            break
    if not incoming:
        raise HTTPException(status_code=400, detail="Chưa có tin nhắn đến để agent trả lời.")

    history = []
    for msg in msgs[:incoming_index]:
        content = str(msg.get("content") or "").strip()
        if not content:
            continue
        sender = msg.get("sender_type")
        if sender == "assistant":
            history.append({"role": "user", "content": content})
        elif sender == "user":
            history.append({"role": "assistant", "content": content})

    state = _get_agent_auto_reply_state(uid, conv["id"])
    try:
        reply, usage = generate_reply(
            history,
            str(incoming.get("content") or ""),
            provider or state.get("provider") or None,
            model or state.get("model") or None,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return reply, usage, str(incoming.get("id") or "")


def _mark_agent_auto_reply_result(
    user_id: str,
    conversation_id: str,
    message_id: str,
    error_text: str = "",
) -> None:
    with get_connection() as conn:
        conn.execute(
            """UPDATE omni_agent_auto_reply
               SET last_processed_message_id = COALESCE(NULLIF(?, ''), last_processed_message_id),
                   last_error = ?,
                   updated_at = datetime('now', 'localtime')
               WHERE user_id = ? AND conversation_id = ?""",
            (message_id, error_text[:500], user_id, conversation_id),
        )


def _run_agent_auto_reply_for_incoming(
    user_id: str,
    conversation_id: str,
    incoming_message_id: str,
) -> None:
    state = _get_agent_auto_reply_state(user_id, conversation_id)
    if not state.get("enabled"):
        return
    if incoming_message_id and state.get("last_processed_message_id") == incoming_message_id:
        return
    with get_connection() as conn:
        conn.execute(
            """UPDATE omni_agent_auto_reply
               SET last_processed_message_id = ?, last_error = '',
                   updated_at = datetime('now', 'localtime')
               WHERE user_id = ? AND conversation_id = ?""",
            (incoming_message_id, user_id, conversation_id),
        )
    conv = get_conversation(conversation_id)
    if not conv:
        return
    try:
        reply, _usage, _incoming_id = _build_agent_reply_for_conversation(
            user_id,
            dict(conv),
            state.get("provider") or None,
            state.get("model") or None,
        )
        _send_omni_text(user_id, dict(conv), reply)
        _mark_agent_auto_reply_result(user_id, conversation_id, incoming_message_id, "")
    except Exception as exc:  # noqa: BLE001
        detail = getattr(exc, "detail", None) or str(exc)
        logging.exception("Agent auto reply failed for %s", conversation_id)
        _mark_agent_auto_reply_result(user_id, conversation_id, incoming_message_id, str(detail))


def _start_agent_auto_reply_for_incoming(user_id: str, conversation_id: str, incoming_message_id: str) -> None:
    thread = threading.Thread(
        target=_run_agent_auto_reply_for_incoming,
        args=(user_id, conversation_id, incoming_message_id),
        daemon=True,
    )
    thread.start()


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
    uid = _get_user_id(request)
    conv = _resolve_omni_conversation(id, uid)
    if not conv:
        raise HTTPException(status_code=404, detail="Không tìm thấy hội thoại.")
    msgs = get_conversation_messages(conv["id"], limit=limit, before_id=before)
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


def _send_omni_text(
    uid: str,
    conv: dict,
    content: str,
    reply_to_id: str | None = None,
) -> dict:
    conversation_id = conv["id"]
    external_id = conv.get("external_id") or ""
    platform = conv.get("platform") or conv.get("channel") or ""
    send_meta = {}
    msg_id = create_message(
        conversation_id=conversation_id,
        user_id=uid,
        role="user",
        content=content,
        reply_to_id=reply_to_id or None,
        platform=platform,
    )
    try:
        if platform == "zalo" and external_id:
            cookie, imei = _load_zalo_channel(uid)
            if not cookie or not imei:
                raise HTTPException(status_code=400, detail="Chưa có phiên Zalo. Hãy quét QR trước.")
            send_meta = _run_zalo_bridge(
                ZALO_SEND_BRIDGE,
                {
                    "cookie": cookie,
                    "imei": imei,
                    "target": external_id,
                    "text": content,
                    "thread_type": conv.get("thread_type") or "user",
                    "action": "reply" if reply_to_id else "send",
                    "reply_to": _get_zalo_reply_meta(reply_to_id, uid),
                },
                timeout=25,
            )
        elif platform == "telegram" and external_id:
            from api.routers.telegram import send_real_message

            send_meta = asyncio.run(
                send_real_message(
                    uid,
                    external_id,
                    content,
                    _get_telegram_reply_external_id(reply_to_id, uid),
                )
            )
        elif platform == "facebook" and external_id:
            cookie = _load_facebook_channel(uid)
            if not cookie:
                raise HTTPException(status_code=400, detail="Chưa có phiên Facebook. Hãy kết nối trước.")
            try:
                send_meta = _run_facebook_live_message_threadsafe(uid, external_id, content, timeout=60)
            except Exception as live_exc:
                logging.warning("Facebook live send failed, falling back to cookie bridge: %s", live_exc)
                send_meta = _run_facebook_bridge(
                    FACEBOOK_SEND_BRIDGE,
                    {
                        "cookie": cookie,
                        "target": external_id,
                        "text": content,
                        "action": "send",
                    },
                    timeout=60,
                )
    except Exception as e:
        delete_message(msg_id)
        logging.error("Failed to send message to %s: %s", platform, e)
        raise

    external_msg_id = send_meta.get("msg_id") or send_meta.get("cli_msg_id") or ""
    external_cli_msg_id = send_meta.get("cli_msg_id") or ""
    external_msg_type = send_meta.get("msg_type") or "webchat"
    if external_msg_id:
        with get_connection() as conn:
            conn.execute(
                """UPDATE omni_messages
                   SET external_id = ?,
                       external_cli_msg_id = ?,
                       external_msg_type = ?,
                       external_author_id = ?
                   WHERE id = ?""",
                (external_msg_id, external_cli_msg_id, external_msg_type, uid, msg_id),
            )

    _broadcast({
        "type": "message",
        "conversationId": conversation_id,
        "message": {
            "id": msg_id,
            "sender_type": "user",
            "content": content,
            "reply_to_id": reply_to_id or "",
            "status": "sent",
        },
    })

    return {"id": msg_id, "status": "sent"}


def _build_omni_media_content(caption: str, media_urls: list[str] | None) -> str:
    lines = []
    if caption:
        lines.append(caption)
    for url in media_urls or []:
        suffix = Path(url).suffix.lower()
        is_image = suffix in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif"}
        media_type = "image" if is_image else "file"
        label = "Ảnh" if is_image else "File"
        lines.append(
            f'__OMNI_MEDIA__{json.dumps({"type": media_type, "url": url, "label": label}, ensure_ascii=False)}'
        )
    return "\n".join(lines)


def _upsert_sent_media_message(
    conversation_id: str,
    user_id: str,
    platform: str,
    content: str,
    *,
    external_id: str = "",
    external_cli_msg_id: str = "",
    external_msg_type: str = "webchat",
) -> str:
    if external_id:
        with get_connection() as conn:
            row = conn.execute(
                """SELECT id FROM omni_messages
                   WHERE conversation_id = ? AND platform = ? AND external_id = ?
                   ORDER BY created_at DESC LIMIT 1""",
                (conversation_id, platform, external_id),
            ).fetchone()
            if row:
                conn.execute(
                    """UPDATE omni_messages
                       SET role = 'user',
                           content = ?,
                           external_cli_msg_id = COALESCE(NULLIF(?, ''), external_cli_msg_id),
                           external_msg_type = COALESCE(NULLIF(?, ''), external_msg_type),
                           external_author_id = ?
                       WHERE id = ?""",
                    (content, external_cli_msg_id, external_msg_type, user_id, row["id"]),
                )
                refresh_conversation_preview(conversation_id)
                return row["id"]
    return create_message(conversation_id, user_id, "user", content, platform=platform)


@router.post("/conversations/{id}/messages")
def send_message(id: str, payload: OmniSendMessageRequest, request: Request):
    uid = _get_user_id(request)
    conv = _resolve_omni_conversation(id, uid)
    if not conv:
        raise HTTPException(status_code=404, detail="Không tìm thấy hội thoại.")
    return _send_omni_text(uid, conv, payload.content, payload.reply_to_id or None)


@router.post("/conversations/{id}/agent-reply")
def generate_agent_auto_reply(id: str, payload: OmniAgentReplyRequest, request: Request):
    uid = _get_user_id(request)
    conv = _resolve_omni_conversation(id, uid)
    if not conv:
        raise HTTPException(status_code=404, detail="Không tìm thấy hội thoại.")

    reply, usage, _incoming_id = _build_agent_reply_for_conversation(
        uid,
        conv,
        payload.provider,
        payload.model,
    )
    return {"content": reply, "usage": usage, "conversation_id": conv["id"]}


@router.get("/conversations/{id}/agent-auto-reply")
def get_agent_auto_reply(id: str, request: Request):
    uid = _get_user_id(request)
    conv = _resolve_omni_conversation(id, uid)
    if not conv:
        return {
            "conversation_id": id,
            "enabled": False,
            "session_id": _agent_session_id(uid, id),
            "provider": "",
            "model": "",
            "last_processed_message_id": "",
            "last_error": "",
        }
    state = _get_agent_auto_reply_state(uid, conv["id"])
    return {"conversation_id": conv["id"], **state}


@router.post("/conversations/{id}/agent-auto-reply")
def toggle_agent_auto_reply(id: str, payload: OmniAgentAutoReplyToggleRequest, request: Request):
    uid = _get_user_id(request)
    conv = _resolve_omni_conversation(id, uid)
    if not conv:
        return {
            "conversation_id": id,
            "enabled": False,
            "session_id": _agent_session_id(uid, id),
            "provider": payload.provider or "",
            "model": payload.model or "",
            "last_processed_message_id": "",
            "last_error": "Không tìm thấy hội thoại.",
        }
    if conv.get("platform") not in {"zalo", "telegram"} and conv.get("channel") not in {"zalo", "telegram"}:
        raise HTTPException(status_code=400, detail="Agent Auto Reply chỉ hỗ trợ Zalo/Telegram.")
    state = _set_agent_auto_reply_state(
        uid,
        conv["id"],
        payload.enabled,
        payload.provider,
        payload.model,
    )
    return {"conversation_id": conv["id"], **state}


@router.delete("/conversations/{id}")
def delete_conversation_endpoint(id: str, request: Request):
    _get_user_id(request)
    if not delete_conversation(id):
        raise HTTPException(status_code=404, detail="Không tìm thấy hội thoại.")
    return {"deleted": True}


@router.delete("/contacts/{id}")
def delete_contact_endpoint(id: str, request: Request):
    uid = _get_user_id(request)
    if not delete_contact(id, uid):
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"deleted": True}


@router.post("/conversations/{id}/toggle-pin")
def toggle_pin(id: str, request: Request):
    _get_user_id(request)
    new_state = toggle_pin_conversation(id)
    if new_state is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy hội thoại.")
    return {"pinned": new_state}


@router.post("/conversations/{id}/rename")
def rename(id: str, payload: OmniRenameRequest, request: Request):
    _get_user_id(request)
    if not rename_conversation(id, payload.custom_name):
        raise HTTPException(status_code=404, detail="Không tìm thấy hội thoại.")
    return {"customName": payload.custom_name}


# ── Messages ───────────────────────────────────────────────────────────────


@router.delete("/messages/{id}")
def delete_message_endpoint(id: str, request: Request):
    uid = _get_user_id(request)
    row, meta = _get_zalo_message_context(id, uid)
    if meta and row.get("role") == "user":
        cookie, imei = _load_zalo_channel(uid)
        if not cookie or not imei:
            raise HTTPException(status_code=400, detail="Chưa có phiên Zalo. Hãy quét QR trước.")
        _run_zalo_bridge(
            ZALO_SEND_BRIDGE,
            {
                "cookie": cookie,
                "imei": imei,
                "action": "undo",
                "target": meta["target"],
                "thread_type": meta["thread_type"],
                "message": meta["message"],
            },
            timeout=45,
        )
    elif row.get("platform") == "telegram" and row.get("external_id"):
        from api.routers.telegram import delete_real_message

        asyncio.run(
            delete_real_message(
                uid,
                row.get("thread_id") or "",
                row.get("external_id") or "",
            )
        )
    if not delete_message(id):
        raise HTTPException(status_code=404, detail="Message not found")
    return {"deleted": True}


@router.post("/messages/{id}/reaction")
def react_to_message(id: str, payload: OmniReactionRequest, request: Request):
    uid = _get_user_id(request)
    row, meta = _get_zalo_message_context(id, uid)
    if meta:
        cookie, imei = _load_zalo_channel(uid)
        if not cookie or not imei:
            raise HTTPException(status_code=400, detail="Chưa có phiên Zalo. Hãy quét QR trước.")
        _run_zalo_bridge(
            ZALO_SEND_BRIDGE,
            {
                "cookie": cookie,
                "imei": imei,
                "action": "react",
                "target": meta["target"],
                "thread_type": meta["thread_type"],
                "message": meta["message"],
                "emoji": payload.emoji,
            },
            timeout=45,
        )
    elif row.get("platform") == "telegram" and row.get("external_id"):
        from api.routers.telegram import react_real_message

        asyncio.run(
            react_real_message(
                uid,
                row.get("thread_id") or "",
                row.get("external_id") or "",
                payload.emoji,
            )
        )
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


# ── Send Media (Images/Files) ──────────────────────────────────────────────


@router.post("/conversations/{id}/send-media")
async def send_media_to_conversation(
    id: str, 
    payload: OmniSendMediaRequest, 
    request: Request
):
    """
    Send image or file to a conversation.
    Supports single image, multiple images, or remote file URL.
    Auto-optimizes images for the target platform.
    """
    uid = _get_user_id(request)
    conv = _resolve_omni_conversation(id, uid)
    if not conv:
        raise HTTPException(status_code=404, detail="Không tìm thấy hội thoại.")
    
    platform = conv.get("platform") or conv.get("channel")
    external_id = conv.get("external_id")
    thread_type = conv.get("thread_type", "user")
    
    if not platform or not external_id:
        raise HTTPException(status_code=400, detail="Thiếu thông tin platform hoặc external_id.")
    
    # Import image processor
    try:
        from utils.image_processor import ImageProcessor
        processor_available = ImageProcessor.is_available()
    except ImportError:
        processor_available = False
    
    # Handle different media types
    if platform == "zalo":
        cookie, imei = _load_zalo_channel(uid)
        if not cookie or not imei:
            raise HTTPException(status_code=400, detail="Chưa có phiên Zalo. Hãy quét QR trước.")
        
        # Prepare paths for optimization
        paths_to_send = []
        temp_files = []
        
        if payload.image_path:
            paths_to_send = [payload.image_path]
        elif payload.image_paths:
            paths_to_send = payload.image_paths
        
        # Optimize images if requested and processor available
        if payload.optimize and processor_available and paths_to_send:
            optimized_paths = []
            for img_path in paths_to_send:
                if Path(img_path).exists():
                    optimized = ImageProcessor.auto_optimize_for_platform(img_path, "zalo")
                    if optimized and optimized != img_path:
                        temp_files.append(optimized)
                        optimized_paths.append(optimized)
                    else:
                        optimized_paths.append(img_path)
                else:
                    optimized_paths.append(img_path)
            paths_to_send = optimized_paths
        
        # Send via Zalo bridge
        try:
            if len(paths_to_send) > 1:
                # Multiple images
                result = _run_zalo_bridge(
                    ZALO_SEND_BRIDGE,
                    {
                        "cookie": cookie,
                        "imei": imei,
                        "action": "send_images",
                        "target": external_id,
                        "thread_type": thread_type,
                        "image_paths": paths_to_send,
                        "text": payload.caption,
                    },
                    timeout=60,
                )
            elif len(paths_to_send) == 1:
                # Single image
                result = _run_zalo_bridge(
                    ZALO_SEND_BRIDGE,
                    {
                        "cookie": cookie,
                        "imei": imei,
                        "action": "send_image",
                        "target": external_id,
                        "thread_type": thread_type,
                        "image_path": paths_to_send[0],
                        "text": payload.caption,
                    },
                    timeout=60,
                )
            elif payload.file_url:
                # Remote file
                result = _run_zalo_bridge(
                    ZALO_SEND_BRIDGE,
                    {
                        "cookie": cookie,
                        "imei": imei,
                        "action": "send_file",
                        "target": external_id,
                        "thread_type": thread_type,
                        "file_url": payload.file_url,
                        "text": payload.caption,
                    },
                    timeout=60,
                )
            else:
                raise HTTPException(status_code=400, detail="Phải cung cấp image_path, image_paths hoặc file_url.")
            
            # Cleanup temp files
            for temp_file in temp_files:
                Path(temp_file).unlink(missing_ok=True)
            
            if not result.get("ok"):
                raise HTTPException(status_code=500, detail=result.get("error", "Lỗi gửi media qua Zalo."))
            
            display_content = _build_omni_media_content(payload.caption, payload.media_urls)
            if not display_content:
                display_content = payload.caption or "[Đã gửi ảnh]"

            external_msg_id = result.get("msg_id") or result.get("cli_msg_id") or ""
            msg_id = _upsert_sent_media_message(
                conv["id"],
                uid,
                "zalo",
                display_content,
                external_id=external_msg_id,
                external_cli_msg_id=result.get("cli_msg_id") or "",
                external_msg_type=result.get("msg_type") or "webchat",
            )
            if external_msg_id:
                with get_connection() as conn:
                    conn.execute(
                        """UPDATE omni_messages
                           SET external_id = ?,
                               external_cli_msg_id = ?,
                               external_msg_type = ?,
                               external_author_id = ?
                           WHERE id = ?""",
                        (
                            external_msg_id,
                            result.get("cli_msg_id") or "",
                            result.get("msg_type") or "webchat",
                            uid,
                            msg_id,
                        ),
                    )
            
            refresh_conversation_preview(conv["id"])
            
            _broadcast({
                "type": "message",
                "conversationId": conv["id"],
                "message": {
                    "id": msg_id,
                    "sender_type": "user",
                    "content": display_content,
                    "status": "sent",
                },
            })
            
            return {"success": True, "message_id": msg_id, "platform": "zalo"}
            
        except Exception as e:
            # Cleanup temp files on error
            for temp_file in temp_files:
                Path(temp_file).unlink(missing_ok=True)
            raise
    
    elif platform == "telegram":
        # Send via Telegram
        from api.routers.telegram import send_real_media
        
        # Optimize if requested
        path_to_send = payload.image_path
        temp_file = None
        
        if payload.optimize and processor_available and path_to_send and Path(path_to_send).exists():
            optimized = ImageProcessor.auto_optimize_for_platform(path_to_send, "telegram")
            if optimized and optimized != path_to_send:
                temp_file = optimized
                path_to_send = optimized
        
        try:
            result = await send_real_media(
                uid,
                external_id,
                path_to_send,
                payload.caption,
            )
            
            # Cleanup temp file
            if temp_file:
                Path(temp_file).unlink(missing_ok=True)
            
            if not result.get("success"):
                raise HTTPException(status_code=500, detail=result.get("error", "Lỗi gửi media qua Telegram."))
            
            display_content = _build_omni_media_content(payload.caption, payload.media_urls)
            if not display_content:
                display_content = payload.caption or "[Đã gửi ảnh]"

            external_msg_id = str(result.get("message_id") or "")
            msg_id = _upsert_sent_media_message(
                conv["id"],
                uid,
                "telegram",
                display_content,
                external_id=external_msg_id,
                external_msg_type="message",
            )
            if external_msg_id:
                with get_connection() as conn:
                    conn.execute(
                        """UPDATE omni_messages
                           SET external_id = ?,
                               external_msg_type = 'message',
                               external_author_id = ?
                           WHERE id = ?""",
                        (external_msg_id, uid, msg_id),
                    )
            
            refresh_conversation_preview(conv["id"])
            
            _broadcast({
                "type": "message",
                "conversationId": conv["id"],
                "message": {
                    "id": msg_id,
                    "sender_type": "user",
                    "content": display_content,
                    "status": "sent",
                },
            })
            
            return {"success": True, "message_id": msg_id, "platform": "telegram"}
            
        except Exception as e:
            # Cleanup temp file on error
            if temp_file:
                Path(temp_file).unlink(missing_ok=True)
            raise
    
    elif platform == "facebook":
        cookie = _load_facebook_channel(uid)
        if not cookie:
            raise HTTPException(status_code=400, detail="Chưa có phiên Facebook. Hãy kết nối trước.")

        paths_to_send = []
        if payload.image_path:
            paths_to_send = [payload.image_path]
        elif payload.image_paths:
            paths_to_send = payload.image_paths

        if payload.file_url:
            raise HTTPException(status_code=400, detail="Facebook hiện chưa hỗ trợ file URL từ xa.")

        try:
            result = await _send_facebook_live_message(uid, external_id, payload.caption, paths_to_send)
        except Exception as live_exc:
            logging.warning("Facebook live media send failed, falling back to cookie bridge: %s", live_exc)
            result = _run_facebook_bridge(
                FACEBOOK_SEND_BRIDGE,
                {
                    "cookie": cookie,
                    "action": "send_images" if len(paths_to_send) > 1 else "send_image",
                    "target": external_id,
                    "image_path": paths_to_send[0] if len(paths_to_send) == 1 else "",
                    "image_paths": paths_to_send if len(paths_to_send) > 1 else [],
                    "text": payload.caption,
                },
                timeout=90,
            )
        if not result.get("ok"):
            raise HTTPException(status_code=500, detail=result.get("error", "Lỗi gửi media qua Facebook."))

        display_content = _build_omni_media_content(payload.caption, payload.media_urls)
        if not display_content:
            display_content = payload.caption or "[Đã gửi ảnh]"
        msg_id = _upsert_sent_media_message(
            conv["id"],
            uid,
            "facebook",
            display_content,
        )
        refresh_conversation_preview(conv["id"])
        _broadcast({
            "type": "message",
            "conversationId": conv["id"],
            "message": {
                "id": msg_id,
                "sender_type": "user",
                "content": display_content,
                "status": "sent",
            },
        })
        return {"success": True, "message_id": msg_id, "platform": "facebook"}
    
    else:
        raise HTTPException(status_code=400, detail=f"Platform {platform} chưa hỗ trợ gửi media.")


@router.post("/conversations/{id}/paste-clipboard")
async def paste_clipboard_to_conversation(id: str, request: Request):
    """
    Paste image from clipboard and send to conversation.
    Only works on macOS with clipboard image data.
    """
    uid = _get_user_id(request)
    conv = _resolve_omni_conversation(id, uid)
    if not conv:
        raise HTTPException(status_code=404, detail="Không tìm thấy hội thoại.")
    
    platform = conv.get("platform") or conv.get("channel")
    external_id = conv.get("external_id")
    thread_type = conv.get("thread_type", "user")
    
    if not platform or not external_id:
        raise HTTPException(status_code=400, detail="Thiếu thông tin platform hoặc external_id.")
    
    # Get caption from request body if provided
    try:
        body = await request.json()
        caption = body.get("caption", "")
    except Exception:
        caption = ""
    
    if platform == "zalo":
        # Use clipboard_to_zalo.py
        script_path = BACKEND_ROOT / "plugins/platforms/omnichannel/backend/zalo_bridges/clipboard_to_zalo.py"
        
        cookie, imei = _load_zalo_channel(uid)
        if not cookie or not imei:
            raise HTTPException(status_code=400, detail="Chưa có phiên Zalo. Hãy quét QR trước.")
        
        env = os.environ.copy()
        env["ZALO_COOKIE_STRING"] = cookie
        env["ZALO_IMEI"] = imei
        
        try:
            result = subprocess.run(
                ["python3", str(script_path), external_id, caption],
                capture_output=True,
                text=True,
                timeout=30,
                env=env
            )
            
            if result.returncode == 0:
                response_data = json.loads(result.stdout)
                if response_data.get("ok"):
                    # Create message record
                    msg_id = create_message(
                        conv["id"],
                        uid,
                        "user",
                        caption or "[Đã gửi ảnh từ clipboard]",
                        platform="zalo",
                    )
                    
                    refresh_conversation_preview(conv["id"])
                    
                    _broadcast({
                        "type": "message",
                        "conversationId": conv["id"],
                        "message": {
                            "id": msg_id,
                            "sender_type": "user",
                            "content": caption or "[Đã gửi ảnh từ clipboard]",
                            "status": "sent",
                        },
                    })
                    
                    return {"success": True, "message_id": msg_id, "platform": "zalo"}
                else:
                    raise HTTPException(status_code=400, detail=response_data.get("error", "Lỗi paste clipboard."))
            else:
                raise HTTPException(status_code=500, detail=result.stderr or "Lỗi paste clipboard.")
                
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=504, detail="Timeout khi paste clipboard.")
    
    elif platform == "telegram":
        # Use clipboard_to_telegram.py
        script_path = BACKEND_ROOT / "plugins/platforms/omnichannel/backend/zalo_bridges/clipboard_to_telegram.py"
        
        try:
            result = subprocess.run(
                ["python3", str(script_path), external_id, caption],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                response_data = json.loads(result.stdout)
                if response_data.get("ok"):
                    # Create message record
                    msg_id = create_message(
                        conv["id"],
                        uid,
                        "user",
                        caption or "[Đã gửi ảnh từ clipboard]",
                        platform="telegram",
                    )
                    
                    refresh_conversation_preview(conv["id"])
                    
                    _broadcast({
                        "type": "message",
                        "conversationId": conv["id"],
                        "message": {
                            "id": msg_id,
                            "sender_type": "user",
                            "content": caption or "[Đã gửi ảnh từ clipboard]",
                            "status": "sent",
                        },
                    })
                    
                    return {"success": True, "message_id": msg_id, "platform": "telegram"}
                else:
                    raise HTTPException(status_code=400, detail=response_data.get("error", "Lỗi paste clipboard."))
            else:
                raise HTTPException(status_code=500, detail=result.stderr or "Lỗi paste clipboard.")
                
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=504, detail="Timeout khi paste clipboard.")
    
    else:
        raise HTTPException(status_code=400, detail=f"Platform {platform} chưa hỗ trợ paste clipboard.")


# ── File Upload ────────────────────────────────────────────────────────────


@router.post("/upload")
async def upload_files(request: Request, files: List[UploadFile] = File(...)):
    """Upload files and return URLs for embedding in messages."""
    uid = _get_user_id(request)
    
    # Use existing data directory
    upload_dir = BACKEND_ROOT / "data" / "omni_uploads" / uid
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    urls = []
    file_paths = []
    for file in files[:5]:  # Limit to 5 files
        # Generate unique filename
        ext = Path(file.filename or "file").suffix
        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = upload_dir / filename
        
        # Save file
        content = await file.read()
        with open(filepath, "wb") as f:
            f.write(content)
        
        # Generate URL (relative to API)
        url = f"/api/omni/files/{uid}/{filename}"
        urls.append(url)
        file_paths.append(str(filepath))
    
    return {"urls": urls, "paths": file_paths, "count": len(urls)}


@router.get("/files/{user_id}/{filename}")
async def get_uploaded_file(user_id: str, filename: str):
    """Serve uploaded files."""
    filepath = BACKEND_ROOT / "data" / "omni_uploads" / user_id / filename
    
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Determine content type
    ext = filepath.suffix.lower()
    content_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".pdf": "application/pdf",
        ".txt": "text/plain",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    content_type = content_types.get(ext, "application/octet-stream")
    
    with open(filepath, "rb") as f:
        content = f.read()
    
    from fastapi.responses import Response
    return Response(content=content, media_type=content_type)


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
        last_keepalive = time.time()
        try:
            yield f"data: {json.dumps({'type': 'connected'}, ensure_ascii=False)}\n\n".encode("utf-8")
            while True:
                try:
                    event = events.get(timeout=15)
                    if event is None:
                        break
                    yield f"event: omni\ndata: {json.dumps(event, ensure_ascii=False)}\n\n".encode("utf-8")
                    last_keepalive = time.time()
                except queue.Empty:
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


# ── Sync / Connect ─────────────────────────────────────────────────────────

_zalo_qr_sessions: dict[str, dict] = {}
_zalo_listeners: dict[str, dict] = {}
_zalo_listeners_lock = threading.Lock()
_facebook_browser_sessions: dict[str, dict] = {}
_facebook_live_sessions: dict[str, dict] = {}
_facebook_sync_tasks: dict[str, asyncio.Task] = {}
_facebook_sync_locks: dict[str, asyncio.Lock] = {}
_omni_browser_sessions: dict[str, dict] = {}
FACEBOOK_PROFILE_ROOT = BACKEND_ROOT / "data" / "facebook_profiles"
OMNI_BROWSER_PROFILE_ROOT = BACKEND_ROOT / "data" / "omni_browser_profiles"
DEFAULT_BROWSER_CDP_URL = "http://127.0.0.1:9222"


def _probe_cdp_http_url(url: str, timeout: float = 1.5) -> bool:
    try:
        with urllib.request.urlopen(url.rstrip("/") + "/json/version", timeout=timeout) as resp:
            return 200 <= int(resp.status) < 300
    except Exception:
        return False


def _configured_default_browser_cdp_url() -> str:
    """Return a reachable CDP endpoint for the user's normal browser."""
    candidates = []
    env_url = os.environ.get("BROWSER_CDP_URL", "").strip()
    if env_url:
        candidates.append(env_url)
    try:
        from hagent_cli.config import read_raw_config

        cfg = read_raw_config()
        browser_cfg = cfg.get("browser", {})
        if isinstance(browser_cfg, dict):
            cfg_url = str(browser_cfg.get("cdp_url") or "").strip()
            if cfg_url:
                candidates.append(cfg_url)
    except Exception:
        pass
    candidates.append(DEFAULT_BROWSER_CDP_URL)

    for url in candidates:
        if url.startswith(("ws://", "wss://")):
            return url
        if url.startswith("http") and _probe_cdp_http_url(url):
            return url
    return ""


def _default_browser_cdp_required_message() -> str:
    return (
        "Chưa kết nối được trình duyệt mặc định qua CDP/MCP. "
        "Mở Chrome/Brave bằng remote debugging trước, ví dụ: "
        "/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome "
        "--remote-debugging-port=9222"
    )


def _cookie_header_to_playwright(cookie: str, domain: str) -> list[dict]:
    cookie_url = "https://www.facebook.com/" if "facebook.com" in domain else f"https://{domain.lstrip('.')}/"
    cookies_by_name: dict[str, dict] = {}
    valid_name_chars = set("!#$%&'*+-.^_`|~")
    for item in (cookie or "").split(";"):
        if "=" not in item:
            continue
        name, value = item.strip().split("=", 1)
        name = name.strip()
        value = value.strip()
        if (
            not name
            or any(ch.isspace() for ch in name)
            or name.startswith("$")
            or any((not ch.isalnum() and ch not in valid_name_chars) for ch in name)
            or any(ord(ch) < 32 or ord(ch) == 127 for ch in value)
        ):
            continue
        cookies_by_name[name] = {
            "name": name,
            "value": value,
            "url": cookie_url,
        }
    return list(cookies_by_name.values())


async def _close_omni_browser_session(user_id: str) -> None:
    sess = _omni_browser_sessions.pop(user_id, None)
    if not sess:
        return
    try:
        fb_cookie = await _get_facebook_cookie_header(sess["context"])
        if "c_user=" in fb_cookie and "xs=" in fb_cookie:
            _save_facebook_channel(user_id, fb_cookie)
    except Exception:
        pass
    try:
        await sess["context"].close()
    except Exception:
        pass
    try:
        await sess["playwright"].stop()
    except Exception:
        pass


async def _save_omni_browser_channels(user_id: str) -> dict:
    sess = _omni_browser_sessions.get(user_id)
    if not sess:
        return {"facebook": False, "zalo": False}
    saved = {"facebook": False, "zalo": False}
    context = sess.get("context")
    pages = sess.get("pages") or []
    if not context:
        return saved
    try:
        fb_cookie = await _get_facebook_cookie_header(context)
        if "c_user=" in fb_cookie and "xs=" in fb_cookie:
            _save_facebook_channel(user_id, fb_cookie)
            saved["facebook"] = True
    except Exception:
        pass
    try:
        cookies = await context.cookies()
        zalo_cookie = "; ".join(
            f"{c['name']}={c['value']}"
            for c in cookies
            if c.get("name") and ("zalo" in str(c.get("domain") or "") or "zlogin" in str(c.get("domain") or ""))
        )
        zalo_page = next((page for page in pages if "zalo" in (getattr(page, "url", "") or "")), None)
        imei = ""
        if zalo_page:
            imei = await _read_zalo_imei(zalo_page)
        if zalo_cookie and not imei:
            imei = str(uuid.uuid4())
        if zalo_cookie and imei:
            _save_zalo_channel(user_id, zalo_cookie, imei)
            _ensure_zalo_listener(user_id, zalo_cookie, imei)
            saved["zalo"] = True
    except Exception:
        pass
    return saved


def _save_omni_browser_channels_threadsafe(user_id: str) -> dict:
    sess = _omni_browser_sessions.get(user_id)
    if not sess:
        return {"facebook": False, "zalo": False}
    loop = sess.get("loop")
    if loop and loop.is_running():
        return asyncio.run_coroutine_threadsafe(_save_omni_browser_channels(user_id), loop).result(timeout=15)
    return asyncio.run(_save_omni_browser_channels(user_id))


async def _launch_omni_browser_session(user_id: str, *, headless: bool = False) -> dict:
    from playwright.async_api import async_playwright

    profile_dir = OMNI_BROWSER_PROFILE_ROOT / user_id
    profile_dir.mkdir(parents=True, exist_ok=True)
    playwright = await async_playwright().start()
    context = await playwright.chromium.launch_persistent_context(
        str(profile_dir),
        headless=headless,
        args=["--disable-blink-features=AutomationControlled"],
        viewport={"width": 1360, "height": 920},
        user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ),
    )
    fb_cookie = _load_facebook_channel(user_id)
    if fb_cookie:
        try:
            await context.add_cookies(_cookie_header_to_playwright(fb_cookie, ".facebook.com"))
        except Exception:
            pass
    # Do not inject saved Zalo cookies here. Stale/partial Zalo Web cookies can make
    # chat.zalo.me show its generic "đang gặp sự cố" page instead of the QR login.
    # Zalo Web is sensitive to rapid multi-tab navigation. Open tabs slowly and
    # let Zalo settle first, otherwise it can show an invalid/error login state.
    tab_specs = [
        ("zalo", "https://id.zalo.me/account?continue=https%3A%2F%2Fchat.zalo.me%2F", 6500),
        ("facebook", "https://www.facebook.com/messages/", 2500),
        ("telegram", "https://web.telegram.org/k/", 2500),
    ]
    pages = []
    first = context.pages[0] if context.pages else await context.new_page()
    for idx, (_name, url, settle_ms) in enumerate(tab_specs):
        page = first if idx == 0 else await context.new_page()
        try:
            await page.goto("about:blank", wait_until="domcontentloaded", timeout=10000)
            await page.wait_for_timeout(700)
            await page.goto(url, wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_timeout(settle_ms)
        except Exception:
            pass
        pages.append(page)
    sess = {
        "user_id": user_id,
        "playwright": playwright,
        "context": context,
        "browser": context.browser,
        "pages": pages,
        "page": pages[0],
        "headless": headless,
        "loop": asyncio.get_running_loop(),
        "created_at": datetime.now().isoformat(),
    }
    _omni_browser_sessions[user_id] = sess
    return sess


async def _close_zalo_qr_session(session_id: str) -> None:
    sess = _zalo_qr_sessions.pop(session_id, None)
    if not sess:
        return
    try:
        await sess["browser"].close()
    except Exception:
        pass
    try:
        await sess["playwright"].stop()
    except Exception:
        pass


async def _expire_zalo_qr_session(session_id: str, seconds: int = 300) -> None:
    await asyncio.sleep(seconds)
    await _close_zalo_qr_session(session_id)


def _capture_zalo_imei_from_url(sess: dict, url: str) -> None:
    if sess.get("imei") or "imei=" not in url:
        return
    try:
        from urllib.parse import parse_qs, urlparse

        imei = (parse_qs(urlparse(url).query).get("imei") or [""])[0]
        if imei:
            sess["imei"] = imei
    except Exception:
        pass


async def _find_zalo_qr_data(page) -> str:
    selector = (
        '.login-qr canvas, .qr-container canvas, canvas, '
        'img[alt="QR"], img[src*="qr"], img[src*="data:image"]'
    )
    candidates = await page.query_selector_all(selector)
    best_data = ""
    best_score = 0
    for handle in candidates:
        try:
            if not await handle.is_visible():
                continue
            tag_name = await handle.evaluate("el => el.tagName.toLowerCase()")
            box = await handle.bounding_box()
            width = int(box["width"]) if box else 0
            height = int(box["height"]) if box else 0
            if width < 120 or height < 120:
                continue
            if tag_name == "canvas":
                data = await handle.evaluate("el => el.toDataURL('image/png')")
            else:
                data = await handle.get_attribute("src") or ""
            score = width * height + len(data)
            if data and score > best_score:
                best_data = data
                best_score = score
        except Exception:
            continue
    return best_data


def _normalize_qr_data_uri(data_uri: str) -> str:
    if not data_uri.startswith("data:image/") or "," not in data_uri:
        return data_uri
    header, encoded = data_uri.split(",", 1)
    try:
        raw = base64.b64decode(encoded)
        image = Image.open(io.BytesIO(raw)).convert("RGB")
        image = ImageOps.expand(image, border=max(24, image.width // 10), fill="white")
        image = image.resize((image.width * 2, image.height * 2), Image.Resampling.NEAREST)
        out = io.BytesIO()
        image.save(out, format="PNG")
        return f"{header},{base64.b64encode(out.getvalue()).decode('utf-8')}"
    except Exception:
        return data_uri


async def _get_zalo_cookie_header(context) -> str:
    cookies = await context.cookies()
    return "; ".join(f"{c['name']}={c['value']}" for c in cookies if c.get("name"))


async def _read_zalo_imei(page) -> str:
    script = """
    () => {
      const keys = ['z_uuid', 'imei', 'zpw_imei', 'z_device_id', 'deviceId'];
      for (const store of [window.localStorage, window.sessionStorage]) {
        for (const key of keys) {
          const value = store.getItem(key);
          if (value) return value;
        }
      }
      return '';
    }
    """
    try:
        return await page.evaluate(script) or ""
    except Exception:
        return ""


async def _get_facebook_cookie_header(context) -> str:
    cookies = await context.cookies(["https://www.facebook.com", "https://messenger.com"])
    return "; ".join(
        f"{c['name']}={c['value']}"
        for c in cookies
        if c.get("name")
        and c.get("value")
        and any(host in str(c.get("domain") or "") for host in ("facebook.com", "messenger.com"))
    )


async def _facebook_page_is_connected(page, context) -> bool:
    try:
        cookies = {item["name"]: item["value"] for item in await context.cookies()}
        if not cookies.get("c_user") or not cookies.get("xs"):
            return False
        body = await page.locator("body").inner_text()
        if "đăng nhập" in body.lower() or "log in" in body.lower():
            return False
        return True
    except Exception:
        return False


async def _facebook_page_needs_security_unlock(page) -> bool:
    try:
        body = (await page.locator("body").inner_text()).lower()
    except Exception:
        return False
    markers = (
        "mã pin",
        "pin",
        "mã bảo mật",
        "secure storage",
        "end-to-end encrypted",
        "tin nhắn được mã hóa",
    )
    return any(marker in body for marker in markers)


async def _close_facebook_playwright_session(sess: dict | None) -> None:
    if not sess:
        return
    if sess.get("external_cdp"):
        # CDP/default-browser sessions belong to the user. Never close their
        # tabs or browser windows from Omni; just detach our Playwright handle.
        try:
            await sess["playwright"].stop()
        except Exception:
            pass
        return

    try:
        await sess["context"].close()
    except Exception:
        pass
    try:
        browser = sess.get("browser")
        if browser:
            await browser.close()
    except Exception:
        pass
    try:
        await sess["playwright"].stop()
    except Exception:
        pass


async def _close_facebook_browser_session(session_id: str) -> None:
    sess = _facebook_browser_sessions.pop(session_id, None)
    await _close_facebook_playwright_session(sess)


async def _save_facebook_controlled_session_cookie(user_id: str) -> bool:
    """Harvest Facebook cookies from any active controlled/default-browser session."""
    sessions: list[dict] = []
    sessions.extend(
        sess for sess in _facebook_browser_sessions.values()
        if sess.get("user_id") == user_id
    )
    live = _facebook_live_sessions.get(user_id)
    if live and live.get("user_id") == user_id:
        sessions.append(live)

    for sess in sessions:
        try:
            cookie = await _get_facebook_cookie_header(sess["context"])
            if "c_user=" in cookie and "xs=" in cookie:
                _save_facebook_channel(user_id, cookie)
                return True
        except Exception:
            continue
    return False


async def _launch_facebook_persistent_session(
    user_id: str,
    *,
    headless: bool = False,
    require_default_browser: bool = False,
) -> dict:
    from playwright.async_api import async_playwright

    playwright = await async_playwright().start()
    if require_default_browser and not headless:
        cdp_url = _configured_default_browser_cdp_url()
        if cdp_url:
            browser = await playwright.chromium.connect_over_cdp(cdp_url)
            context = browser.contexts[0] if browser.contexts else await browser.new_context(
                viewport={"width": 1280, "height": 900}
            )
            page = await context.new_page()
            try:
                await page.set_viewport_size({"width": 1280, "height": 900})
            except Exception:
                pass
            return {
                "user_id": user_id,
                "playwright": playwright,
                "context": context,
                "browser": browser,
                "page": page,
                "loop": asyncio.get_running_loop(),
                "headless": headless,
                "external_cdp": True,
                "cdp_url": cdp_url,
            }
        if require_default_browser:
            await playwright.stop()
            raise HTTPException(status_code=400, detail=_default_browser_cdp_required_message())

    profile_dir = FACEBOOK_PROFILE_ROOT / user_id
    profile_dir.mkdir(parents=True, exist_ok=True)
    context = await playwright.chromium.launch_persistent_context(
        str(profile_dir),
        headless=headless,
        args=["--disable-blink-features=AutomationControlled"],
        viewport={"width": 1280, "height": 900},
        user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ),
    )
    page = context.pages[0] if context.pages else await context.new_page()
    return {
        "user_id": user_id,
        "playwright": playwright,
        "context": context,
        "browser": context.browser,
        "page": page,
        "loop": asyncio.get_running_loop(),
        "headless": headless,
        "external_cdp": False,
    }


async def restore_facebook_live_session(user_id: str) -> dict | None:
    existing = _facebook_live_sessions.get(user_id)
    if existing:
        return existing
    profile_dir = FACEBOOK_PROFILE_ROOT / user_id
    if not profile_dir.exists():
        return None
    sess = await _launch_facebook_persistent_session(user_id, headless=True)
    page = sess["page"]
    await page.goto("https://www.facebook.com/messages/", wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_timeout(2500)
    if await _facebook_page_is_connected(page, sess["context"]):
        _facebook_live_sessions[user_id] = sess
        _ensure_facebook_sync_task(user_id)
        return sess
    await _close_facebook_playwright_session(sess)
    return None


async def _first_visible_locator(page, selectors: list[str], timeout: int = 1200):
    for selector in selectors:
        locator = page.locator(selector).first
        try:
            if await locator.is_visible(timeout=timeout):
                return locator
        except Exception:
            continue
    return None


async def _facebook_prepare_thread_page(page, target: str) -> None:
    target = str(target or "").strip().strip("/")
    urls = []
    if target.startswith("http://") or target.startswith("https://"):
        urls.append(target)
    else:
        urls.extend([
            f"https://www.facebook.com/messages/t/{target}",
            f"https://www.facebook.com/messages/e2ee/t/{target}",
        ])
    last_exc = None
    for url in urls:
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_timeout(1800)
            textbox = await _first_visible_locator(
                page,
                [
                    'div[role="textbox"][contenteditable="true"]',
                    'div[contenteditable="true"][data-lexical-editor="true"]',
                    'div[contenteditable="true"]',
                    '[aria-label="Message"][contenteditable="true"]',
                    '[aria-label="Tin nhắn"][contenteditable="true"]',
                ],
            )
            if textbox:
                return
        except Exception as exc:
            last_exc = exc
            continue
    if last_exc:
        raise last_exc


async def _send_facebook_live_message(
    user_id: str,
    target: str,
    text: str = "",
    image_paths: list[str] | None = None,
) -> dict:
    lock = _facebook_sync_locks.setdefault(user_id, asyncio.Lock())
    async with lock:
        sess = _facebook_live_sessions.get(user_id) or await restore_facebook_live_session(user_id)
        if not sess:
            raise RuntimeError("Chưa có live session Facebook. Hãy mở Browser và đăng nhập lại.")
        base_page = sess["page"]
        if not await _facebook_page_is_connected(base_page, sess["context"]):
            raise RuntimeError("Phiên Facebook live đã hết hạn. Hãy đăng nhập lại.")
        page = await sess["context"].new_page()
        try:
            await _facebook_prepare_thread_page(page, target)

            textbox = await _first_visible_locator(
                page,
                [
                    'div[role="textbox"][contenteditable="true"]',
                    'div[contenteditable="true"][data-lexical-editor="true"]',
                    'div[contenteditable="true"]',
                    '[aria-label="Message"][contenteditable="true"]',
                    '[aria-label="Tin nhắn"][contenteditable="true"]',
                ],
                timeout=4000,
            )
            if not textbox:
                raise RuntimeError(f"Không tìm thấy ô nhập Messenger cho thread {target}.")

            files = [str(p).strip() for p in (image_paths or []) if str(p).strip()]
            if files:
                file_input = await _first_visible_locator(page, ['input[type="file"]'], timeout=1000)
                if not file_input:
                    file_input = page.locator('input[type="file"]').first
                await file_input.set_input_files(files)
                await page.wait_for_timeout(2500)

            if text:
                await textbox.click(timeout=5000)
                try:
                    await textbox.fill(text)
                except Exception:
                    await page.keyboard.insert_text(text)
                await page.wait_for_timeout(350)

            send_button = await _first_visible_locator(
                page,
                [
                    'div[aria-label="Send"]',
                    'button[aria-label="Send"]',
                    'div[aria-label="Gửi"]',
                    'button[aria-label="Gửi"]',
                    '[data-testid="send"]',
                ],
                timeout=1500,
            )
            if send_button:
                await send_button.click(timeout=5000)
            else:
                await textbox.press("Enter")
            await page.wait_for_timeout(1800)
            return {"ok": True, "target": target, "cli_msg_id": f"fb_live_{uuid.uuid4().hex}", "msg_type": "webchat"}
        finally:
            try:
                await page.close()
            except Exception:
                pass


def _run_facebook_live_message_threadsafe(
    user_id: str,
    target: str,
    text: str = "",
    image_paths: list[str] | None = None,
    timeout: int = 60,
) -> dict:
    sess = _facebook_live_sessions.get(user_id)
    loop = sess.get("loop") if sess else None
    if loop and loop.is_running():
        future = asyncio.run_coroutine_threadsafe(
            _send_facebook_live_message(user_id, target, text, image_paths),
            loop,
        )
        return future.result(timeout=timeout)
    return asyncio.run(_send_facebook_live_message(user_id, target, text, image_paths))


async def _sync_facebook_live_session(user_id: str, max_threads: int) -> dict | None:
    sess = _facebook_live_sessions.get(user_id) or await restore_facebook_live_session(user_id)
    if not sess:
        return None
    page = sess["page"]
    if not await _facebook_page_is_connected(page, sess["context"]):
        return None

    rows = await page.locator('a[href*="/messages/t/"], a[href*="/messages/e2ee/t/"]').evaluate_all(
        """(anchors, limit) => anchors.slice(0, limit).map(anchor => ({
            href: anchor.getAttribute('href') || '',
            text: (anchor.innerText || '').trim()
        }))""",
        max_threads,
    )
    threads = []
    seen = set()
    for row in rows:
        href = str(row.get("href") or "")
        match = re.search(r"/messages/(?:e2ee/)?t/([^/?#]+)", href)
        if not match:
            continue
        external_id = match.group(1)
        if external_id in seen:
            continue
        seen.add(external_id)
        text = str(row.get("text") or "").strip()
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        threads.append({
            "external_id": external_id,
            "title": lines[0] if lines else external_id,
            "preview": lines[1] if len(lines) > 1 else "",
            "href": href,
        })
    with get_connection() as conn:
        saved_threads = conn.execute(
            """SELECT external_id, title
               FROM omni_conversations
               WHERE user_id = ? AND platform = 'facebook'
                 AND COALESCE(external_id, '') <> ''
               ORDER BY CASE WHEN lower(title) = 'meta ai' THEN 0 ELSE 1 END,
                        COALESCE(last_message_at, updated_at, created_at) DESC
               LIMIT ?""",
            (user_id, max(max_threads, 8)),
        ).fetchall()
    existing_thread_ids = {thread["external_id"] for thread in threads}
    for row in saved_threads:
        external_id = str(row["external_id"])
        if external_id in existing_thread_ids:
            continue
        threads.append({
            "external_id": external_id,
            "title": str(row["title"]),
            "preview": "",
            "href": f"/messages/e2ee/t/{external_id}/",
        })
        existing_thread_ids.add(external_id)
        if len(threads) >= max(max_threads, 8):
            break
    threads.sort(key=lambda thread: 0 if str(thread.get("title") or "").strip().lower() == "meta ai" else 1)
    thread_messages = {}
    for thread in threads[: max(1, min(max_threads, 20))]:
        href = thread["href"]
        if href.startswith("/"):
            href = f"https://www.facebook.com{href}"
        candidate_hrefs = [href]
        if "/messages/e2ee/t/" in href:
            candidate_hrefs.append(href.replace("/messages/e2ee/t/", "/messages/t/"))
        elif "/messages/t/" in href:
            candidate_hrefs.append(href.replace("/messages/t/", "/messages/e2ee/t/"))

        items = []
        for candidate_href in candidate_hrefs:
            try:
                await page.goto(candidate_href, wait_until="domcontentloaded", timeout=60000)
                # Messenger renders the thread shell before the actual message bubbles.
                # If we scrape immediately, Facebook often returns an empty/partial DOM.
                await page.wait_for_timeout(6500 if "/messages/e2ee/t/" in candidate_href else 4500)
            except Exception:
                continue
            for _attempt in range(6):
                try:
                    await page.evaluate(
                        """() => {
                            for (const el of document.querySelectorAll('div')) {
                                if (el.scrollHeight > el.clientHeight + 120) {
                                    el.scrollTop = el.scrollHeight;
                                }
                            }
                        }"""
                    )
                except Exception:
                    pass
                await page.wait_for_timeout(1200)
                items = await page.locator('div[dir="auto"]').evaluate_all(
                    """nodes => nodes.map(node => {
                        const rect = node.getBoundingClientRect();
                        const text = (node.innerText || '').trim();
                        let align = '';
                        let timestampText = '';
                        let messageLabel = '';
                        let el = node;
                        for (let depth = 0; el && depth < 14; depth += 1, el = el.parentElement) {
                            const currentAlign = getComputedStyle(el).alignItems;
                            if (currentAlign === 'flex-start' || currentAlign === 'flex-end') {
                                align = currentAlign;
                            }
                            const aria = el.getAttribute('aria-label') || '';
                            if (!messageLabel && /^Lúc \\d{1,2}:\\d{2}, /.test(aria)) {
                                messageLabel = aria;
                            }
                            timestampText ||= el.getAttribute('data-tooltip-content') || aria || el.getAttribute('title') || '';
                        }
                        return {
                            text,
                            align,
                            timestampText,
                            messageLabel,
                            x: rect.x,
                            right: rect.right,
                            y: rect.y,
                            width: rect.width,
                            height: rect.height
                        };
                    }).filter(item =>
                        item.text &&
                        item.x > 300 &&
                        item.y > 120 &&
                        item.width > 10 &&
                        item.width < 700 &&
                        item.height > 10 &&
                        item.height < 220
                    )"""
                )
                if items:
                    break
            if items:
                break
        seen_messages = set()
        active_messages = []
        for item in items:
            text = str(item.get("text") or "").strip()
            if not text or text in seen_messages:
                continue
            seen_messages.add(text)
            message_label = str(item.get("messageLabel") or "").strip()
            role = "user" if ", Bạn" in message_label or str(item.get("align") or "") == "flex-end" else "assistant"
            active_messages.append({
                "content": text,
                "role": role,
                "timestamp_text": message_label or str(item.get("timestampText") or "").strip(),
            })
        thread_messages[thread["external_id"]] = active_messages[-30:]
    return {"ok": True, "threads": threads, "thread_messages": thread_messages}


def _insert_facebook_message_once(
    user_id: str,
    conversation_id: str,
    external_thread_id: str,
    role: str,
    content: str,
    created_at: str | None = None,
) -> str:
    normalized = content.strip()
    if not normalized:
        return ""
    fingerprint = hashlib.sha1(
        f"facebook:{external_thread_id}:{role}:{normalized}".encode("utf-8")
    ).hexdigest()
    external_id = f"fb_{fingerprint}"
    with get_connection() as conn:
        exists = conn.execute(
            """SELECT 1 FROM omni_messages
               WHERE conversation_id = ? AND external_id = ? LIMIT 1""",
            (conversation_id, external_id),
        ).fetchone()
        if exists:
            return ""
        message_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO omni_messages
               (id, conversation_id, user_id, role, content, platform, external_id,
                external_msg_type, created_at)
               VALUES (?, ?, ?, ?, ?, 'facebook', ?, 'message', ?)""",
            (
                message_id,
                conversation_id,
                user_id,
                role,
                normalized,
                external_id,
                created_at or datetime.now().isoformat(),
            ),
        )
    update_conversation_preview(conversation_id, normalized[:200], role)
    return message_id


async def _sync_facebook_exact_thread_cookie(
    user_id: str,
    thread_id: str,
    title: str = "",
    max_messages: int = 30,
) -> dict:
    cookie = _load_facebook_channel(user_id)
    if not cookie or not thread_id:
        return {"synced_conversations": 0, "synced_messages": 0}
    from playwright.async_api import async_playwright

    items = []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1440, "height": 900},
        )
        await context.add_cookies(_cookie_header_to_playwright(cookie, ".facebook.com"))
        page = await context.new_page()
        for url in (
            f"https://www.facebook.com/messages/t/{thread_id}",
            f"https://www.facebook.com/messages/e2ee/t/{thread_id}",
        ):
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=45000)
                await page.wait_for_timeout(6500 if "/messages/e2ee/t/" in url else 4500)
                body = await page.locator("body").inner_text(timeout=5000)
                if "login" in page.url.lower() or "Đăng nhập" in body or "Log in" in body:
                    continue
                for _attempt in range(6):
                    try:
                        await page.evaluate(
                            """() => {
                                for (const el of document.querySelectorAll('div')) {
                                    if (el.scrollHeight > el.clientHeight + 120) el.scrollTop = el.scrollHeight;
                                }
                            }"""
                        )
                    except Exception:
                        pass
                    await page.wait_for_timeout(1200)
                    items = await page.locator('div[dir="auto"]').evaluate_all(
                        """nodes => nodes.map(node => {
                            const rect = node.getBoundingClientRect();
                            const text = (node.innerText || '').trim();
                            let align = '';
                            let messageLabel = '';
                            let el = node;
                            for (let depth = 0; el && depth < 14; depth += 1, el = el.parentElement) {
                                const currentAlign = getComputedStyle(el).alignItems;
                                if (currentAlign === 'flex-start' || currentAlign === 'flex-end') align = currentAlign;
                                const aria = el.getAttribute('aria-label') || '';
                                if (!messageLabel && /^Lúc \d{1,2}:\d{2}, /.test(aria)) messageLabel = aria;
                            }
                            return {text, align, messageLabel, x: rect.x, y: rect.y, width: rect.width, height: rect.height};
                        }).filter(item => item.text && item.x > 250 && item.y > 100 && item.width > 10 && item.width < 760 && item.height > 10 && item.height < 260)"""
                    )
                    if items:
                        break
                if items:
                    break
            except Exception:
                continue
        await browser.close()

    conv = ensure_conversation(user_id, "facebook", title or thread_id, thread_id, "user", "")
    synced = 0
    touched = False
    seen_messages = set()
    for item in items[-max_messages:]:
        text = str(item.get("text") or "").strip()
        if not text or text in seen_messages:
            continue
        seen_messages.add(text)
        label = str(item.get("messageLabel") or "")
        role = "user" if ", Bạn" in label or str(item.get("align") or "") == "flex-end" else "assistant"
        message_id = _insert_facebook_message_once(
            user_id,
            conv["id"],
            thread_id,
            role,
            text,
            _facebook_created_at_from_label(label),
        )
        if message_id:
            synced += 1
            touched = True
            if role != "user":
                _broadcast({
                    "type": "message",
                    "conversationId": conv["id"],
                    "message": {"id": message_id, "sender_type": "assistant", "content": text, "status": "received"},
                })
    if touched:
        _broadcast({"type": "sync", "platform": "facebook", "conversationIds": [conv["id"]], "messages": synced})
    return {"synced_conversations": 1, "synced_messages": synced}


async def _sync_facebook_exact_thread_live(
    user_id: str,
    thread_id: str,
    title: str = "",
    max_messages: int = 30,
) -> dict:
    """Read a specific Messenger thread from the logged-in Playwright profile.

    Meta AI often renders differently or fails in a fresh cookie-only headless
    context. This uses the persistent Playwright Facebook context that the user
    logged into, but opens a temporary page so it does not disturb the visible
    Facebook page.
    """
    sess = _facebook_live_sessions.get(user_id)
    if not sess:
        for candidate in _facebook_browser_sessions.values():
            if candidate.get("user_id") == user_id:
                sess = candidate
                break
    if not sess:
        sess = await restore_facebook_live_session(user_id)
    if not sess or not thread_id:
        return {"synced_conversations": 0, "synced_messages": 0}

    context = sess["context"]
    page = await context.new_page()
    items = []
    try:
        for url in (
            f"https://www.facebook.com/messages/t/{thread_id}",
            f"https://www.facebook.com/messages/e2ee/t/{thread_id}",
        ):
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=60000)
                await page.wait_for_timeout(7000)
                body = await page.locator("body").inner_text(timeout=7000)
                if "login" in page.url.lower() or "Đăng nhập" in body or "Log in" in body:
                    continue
                for _attempt in range(8):
                    try:
                        await page.evaluate(
                            """() => {
                                for (const el of document.querySelectorAll('div')) {
                                    if (el.scrollHeight > el.clientHeight + 120) el.scrollTop = el.scrollHeight;
                                }
                            }"""
                        )
                    except Exception:
                        pass
                    await page.wait_for_timeout(1200)
                    items = await page.locator('div[dir="auto"], span[dir="auto"]').evaluate_all(
                        """nodes => nodes.map(node => {
                            const rect = node.getBoundingClientRect();
                            const text = (node.innerText || node.textContent || '').trim();
                            let align = '';
                            let messageLabel = '';
                            let el = node;
                            for (let depth = 0; el && depth < 16; depth += 1, el = el.parentElement) {
                                const style = getComputedStyle(el);
                                if (style.alignItems === 'flex-start' || style.alignItems === 'flex-end') align = style.alignItems;
                                const aria = el.getAttribute('aria-label') || '';
                                if (!messageLabel && (/^Lúc \\d{1,2}:\\d{2}, /.test(aria) || aria.includes('Bạn đã gửi'))) messageLabel = aria;
                            }
                            return {text, align, messageLabel, x: rect.x, y: rect.y, width: rect.width, height: rect.height};
                        }).filter(item =>
                            item.text &&
                            item.y > 80 &&
                            item.width > 10 &&
                            item.width < 900 &&
                            item.height > 8 &&
                            item.height < 320 &&
                            !['Meta AI', 'Messenger', 'Search', 'Tìm kiếm', 'Đoạn chat', 'Chats'].includes(item.text)
                        )"""
                    )
                    if items:
                        break
                if items:
                    break
            except Exception:
                continue
    finally:
        try:
            await page.close()
        except Exception:
            pass

    conv = ensure_conversation(user_id, "facebook", title or thread_id, thread_id, "user", "")
    synced = 0
    touched = False
    seen_messages = set()
    for item in items[-max_messages:]:
        text = str(item.get("text") or "").strip()
        if not text or text in seen_messages:
            continue
        seen_messages.add(text)
        label = str(item.get("messageLabel") or "")
        role = "user" if ", Bạn" in label or "Bạn đã gửi" in label or str(item.get("align") or "") == "flex-end" else "assistant"
        message_id = _insert_facebook_message_once(
            user_id,
            conv["id"],
            thread_id,
            role,
            text,
            _facebook_created_at_from_label(label),
        )
        if message_id:
            synced += 1
            touched = True
            if role != "user":
                _broadcast({
                    "type": "message",
                    "conversationId": conv["id"],
                    "message": {"id": message_id, "sender_type": "assistant", "content": text, "status": "received"},
                })
    if touched:
        _broadcast({"type": "sync", "platform": "facebook", "conversationIds": [conv["id"]], "messages": synced})
    return {"synced_conversations": 1, "synced_messages": synced}


def _facebook_created_at_from_label(label: str) -> str | None:
    match = re.search(r"Lúc\s+(\d{1,2}):(\d{2})", label or "")
    if not match:
        return None
    now = datetime.now()
    return now.replace(
        hour=int(match.group(1)),
        minute=int(match.group(2)),
        second=0,
        microsecond=0,
    ).isoformat()


async def _sync_facebook_for_user(user_id: str, max_threads: int, max_messages: int = 1) -> dict:
    loop = asyncio.get_running_loop()
    lock = _facebook_sync_locks.get(user_id)
    if lock is None or getattr(lock, "_loop", None) not in (None, loop):
        lock = asyncio.Lock()
        _facebook_sync_locks[user_id] = lock
    async with lock:
        cookie = _load_facebook_channel(user_id)
        if not cookie:
            return {"ok": False, "synced_conversations": 0, "synced_messages": 0}

        # Important: never scrape through the visible/live Facebook tab.
        # Using the live Playwright page here caused the user's Messenger window
        # to jump/reload while sync was running. Keep sync isolated in a hidden
        # cookie-based browser instead.
        data = _run_facebook_bridge(
            FACEBOOK_SYNC_BRIDGE,
            {"cookie": cookie, "max_threads": max_threads},
            timeout=90,
        )
        synced_conversations = 0
        synced_messages = 0
        conv_by_external_id = {}
        for thread in data.get("threads") or []:
            external_id = str(thread.get("external_id") or "").strip()
            if not external_id:
                continue
            conv = ensure_conversation(
                user_id,
                "facebook",
                str(thread.get("title") or external_id),
                external_id,
                "user",
                "",
            )
            conv_by_external_id[external_id] = conv
            synced_conversations += 1

        # The bridge above is intentionally only for the conversation list.
        # Fetch messages in hidden cookie sessions too, never by navigating the
        # visible Messenger tab. Limit the number per run so sync stays bounded.
        for thread in (data.get("threads") or [])[: max(1, min(max_threads, 4))]:
            thread_id = str(thread.get("external_id") or "").strip()
            if not thread_id:
                continue
            try:
                thread_data = await _sync_facebook_exact_thread_cookie(
                    user_id,
                    thread_id,
                    str(thread.get("title") or thread_id),
                    max(1, min(max_messages, 3)),
                )
                synced_messages += int(thread_data.get("synced_messages") or 0)
            except Exception as exc:
                logging.warning("Facebook hidden thread sync skipped for %s: %s", thread_id, exc)
        return {
            "ok": True,
            "synced_conversations": synced_conversations,
            "synced_messages": synced_messages,
            "threads": data.get("threads") or [],
        }


async def _facebook_sync_loop(user_id: str) -> None:
    try:
        while _load_facebook_channel(user_id):
            try:
                await _sync_facebook_for_user(user_id, 4, 1)
            except Exception:
                logging.exception("Facebook realtime sync failed for user %s", user_id)
            await asyncio.sleep(8)
    finally:
        _facebook_sync_tasks.pop(user_id, None)


def _ensure_facebook_sync_task(user_id: str) -> None:
    task = _facebook_sync_tasks.get(user_id)
    if task and not task.done():
        return
    _facebook_sync_tasks[user_id] = asyncio.create_task(_facebook_sync_loop(user_id))


def restore_active_facebook_sync_tasks() -> None:
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT user_id
               FROM omni_channels
               WHERE platform = 'facebook' AND is_active = 1 AND access_token != ''"""
        ).fetchall()
    for row in rows:
        try:
            _ensure_facebook_sync_task(str(row["user_id"]))
        except RuntimeError:
            logging.warning("Facebook sync restore skipped; no running event loop for user %s", row["user_id"])


def _save_zalo_channel(user_id: str, cookie: str, imei: str) -> None:
    token = json.dumps({"cookie": cookie, "imei": imei}, ensure_ascii=False)
    now = datetime.now().isoformat()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id FROM omni_channels WHERE user_id = ? AND platform = ?",
            (user_id, "zalo"),
        ).fetchone()
        if row:
            conn.execute(
                """UPDATE omni_channels
                   SET name = ?, access_token = ?, is_active = 1, updated_at = ?
                   WHERE id = ?""",
                ("Zalo", token, now, row["id"]),
            )
        else:
            conn.execute(
                """INSERT INTO omni_channels
                   (id, user_id, name, platform, access_token, is_active, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, 1, ?, ?)""",
                (str(uuid.uuid4()), user_id, "Zalo", "zalo", token, now, now),
            )


def _save_facebook_channel(user_id: str, cookie: str) -> None:
    now = datetime.now().isoformat()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id FROM omni_channels WHERE user_id = ? AND platform = ?",
            (user_id, "facebook"),
        ).fetchone()
        if row:
            conn.execute(
                """UPDATE omni_channels
                   SET name = ?, access_token = ?, is_active = 1, updated_at = ?
                   WHERE id = ?""",
                ("Facebook", cookie, now, row["id"]),
            )
        else:
            conn.execute(
                """INSERT INTO omni_channels
                   (id, user_id, name, platform, access_token, is_active, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, 1, ?, ?)""",
                (str(uuid.uuid4()), user_id, "Facebook", "facebook", cookie, now, now),
            )


def _mark_zalo_channel_inactive(user_id: str) -> None:
    with get_connection() as conn:
        conn.execute(
            """UPDATE omni_channels
               SET is_active = 0, updated_at = ?
               WHERE user_id = ? AND platform = ?""",
            (datetime.now().isoformat(), user_id, "zalo"),
        )


def _mark_omni_channel_inactive(user_id: str, platform: str) -> None:
    with get_connection() as conn:
        conn.execute(
            """UPDATE omni_channels
               SET is_active = 0, updated_at = ?
               WHERE user_id = ? AND platform = ?""",
            (datetime.now().isoformat(), user_id, platform),
        )


def _stop_zalo_listener(user_id: str) -> None:
    with _zalo_listeners_lock:
        state = _zalo_listeners.pop(user_id, None)
    proc = state.get("proc") if state else None
    if proc and proc.poll() is None:
        try:
            proc.terminate()
        except Exception:
            pass


def _clear_chromium_profile_cookies(profile_dir: Path, domains: list[str]) -> int:
    removed = 0
    if not profile_dir.exists():
        return 0
    cookie_files = [
        profile_dir / "Default" / "Cookies",
        profile_dir / "Default" / "Network" / "Cookies",
    ]
    for cookie_file in cookie_files:
        if not cookie_file.exists():
            continue
        try:
            with sqlite3.connect(str(cookie_file)) as conn:
                for domain in domains:
                    pattern = f"%{domain.lstrip('.')}%"
                    for table in ("cookies",):
                        try:
                            cur = conn.execute(f"DELETE FROM {table} WHERE host_key LIKE ?", (pattern,))
                            removed += cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
                        except sqlite3.Error:
                            pass
                conn.commit()
        except sqlite3.Error:
            pass
    for lock_name in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
        try:
            (profile_dir / lock_name).unlink(missing_ok=True)
        except Exception:
            pass
    return removed


async def _clear_omni_browser_cookies_for_platform(user_id: str, platform: str) -> None:
    sess = _omni_browser_sessions.get(user_id)
    context = sess.get("context") if sess else None
    if not context:
        return
    domains = {
        "facebook": ["facebook.com", ".facebook.com", "messenger.com", ".messenger.com"],
        "zalo": ["zalo.me", ".zalo.me", "id.zalo.me", ".id.zalo.me", "zlogin.zalo.me", ".zlogin.zalo.me"],
    }.get(platform, [])
    for domain in domains:
        try:
            await context.clear_cookies(domain=domain)
        except Exception:
            pass


def _zalo_error_needs_reauth(message: str) -> bool:
    normalized = (message or "").lower()
    markers = (
        "cookie/imei",
        "cookie",
        "imei",
        "hết hạn",
        "không hợp lệ",
        "invalid",
        "expired",
        "login",
        "unauthorized",
        "not logged",
    )
    return any(marker in normalized for marker in markers)


def _load_zalo_channel(user_id: str) -> tuple[str, str]:
    with get_connection() as conn:
        row = conn.execute(
            """SELECT access_token FROM omni_channels
               WHERE user_id = ? AND platform = ? AND is_active = 1
               ORDER BY updated_at DESC LIMIT 1""",
            (user_id, "zalo"),
        ).fetchone()
    if not row or not row["access_token"]:
        return "", ""
    try:
        data = json.loads(row["access_token"])
    except json.JSONDecodeError:
        return row["access_token"], ""
    return data.get("cookie", ""), data.get("imei", "")


def _load_facebook_channel(user_id: str) -> str:
    with get_connection() as conn:
        row = conn.execute(
            """SELECT access_token FROM omni_channels
               WHERE user_id = ? AND platform = ? AND is_active = 1
               ORDER BY updated_at DESC LIMIT 1""",
            (user_id, "facebook"),
        ).fetchone()
    return str(row["access_token"] or "") if row else ""


def restore_active_zalo_listeners() -> None:
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT user_id, access_token
               FROM omni_channels
               WHERE platform = 'zalo' AND is_active = 1"""
        ).fetchall()
    for row in rows:
        try:
            data = json.loads(row["access_token"] or "{}")
        except json.JSONDecodeError:
            data = {"cookie": row["access_token"] or "", "imei": ""}
        _ensure_zalo_listener(
            row["user_id"],
            str(data.get("cookie") or ""),
            str(data.get("imei") or ""),
        )


def _validate_zalo_session(cookie: str, imei: str) -> tuple[bool, str]:
    try:
        data = _run_zalo_bridge(
            ZALO_SYNC_BRIDGE,
            {"cookie": cookie, "imei": imei},
            timeout=45,
        )
    except HTTPException as exc:
        return False, str(exc.detail)
    if data.get("error"):
        return False, str(data["error"])
    return True, ""


def _run_zalo_bridge(script: Path, payload: dict, timeout: int = 90) -> dict:
    if not script.exists():
        raise HTTPException(status_code=500, detail=f"Không tìm thấy Python Zalo bridge: {script.name}")
    
    # Reduce timeout for faster response
    actual_timeout = min(timeout, 30)
    
    proc = subprocess.run(
        [sys.executable, str(script)],
        input=json.dumps(payload, ensure_ascii=False),
        text=True,
        capture_output=True,
        timeout=actual_timeout,
    )
    try:
        data = _parse_bridge_json(proc.stdout)
    except Exception:
        data = {}
    if proc.returncode != 0 or data.get("error") or data.get("ok") is False:
        detail = data.get("error") or proc.stderr.strip() or "Zalo bridge lỗi."
        raise HTTPException(status_code=502, detail=detail[:500])
    return data


def _run_facebook_bridge(script: Path, payload: dict, timeout: int = 90) -> dict:
    if not script.exists():
        raise HTTPException(status_code=500, detail=f"Không tìm thấy Python Facebook bridge: {script.name}")
    proc = subprocess.run(
        [sys.executable, str(script)],
        input=json.dumps(payload, ensure_ascii=False),
        text=True,
        capture_output=True,
        timeout=timeout,
    )
    try:
        data = _parse_bridge_json(proc.stdout)
    except Exception:
        data = {}
    if proc.returncode != 0 or data.get("error") or data.get("ok") is False:
        detail = data.get("error") or proc.stderr.strip() or "Facebook bridge lỗi."
        raise HTTPException(status_code=502, detail=detail[:500])
    return data


def _zalo_event_content(event: dict) -> str:
    content = event.get("content")
    if isinstance(content, str):
        return content
    obj = event.get("message_object")
    if isinstance(obj, dict):
        for key in ("content", "text", "message", "body", "href", "url"):
            value = obj.get(key)
            if isinstance(value, str) and value.strip():
                return value
    return json.dumps(content or obj or "", ensure_ascii=False)


def _zalo_message_meta_from_row(row) -> dict:
    if not row:
        return {}
    return {
        "msgId": row["external_id"] or "",
        "cliMsgId": row["external_cli_msg_id"] or "",
        "msgType": row["external_msg_type"] or "webchat",
        "uidFrom": row["external_author_id"] or "",
        "content": row["content"] or "",
        "ts": row["created_at"] or "",
    }


def _get_zalo_message_context(message_id: str, user_id: str) -> tuple[dict, dict]:
    with get_connection() as conn:
        row = conn.execute(
            """SELECT m.*, c.external_id AS thread_id, c.thread_type, c.platform
               FROM omni_messages m
               JOIN omni_conversations c ON c.id = m.conversation_id
               WHERE m.id = ? AND m.user_id = ?""",
            (message_id, user_id),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Message not found")
    if row["platform"] != "zalo":
        return dict(row), {}
    message = _zalo_message_meta_from_row(row)
    if not message.get("msgId") or not message.get("cliMsgId"):
        return dict(row), {}
    meta = {
        "target": row["thread_id"] or "",
        "thread_type": row["thread_type"] or "user",
        "message": message,
    }
    return dict(row), meta


def _get_telegram_reply_external_id(reply_to_id: str | None, user_id: str) -> str:
    if not reply_to_id:
        return ""
    row, _meta = _get_zalo_message_context(reply_to_id, user_id)
    if row.get("platform") != "telegram":
        return ""
    return str(row.get("external_id") or "")


def _get_zalo_reply_meta(reply_to_id: str | None, user_id: str) -> dict:
    if not reply_to_id:
        return {}
    try:
        _row, meta = _get_zalo_message_context(reply_to_id, user_id)
    except HTTPException:
        return {}
    return meta.get("message") or {}


def _apply_zalo_reaction_event(user_id: str, message_object: dict, author_id: str) -> bool:
    try:
        payload = json.loads(str(message_object.get("content") or ""))
    except (TypeError, json.JSONDecodeError):
        return False
    targets = payload.get("rMsg") if isinstance(payload, dict) else None
    emoji = str(payload.get("rIcon") or "") if isinstance(payload, dict) else ""
    if not isinstance(targets, list) or not targets or not emoji:
        return False
    target = targets[0] if isinstance(targets[0], dict) else {}
    msg_id = str(target.get("gMsgID") or "")
    cli_msg_id = str(target.get("cMsgID") or "")
    if not msg_id and not cli_msg_id:
        return False
    with get_connection() as conn:
        row = conn.execute(
            """SELECT id, reactions_json FROM omni_messages
               WHERE user_id = ?
                 AND platform = 'zalo'
                 AND (external_id = ? OR external_cli_msg_id = ?)
               ORDER BY created_at DESC LIMIT 1""",
            (user_id, msg_id, cli_msg_id),
        ).fetchone()
        if not row:
            return False
        try:
            reactions = json.loads(row["reactions_json"] or "{}")
        except (TypeError, json.JSONDecodeError):
            reactions = {}
        users = reactions.setdefault(emoji, [])
        reactor = author_id or "__zalo__"
        if reactor not in users:
            users.append(reactor)
        conn.execute(
            "UPDATE omni_messages SET reactions_json = ? WHERE id = ?",
            (json.dumps(reactions, ensure_ascii=False), row["id"]),
        )
    return True


def _apply_zalo_undo_event(user_id: str, message_object: dict) -> bool:
    try:
        payload = json.loads(str(message_object.get("content") or ""))
    except (TypeError, json.JSONDecodeError):
        return False
    if not isinstance(payload, dict):
        return False
    msg_id = str(payload.get("globalMsgId") or "")
    cli_msg_id = str(payload.get("cliMsgId") or "")
    if not msg_id and not cli_msg_id:
        return False
    with get_connection() as conn:
        row = conn.execute(
            """SELECT id, conversation_id FROM omni_messages
               WHERE user_id = ?
                 AND platform = 'zalo'
                 AND (external_id = ? OR external_cli_msg_id = ?)
               ORDER BY created_at DESC LIMIT 1""",
            (user_id, msg_id, cli_msg_id),
        ).fetchone()
        if not row:
            return False
        conn.execute("DELETE FROM omni_messages WHERE id = ?", (row["id"],))
    refresh_conversation_preview(row["conversation_id"])
    return True


def _zalo_profile_for_thread(user_id: str, thread_id: str) -> tuple[str, str]:
    with get_connection() as conn:
        row = conn.execute(
            """SELECT name, avatar_url
               FROM omni_contacts
               WHERE user_id = ? AND platform = 'zalo' AND external_id = ?
               LIMIT 1""",
            (user_id, thread_id),
        ).fetchone()
    if row:
        return str(row["name"] or thread_id), str(row["avatar_url"] or "")
    return thread_id, ""


def _handle_zalo_listener_event(user_id: str, state: dict, event: dict) -> None:
    if event.get("event") == "ready":
        state["own_id"] = str(event.get("own_id") or "")
        return
    if event.get("event") != "message":
        return

    thread_id = str(event.get("thread_id") or "")
    if not thread_id:
        return
    state["last_event_at"] = datetime.now().isoformat()
    state["last_thread_id"] = thread_id
    thread_type = str(event.get("thread_type") or "user").lower()
    if "group" in thread_type:
        thread_type = "group"
    else:
        thread_type = "user"

    message_object = event.get("message_object") or {}
    msg_type = str(message_object.get("msgType") or "").lower()
    if msg_type == "chat.reaction":
        _apply_zalo_reaction_event(
            user_id,
            message_object,
            str(event.get("author_id") or ""),
        )
        return
    if msg_type == "chat.undo":
        _apply_zalo_undo_event(user_id, message_object)
        return

    title, avatar = _zalo_profile_for_thread(user_id, thread_id)
    conv = ensure_conversation(user_id, "zalo", title, thread_id, thread_type, avatar)
    msg = {
        "external_id": str(event.get("mid") or f"{thread_id}:{time.time()}"),
        "cli_msg_id": str(message_object.get("cliMsgId") or ""),
        "msg_type": str(message_object.get("msgType") or "webchat"),
        "author_id": str(event.get("author_id") or ""),
        "author_name": str(message_object.get("dName") or ""),
        "content": _zalo_event_content(event),
    }
    inserted_message_id = _insert_zalo_message_once(user_id, conv["id"], msg, own_id=str(state.get("own_id") or ""))
    if inserted_message_id:
        sender_type = "user" if str(state.get("own_id") or "") and msg["author_id"] == str(state.get("own_id") or "") else "assistant"
        _broadcast({
            "type": "message",
            "platform": "zalo",
            "conversationId": conv["id"],
            "message": {
                "id": inserted_message_id,
                "sender_type": sender_type,
                "content": msg["content"],
                "status": "received",
            },
        })
        if sender_type == "assistant":
            _start_agent_auto_reply_for_incoming(user_id, conv["id"], inserted_message_id)


def _zalo_listener_reader(user_id: str, proc: subprocess.Popen, state: dict) -> None:
    try:
        assert proc.stdout is not None
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event.get("event") == "error":
                state["error"] = event.get("error") or "Zalo listener lỗi."
                break
            try:
                _handle_zalo_listener_event(user_id, state, event)
            except sqlite3.OperationalError as exc:
                state["error"] = f"Zalo listener DB bận: {exc}"
                logging.warning("Zalo listener skipped one event due to sqlite error: %s", exc)
            except Exception as exc:
                state["error"] = f"Zalo listener event lỗi: {exc}"
                logging.exception("Zalo listener failed to handle an event")
    finally:
        with _zalo_listeners_lock:
            current = _zalo_listeners.get(user_id)
            if current and current.get("proc") is proc:
                _zalo_listeners.pop(user_id, None)


def _ensure_zalo_listener(user_id: str, cookie: str, imei: str) -> bool:
    if not cookie or not imei or not ZALO_LISTEN_BRIDGE.exists():
        return False
    with _zalo_listeners_lock:
        current = _zalo_listeners.get(user_id)
        proc = current.get("proc") if current else None
        if proc and proc.poll() is None:
            return True

        proc = subprocess.Popen(
            [sys.executable, str(ZALO_LISTEN_BRIDGE)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        payload = json.dumps({"cookie": cookie, "imei": imei}, ensure_ascii=False)
        assert proc.stdin is not None
        proc.stdin.write(payload)
        proc.stdin.close()
        state = {"proc": proc, "own_id": "", "error": "", "last_event_at": "", "last_thread_id": ""}
        _zalo_listeners[user_id] = state
        thread = threading.Thread(
            target=_zalo_listener_reader,
            args=(user_id, proc, state),
            daemon=True,
        )
        state["thread"] = thread
        thread.start()
        return True


@router.get("/sync/zalo/listener/status")
def zalo_listener_status(request: Request):
    user_id = _get_user_id(request)
    with _zalo_listeners_lock:
        state = dict(_zalo_listeners.get(user_id) or {})
    proc = state.pop("proc", None)
    state.pop("thread", None)
    return {
        "running": bool(proc and proc.poll() is None),
        "own_id": state.get("own_id") or "",
        "last_event_at": state.get("last_event_at") or "",
        "last_thread_id": state.get("last_thread_id") or "",
        "error": state.get("error") or "",
    }


def _parse_bridge_json(output: str) -> dict:
    clean = re.sub(r"\x1b\[[0-9;:]*[A-Za-z]", "", output or "").strip()
    decoder = json.JSONDecoder()
    for match in re.finditer(r"{", clean):
        try:
            data, _ = decoder.raw_decode(clean[match.start():])
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            continue
    return {}


def _insert_zalo_message_once(user_id: str, conversation_id: str, msg: dict, own_id: str = "") -> str:
    external_id = str(msg.get("external_id") or "")
    if not external_id:
        return ""
    with get_connection() as conn:
        exists = conn.execute(
            """SELECT 1 FROM omni_messages
               WHERE conversation_id = ? AND external_id = ? LIMIT 1""",
            (conversation_id, external_id),
        ).fetchone()
        if exists:
            return ""
        author_id = str(msg.get("author_id") or "")
        role = "user" if own_id and author_id == own_id else "assistant"
        content = str(msg.get("content") or "")
        if role == "user":
            pending = conn.execute(
                """SELECT id FROM omni_messages
                   WHERE conversation_id = ?
                     AND role = 'user'
                     AND content = ?
                     AND COALESCE(external_id, '') = ''
                   ORDER BY created_at DESC LIMIT 1""",
                (conversation_id, content),
            ).fetchone()
            if pending:
                conn.execute(
                    """UPDATE omni_messages
                       SET external_id = ?,
                           external_cli_msg_id = ?,
                           external_msg_type = ?,
                           external_author_id = ?,
                           external_author_name = ?
                       WHERE id = ?""",
                    (
                        external_id,
                        str(msg.get("cli_msg_id") or ""),
                        str(msg.get("msg_type") or "webchat"),
                        author_id,
                        str(msg.get("author_name") or ""),
                        pending["id"],
                    ),
                )
                conn.execute(
                    """UPDATE omni_conversations
                       SET last_message_preview = ?, last_message_sender = ?,
                           last_message_at = datetime('now', 'localtime'),
                           updated_at = datetime('now', 'localtime')
                       WHERE id = ?""",
                    (content[:200], role, conversation_id),
                )
                return ""
        created_at = datetime.now().isoformat()
        message_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO omni_messages
               (id, conversation_id, user_id, role, content, platform, external_id,
                external_cli_msg_id, external_msg_type, external_author_id,
                external_author_name, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                message_id,
                conversation_id,
                user_id,
                role,
                content,
                "zalo",
                external_id,
                str(msg.get("cli_msg_id") or ""),
                str(msg.get("msg_type") or "webchat"),
                author_id,
                str(msg.get("author_name") or ""),
                created_at,
            ),
        )
    update_conversation_preview(conversation_id, str(msg.get("content") or "")[:200], role)
    return message_id


def _cleanup_stale_zalo_group_conversations(user_id: str, active_thread_ids: set[str]) -> int:
    placeholders = ",".join("?" for _ in active_thread_ids)
    keep_clause = f"AND external_id NOT IN ({placeholders})" if active_thread_ids else ""
    params = [user_id]
    params.extend(sorted(active_thread_ids))
    with get_connection() as conn:
        result = conn.execute(
            f"""DELETE FROM omni_conversations
                WHERE user_id = ?
                  AND platform = 'zalo'
                  AND thread_type = 'group'
                  AND title = external_id
                  AND NOT EXISTS (
                      SELECT 1 FROM omni_messages
                      WHERE omni_messages.conversation_id = omni_conversations.id
                  )
                  {keep_clause}""",
            params,
        )
        return result.rowcount


def _cleanup_empty_unpinned_zalo_conversations(user_id: str) -> int:
    with get_connection() as conn:
        result = conn.execute(
            """DELETE FROM omni_conversations
               WHERE user_id = ?
                 AND platform = 'zalo'
                 AND pinned = 0
                 AND NOT EXISTS (
                     SELECT 1 FROM omni_messages
                     WHERE omni_messages.conversation_id = omni_conversations.id
                 )""",
            (user_id,),
        )
        return result.rowcount


def _normalize_zalo_self_conversations(user_id: str) -> int:
    with get_connection() as conn:
        result = conn.execute(
            """UPDATE omni_messages
               SET role = 'user'
               WHERE user_id = ?
                 AND platform = 'zalo'
                 AND conversation_id IN (
                     SELECT id FROM omni_conversations
                     WHERE user_id = ?
                       AND platform = 'zalo'
                       AND lower(title) IN ('cloud của tôi', 'my documents')
                 )""",
            (user_id, user_id),
        )
        return result.rowcount


def _refresh_empty_zalo_previews(user_id: str) -> None:
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT id FROM omni_conversations c
               WHERE c.user_id = ?
                 AND c.platform = 'zalo'
                 AND NOT EXISTS (
                     SELECT 1 FROM omni_messages m
                     WHERE m.conversation_id = c.id
                 )""",
            (user_id,),
        ).fetchall()
    for row in rows:
        refresh_conversation_preview(row["id"])


def _cleanup_stale_zalo_contacts(user_id: str, active_external_ids: set[str]) -> int:
    if not active_external_ids:
        return 0
    placeholders = ",".join("?" for _ in active_external_ids)
    params = [user_id]
    params.extend(sorted(active_external_ids))
    with get_connection() as conn:
        result = conn.execute(
            f"""DELETE FROM omni_contacts
                WHERE user_id = ?
                  AND platform = 'zalo'
                  AND external_id NOT IN ({placeholders})""",
            params,
        )
        return result.rowcount


def _cleanup_zalo_reaction_messages(user_id: str) -> int:
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT DISTINCT conversation_id FROM omni_messages
               WHERE user_id = ?
                 AND platform = 'zalo'
                 AND external_msg_type IN ('chat.reaction', 'chat.undo')""",
            (user_id,),
        ).fetchall()
        result = conn.execute(
            """DELETE FROM omni_messages
               WHERE user_id = ?
                 AND platform = 'zalo'
                 AND external_msg_type IN ('chat.reaction', 'chat.undo')""",
            (user_id,),
        )
    for row in rows:
        refresh_conversation_preview(row["conversation_id"])
    return result.rowcount


def _cleanup_duplicate_zalo_sent_media(user_id: str) -> int:
    removed = 0
    touched_conversations = set()
    with get_connection() as conn:
        groups = conn.execute(
            """SELECT conversation_id, external_id
               FROM omni_messages
               WHERE user_id = ?
                 AND platform = 'zalo'
                 AND role = 'user'
                 AND COALESCE(external_id, '') != ''
               GROUP BY conversation_id, external_id
               HAVING COUNT(*) > 1""",
            (user_id,),
        ).fetchall()
        for group in groups:
            rows = conn.execute(
                """SELECT id, content, created_at
                   FROM omni_messages
                   WHERE conversation_id = ?
                     AND platform = 'zalo'
                     AND role = 'user'
                     AND external_id = ?
                   ORDER BY created_at DESC""",
                (group["conversation_id"], group["external_id"]),
            ).fetchall()
            keep = next((row for row in rows if "__OMNI_MEDIA__" in (row["content"] or "")), rows[0])
            for row in rows:
                if row["id"] == keep["id"]:
                    continue
                conn.execute("DELETE FROM omni_messages WHERE id = ?", (row["id"],))
                removed += 1
            touched_conversations.add(group["conversation_id"])
    for conversation_id in touched_conversations:
        refresh_conversation_preview(conversation_id)
    return removed


@router.post("/sync/zalo/qr/start")
async def start_zalo_qr(request: Request):
    user_id = _get_user_id(request)
    session_id = str(uuid.uuid4())
    try:
        from playwright.async_api import async_playwright

        playwright = await async_playwright().start()
        browser = await playwright.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
        )
        page = await context.new_page()
        sess = {
            "user_id": user_id,
            "playwright": playwright,
            "browser": browser,
            "context": context,
            "page": page,
            "imei": "",
        }
        page.on("request", lambda req: _capture_zalo_imei_from_url(sess, req.url))
        page.on("response", lambda resp: _capture_zalo_imei_from_url(sess, resp.url))
        _zalo_qr_sessions[session_id] = sess

        await page.goto("https://chat.zalo.me/", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(1500)
        try:
            qr_tab = page.locator('a:has-text("VỚI MÃ QR"), text="VỚI MÃ QR"').first
            if await qr_tab.is_visible(timeout=5000):
                await qr_tab.click()
                await page.wait_for_timeout(1000)
        except Exception:
            pass

        qr_data = ""
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            qr_data = await _find_zalo_qr_data(page)
            if qr_data and len(qr_data) > 500:
                break
            await page.wait_for_timeout(1000)

        if not qr_data or len(qr_data) < 100:
            raise RuntimeError("Không tìm thấy mã QR Zalo hợp lệ.")
        qr_data = _normalize_qr_data_uri(qr_data)

        asyncio.create_task(_expire_zalo_qr_session(session_id))
        return {
            "session": session_id,
            "session_id": session_id,
            "qr": qr_data,
            "status": "pending",
            "detail": "Quét QR bằng Zalo trên điện thoại.",
            "expires_in": 300,
        }
    except Exception as e:
        await _close_zalo_qr_session(session_id)
        return {
            "session": session_id,
            "session_id": session_id,
            "qr": None,
            "status": "unavailable",
            "detail": f"Không tạo được QR Zalo bằng Python backend: {e}",
        }


@router.get("/sync/zalo/qr/{session}/status", response_model=OmniQRStatusResponse)
async def check_zalo_qr_status(session: str, request: Request):
    user_id = _get_user_id(request)
    sess = _zalo_qr_sessions.get(session)
    if not sess or sess.get("user_id") != user_id:
        return OmniQRStatusResponse(
            session=session,
            status="expired",
            detail="Phiên QR Zalo đã hết hạn. Hãy tạo mã mới.",
        )

    cookie = await _get_zalo_cookie_header(sess["context"])
    logged_in = "zpsid" in cookie or "zpw_sek" in cookie
    if not logged_in:
        return OmniQRStatusResponse(
            session=session,
            status="pending",
            detail="Đang chờ quét QR Zalo...",
        )

    imei = sess.get("imei") or await _read_zalo_imei(sess["page"])
    if not imei:
        imei = str(uuid.uuid4())
    valid, reason = _validate_zalo_session(cookie, imei)
    if not valid:
        return OmniQRStatusResponse(
            session=session,
            status="pending",
            detail=f"Zalo đã quét QR nhưng backend chưa dùng được phiên này: {reason}. Đang chờ Zalo hoàn tất đăng nhập...",
        )
    _save_zalo_channel(user_id, cookie, imei)
    _ensure_zalo_listener(user_id, cookie, imei)
    await _close_zalo_qr_session(session)
    return OmniQRStatusResponse(
        session=session,
        status="connected",
        detail="Zalo đã kết nối và lưu phiên đăng nhập.",
    )


@router.post("/sync/zalo/messages")
def sync_zalo_messages(payload: OmniSyncMessagesRequest, request: Request):
    user_id = _get_user_id(request)
    _save_omni_browser_channels_threadsafe(user_id)
    cookie, imei = _load_zalo_channel(user_id)
    if not cookie or not imei:
        _save_omni_browser_channels_threadsafe(user_id)
        cookie, imei = _load_zalo_channel(user_id)
    if not cookie or not imei:
        return {
            "synced_contacts": 0,
            "synced_conversations": 0,
            "synced_messages": 0,
            "status": "Chưa có phiên Zalo. Hãy quét QR trước.",
        }
    if not ZALO_SYNC_BRIDGE.exists():
        raise HTTPException(status_code=500, detail="Không tìm thấy Python Zalo sync bridge.")

    proc = subprocess.run(
        [sys.executable, str(ZALO_SYNC_BRIDGE)],
        input=json.dumps({"cookie": cookie, "imei": imei}, ensure_ascii=False),
        text=True,
        capture_output=True,
        timeout=90,
    )
    try:
        data = _parse_bridge_json(proc.stdout)
    except Exception:
        data = {}
    if proc.returncode != 0 or data.get("error"):
        detail = data.get("error") or proc.stderr.strip() or "Zalo sync bridge lỗi."
        if _zalo_error_needs_reauth(detail):
            _mark_zalo_channel_inactive(user_id)
        return {
            "synced_contacts": 0,
            "synced_conversations": 0,
            "synced_messages": 0,
            "status": f"Phiên Zalo không còn hợp lệ, hãy quét QR lại. {detail}",
        }

    synced_contacts = 0
    synced_conversations = 0
    synced_messages = 0
    touched_conversations: set[str] = set()
    active_thread_ids: set[str] = set()
    active_contact_ids: set[str] = set()
    own_id = str(data.get("own_id") or "")
    friend_profiles: dict[str, dict] = {}
    group_profiles: dict[str, dict] = {}
    for friend in data.get("friends") or []:
        if not friend.get("friend_id"):
            continue
        friend_id = str(friend["friend_id"])
        friend_profiles[friend_id] = friend
        active_contact_ids.add(friend_id)
        if upsert_contact(user_id, "zalo", friend_id, str(friend.get("name") or friend_id), friend.get("avatar") or ""):
            synced_contacts += 1
    for group in data.get("groups") or []:
        if not group.get("group_id"):
            continue
        group_id = str(group["group_id"])
        group_profiles[group_id] = group
        active_contact_ids.add(group_id)
        if upsert_contact(user_id, "zalo", group_id, str(group.get("name") or group_id), group.get("avatar") or ""):
            synced_contacts += 1

    for thread in (data.get("threads") or [])[: payload.maxThreads]:
        thread_id = str(thread.get("thread_id") or "")
        if not thread_id:
            continue
        active_thread_ids.add(thread_id)
        thread_type = str(thread.get("thread_type") or "user")
        conv = ensure_conversation(
            user_id,
            "zalo",
            str(thread.get("name") or thread_id),
            thread_id,
            thread_type,
            str(thread.get("avatar") or ""),
        )
        conv_id = conv["id"]
        touched_conversations.add(conv_id)
        synced_conversations += 1
        for msg in (thread.get("messages") or [])[-payload.maxMessages:]:
            if _insert_zalo_message_once(user_id, conv_id, msg, own_id=own_id):
                synced_messages += 1
                _broadcast({
                    "type": "message",
                    "conversationId": conv_id,
                    "message": {
                        "sender_type": "assistant",
                        "content": str(msg.get("content") or ""),
                        "status": "received",
                    },
                })

    if touched_conversations:
        _broadcast({
            "type": "sync",
            "platform": "zalo",
            "conversationIds": list(touched_conversations),
            "messages": synced_messages,
        })
    _cleanup_stale_zalo_contacts(user_id, active_contact_ids)
    _cleanup_stale_zalo_group_conversations(user_id, active_thread_ids)
    _cleanup_empty_unpinned_zalo_conversations(user_id)
    _cleanup_zalo_reaction_messages(user_id)
    _cleanup_duplicate_zalo_sent_media(user_id)
    _normalize_zalo_self_conversations(user_id)
    _refresh_empty_zalo_previews(user_id)
    _ensure_zalo_listener(user_id, cookie, imei)

    return {
        "synced_contacts": synced_contacts,
        "synced_conversations": synced_conversations,
        "synced_messages": synced_messages,
        "status": "Đồng bộ Zalo xong bằng Python backend.",
    }


@router.post("/channels/{platform}/logout")
async def logout_omni_channel(platform: str, request: Request):
    user_id = _get_user_id(request)
    platform = platform.lower().strip()
    if platform not in {"facebook", "zalo", "telegram"}:
        raise HTTPException(status_code=400, detail="Kênh không hợp lệ.")

    if platform == "zalo":
        _stop_zalo_listener(user_id)
        _mark_omni_channel_inactive(user_id, "zalo")
        await _clear_omni_browser_cookies_for_platform(user_id, "zalo")
        return {"ok": True, "status": "Đã logout Zalo."}

    if platform == "facebook":
        _mark_omni_channel_inactive(user_id, "facebook")
        task = _facebook_sync_tasks.pop(user_id, None)
        if task:
            task.cancel()
        live = _facebook_live_sessions.pop(user_id, None)
        await _close_facebook_playwright_session(live)
        for session_id, sess in list(_facebook_browser_sessions.items()):
            if sess.get("user_id") == user_id:
                await _close_facebook_browser_session(session_id)
        # Important: this is the per-channel Facebook logout. Do not clear the
        # shared Omni Browser profile here; users expect Omni to keep its session.
        domains = ["facebook.com", "messenger.com", "fbcdn.net", "fbsbx.com"]
        removed = _clear_chromium_profile_cookies(FACEBOOK_PROFILE_ROOT / user_id, domains)
        return {"ok": True, "status": f"Đã logout Facebook riêng. Đã xoá {removed} cookie."}

    # Telegram's live listener is managed by api.routers.telegram; mark the
    # channel inactive here so future sends/syncs require QR again.
    _mark_omni_channel_inactive(user_id, "telegram")
    try:
        from api.routers.telegram import disconnect_listener
        disconnect_listener(user_id)
    except Exception:
        pass
    return {"ok": True, "status": "Đã logout Telegram."}


@router.post("/connect/facebook")
def connect_facebook(payload: OmniConnectFacebookRequest, request: Request):
    user_id = _get_user_id(request)
    _run_facebook_bridge(
        FACEBOOK_SYNC_BRIDGE,
        {"cookie": payload.cookie, "max_threads": 1},
        timeout=90,
    )
    _save_facebook_channel(user_id, payload.cookie)
    return {"connected": True, "status": "Đã lưu phiên Facebook."}


@router.post("/connect/omni-browser/start")
async def start_omni_browser(request: Request):
    user_id = _get_user_id(request)
    await _close_omni_browser_session(user_id)
    sess = await _launch_omni_browser_session(user_id, headless=False)
    return {
        "ok": True,
        "status": "Đã mở Omni Browser: Facebook, Zalo, Telegram.",
        "tabs": len(sess.get("pages") or []),
    }


@router.post("/connect/omni-browser/hide")
async def hide_omni_browser(request: Request):
    user_id = _get_user_id(request)
    await _save_omni_browser_channels(user_id)
    had_visible = user_id in _omni_browser_sessions
    await _close_omni_browser_session(user_id)
    return {
        "ok": True,
        "hidden": True,
        "status": "Đã ẩn Omni Browser. Bấm 🌐 để mở lại." if had_visible else "Không có Omni Browser đang mở.",
    }


@router.post("/connect/omni-browser/close")
async def close_omni_browser(request: Request):
    user_id = _get_user_id(request)
    await _close_omni_browser_session(user_id)
    return {"ok": True, "status": "Đã đóng Omni Browser."}


@router.post("/connect/omni-browser/save-sessions")
async def save_omni_browser_sessions(request: Request):
    user_id = _get_user_id(request)
    saved = await _save_omni_browser_channels(user_id)
    return {"ok": True, "saved": saved, "status": "Đã cập nhật session từ Omni Browser."}


@router.post("/connect/facebook/browser/start")
async def start_facebook_browser_login(request: Request):
    user_id = _get_user_id(request)
    session_id = str(uuid.uuid4())
    existing = _facebook_live_sessions.pop(user_id, None)
    await _close_facebook_playwright_session(existing)
    sess = await _launch_facebook_persistent_session(user_id, headless=False, require_default_browser=False)
    page = sess["page"]
    _facebook_browser_sessions[session_id] = sess
    await page.goto("https://www.facebook.com/messages/", wait_until="domcontentloaded", timeout=60000)
    return {
        "session_id": session_id,
        "status": "pending",
        "source": "playwright",
        "detail": "Đã mở Facebook bằng Playwright riêng.",
    }


@router.get("/connect/facebook/browser/{session_id}/status")
async def facebook_browser_login_status(session_id: str, request: Request):
    user_id = _get_user_id(request)
    sess = _facebook_browser_sessions.get(session_id)
    if not sess or sess["user_id"] != user_id:
        return {"session_id": session_id, "status": "expired", "detail": "Phiên Facebook đã hết hạn."}
    page = sess["page"]
    if await _facebook_page_is_connected(page, sess["context"]):
        cookie = await _get_facebook_cookie_header(sess["context"])
        _save_facebook_channel(user_id, cookie)
        _facebook_live_sessions[user_id] = sess
        _ensure_facebook_sync_task(user_id)
        _facebook_browser_sessions.pop(session_id, None)
        return {"session_id": session_id, "status": "connected", "detail": "Facebook đã kết nối."}
    if await _facebook_page_needs_security_unlock(page):
        return {
            "session_id": session_id,
            "status": "pending",
            "detail": "Facebook đang yêu cầu mã bảo mật/PIN. Nhập trực tiếp trong cửa sổ Facebook đang mở.",
        }
    return {
        "session_id": session_id,
        "status": "pending",
        "detail": "Hoàn tất đăng nhập hoặc xác minh trong cửa sổ Facebook đang mở.",
    }


@router.post("/connect/facebook/browser/hide")
async def hide_facebook_browser(request: Request):
    user_id = _get_user_id(request)
    saved_cookie = ""
    converted = False

    for session_id, sess in list(_facebook_browser_sessions.items()):
        if sess.get("user_id") != user_id:
            continue
        try:
            saved_cookie = await _get_facebook_cookie_header(sess["context"])
            if saved_cookie:
                _save_facebook_channel(user_id, saved_cookie)
        except Exception:
            pass
        await _close_facebook_browser_session(session_id)
        converted = True

    live = _facebook_live_sessions.pop(user_id, None)
    if live:
        try:
            saved_cookie = await _get_facebook_cookie_header(live["context"])
            if saved_cookie:
                _save_facebook_channel(user_id, saved_cookie)
        except Exception:
            pass
        await _close_facebook_playwright_session(live)
        converted = True

    if saved_cookie or _load_facebook_channel(user_id):
        restored = await restore_facebook_live_session(user_id)
        if restored:
            return {"ok": True, "hidden": True, "status": "Đã ngắt điều khiển Facebook; tab/browser của anh vẫn giữ nguyên."}

    return {
        "ok": converted,
        "hidden": converted,
        "status": "Đã ngắt điều khiển Facebook; không đóng tab nào." if converted else "Không có phiên điều khiển Facebook đang mở.",
    }


@router.post("/sync/omni/messages")
async def sync_omni_messages(payload: OmniSyncMessagesRequest, request: Request):
    """Fast shared sync for Omni Browser.

    This endpoint is intentionally separate from the per-channel sync buttons:
    it first harvests sessions from the shared Omni Browser, then runs bounded
    channel syncs and returns one combined result.
    """
    user_id = _get_user_id(request)
    saved = await _save_omni_browser_channels(user_id)

    async def run_telegram():
        from api.routers import telegram as telegram_router
        fast_payload = OmniSyncMessagesRequest(maxThreads=min(payload.maxThreads, 80), maxMessages=min(payload.maxMessages, 30))
        return await asyncio.wait_for(telegram_router.sync_messages(fast_payload, request), timeout=12)

    async def run_zalo():
        fast_payload = OmniSyncMessagesRequest(maxThreads=min(payload.maxThreads, 80), maxMessages=min(payload.maxMessages, 30))
        return await asyncio.wait_for(asyncio.to_thread(sync_zalo_messages, fast_payload, request), timeout=15)

    async def run_facebook():
        fast_payload = OmniSyncMessagesRequest(maxThreads=3, maxMessages=min(payload.maxMessages, 20))
        return await asyncio.wait_for(sync_facebook_messages(fast_payload, request), timeout=12)

    async def capture(label: str, coro):
        try:
            data = await coro
            return {"label": label, "ok": True, "data": data}
        except Exception as exc:
            logging.warning("Omni shared sync %s failed: %s", label, exc)
            return {"label": label, "ok": False, "error": str(exc), "data": {}}

    results = await asyncio.gather(
        capture("telegram", run_telegram()),
        capture("zalo", run_zalo()),
        capture("facebook", run_facebook()),
    )
    per_channel = {item["label"]: item for item in results}
    total_messages = sum(int((item.get("data") or {}).get("synced_messages") or 0) for item in results)
    total_conversations = sum(int((item.get("data") or {}).get("synced_conversations") or 0) for item in results)
    failures = [item["label"] for item in results if not item.get("ok")]
    return {
        "ok": not failures,
        "source": "omni-browser",
        "saved_sessions": saved,
        "synced_conversations": total_conversations,
        "synced_messages": total_messages,
        "per_channel": per_channel,
        "status": "Omni sync xong." if not failures else f"Omni sync xong, lỗi: {', '.join(failures)}.",
    }


@router.post("/sync/facebook/messages")
async def sync_facebook_messages(payload: OmniSyncMessagesRequest, request: Request):
    user_id = _get_user_id(request)
    await _save_facebook_controlled_session_cookie(user_id)
    await _save_omni_browser_channels(user_id)
    cookie = _load_facebook_channel(user_id)
    if not cookie:
        await _save_facebook_controlled_session_cookie(user_id)
        await _save_omni_browser_channels(user_id)
        cookie = _load_facebook_channel(user_id)
    if not cookie:
        raise HTTPException(status_code=400, detail="Chưa có phiên Facebook. Hãy kết nối trước.")
    latest_messages = max(1, min(payload.maxMessages, 3))
    try:
        meta_data = await asyncio.wait_for(
            _sync_facebook_exact_thread_live(user_id, "156025504001094", "Meta AI", latest_messages),
            timeout=45,
        )
    except Exception as exc:
        logging.warning("Facebook Meta AI live exact sync failed for user %s: %s", user_id, exc)
        try:
            meta_data = await asyncio.wait_for(
                _sync_facebook_exact_thread_cookie(user_id, "156025504001094", "Meta AI", latest_messages),
                timeout=25,
            )
        except Exception as cookie_exc:
            logging.warning("Facebook Meta AI cookie exact sync skipped for user %s: %s", user_id, cookie_exc)
            meta_data = {"synced_conversations": 0, "synced_messages": 0}

    data = {"synced_conversations": 0, "synced_messages": 0}
    if payload.maxThreads <= 3:
        # Fast path used by Omni sync-all: do not block on broad Messenger scraping.
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_sync_facebook_for_user(user_id, payload.maxThreads, latest_messages))
        except Exception:
            pass
    else:
        try:
            data = await asyncio.wait_for(_sync_facebook_for_user(user_id, payload.maxThreads, latest_messages), timeout=90)
        except Exception as exc:
            logging.warning("Facebook broad sync skipped/failed after Meta AI exact sync for user %s: %s", user_id, exc)
    _ensure_facebook_sync_task(user_id)
    return {
        "synced_conversations": data["synced_conversations"] + meta_data["synced_conversations"],
        "synced_messages": data["synced_messages"] + meta_data["synced_messages"],
        "status": "Đồng bộ Facebook nhanh xong; broad sync chạy nền nếu cần.",
    }
