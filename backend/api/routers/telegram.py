"""Telegram user-account OmniChat endpoints via Telethon."""

from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import threading
import time
import uuid
from datetime import datetime

import qrcode
from fastapi import APIRouter, HTTPException, Request
from telethon import TelegramClient, events
from telethon.errors import SessionPasswordNeededError
from telethon.sessions import StringSession

from api.schemas import OmniSyncMessagesRequest, OmniQRStatusResponse
from api.services.db import get_connection
from api.services.omni_store import (
    ensure_conversation,
    refresh_conversation_preview,
    update_conversation_preview,
    upsert_contact,
)
from api.services.user_store import resolve_user_id

router = APIRouter(prefix="/telegram", tags=["OmniChat - Telegram"])

_qr_sessions: dict[str, dict] = {}
_listeners: dict[str, dict] = {}
_listeners_lock = threading.Lock()


def _get_user_id(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    token = auth.replace("Bearer ", "").strip() or request.query_params.get("t", "hat")
    uid = resolve_user_id(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return uid


def _api_config() -> tuple[int, str]:
    raw_id = os.getenv("TELEGRAM_API_ID", "").strip()
    api_hash = os.getenv("TELEGRAM_API_HASH", "").strip()
    if not raw_id or not api_hash:
        raise HTTPException(
            status_code=503,
            detail="Thiếu TELEGRAM_API_ID hoặc TELEGRAM_API_HASH để đăng nhập Telegram user account.",
        )
    try:
        return int(raw_id), api_hash
    except ValueError as exc:
        raise HTTPException(status_code=503, detail="TELEGRAM_API_ID không hợp lệ.") from exc


def _qr_data_uri(url: str) -> str:
    image = qrcode.make(url, border=2)
    out = io.BytesIO()
    image.save(out, format="PNG")
    return "data:image/png;base64," + base64.b64encode(out.getvalue()).decode()


def _save_channel(user_id: str, session_string: str) -> None:
    token = json.dumps({"session": session_string}, ensure_ascii=False)
    now = datetime.now().isoformat()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id FROM omni_channels WHERE user_id = ? AND platform = 'telegram'",
            (user_id,),
        ).fetchone()
        if row:
            conn.execute(
                """UPDATE omni_channels
                   SET name = 'Telegram', access_token = ?, is_active = 1, updated_at = ?
                   WHERE id = ?""",
                (token, now, row["id"]),
            )
        else:
            conn.execute(
                """INSERT INTO omni_channels
                   (id, user_id, name, platform, access_token, is_active, created_at, updated_at)
                   VALUES (?, ?, 'Telegram', 'telegram', ?, 1, ?, ?)""",
                (str(uuid.uuid4()), user_id, token, now, now),
            )


def _load_channel(user_id: str) -> str:
    with get_connection() as conn:
        row = conn.execute(
            """SELECT access_token FROM omni_channels
               WHERE user_id = ? AND platform = 'telegram' AND is_active = 1
               ORDER BY updated_at DESC LIMIT 1""",
            (user_id,),
        ).fetchone()
    if not row or not row["access_token"]:
        return ""
    try:
        return str(json.loads(row["access_token"]).get("session") or "")
    except json.JSONDecodeError:
        return ""


def _insert_message_once(
    user_id: str,
    conversation_id: str,
    *,
    external_id: str,
    role: str,
    content: str,
    author_id: str = "",
    author_name: str = "",
) -> bool:
    if not external_id:
        return False
    with get_connection() as conn:
        exists = conn.execute(
            """SELECT 1 FROM omni_messages
               WHERE conversation_id = ? AND external_id = ? LIMIT 1""",
            (conversation_id, external_id),
        ).fetchone()
        if exists:
            return False
        conn.execute(
            """INSERT INTO omni_messages
               (id, conversation_id, user_id, role, content, platform, external_id,
                external_msg_type, external_author_id, external_author_name, created_at)
               VALUES (?, ?, ?, ?, ?, 'telegram', ?, 'message', ?, ?, ?)""",
            (
                str(uuid.uuid4()),
                conversation_id,
                user_id,
                role,
                content,
                external_id,
                author_id,
                author_name,
                datetime.now().isoformat(),
            ),
        )
    update_conversation_preview(conversation_id, content[:200], role)
    return True


async def _dialog_profile(dialog) -> tuple[str, str, str, str]:
    entity = dialog.entity
    external_id = str(dialog.id)
    title = dialog.name or external_id
    thread_type = "group" if dialog.is_group or dialog.is_channel else "user"
    avatar = ""
    return external_id, title, thread_type, avatar


async def _sync_client(user_id: str, client: TelegramClient, payload: OmniSyncMessagesRequest) -> tuple[int, int]:
    synced_conversations = 0
    synced_messages = 0
    active_thread_ids: set[str] = set()
    me = await client.get_me()
    own_id = str(me.id)
    async for dialog in client.iter_dialogs(limit=payload.maxThreads):
        external_id, title, thread_type, avatar = await _dialog_profile(dialog)
        active_thread_ids.add(external_id)
        upsert_contact(user_id, "telegram", external_id, title, avatar)
        conv = ensure_conversation(user_id, "telegram", title, external_id, thread_type, avatar)
        synced_conversations += 1
        async for message in client.iter_messages(dialog.entity, limit=payload.maxMessages, reverse=True):
            text = message.message or ""
            if not text:
                continue
            role = "user" if str(message.sender_id or "") == own_id or message.out else "assistant"
            if _insert_message_once(
                user_id,
                conv["id"],
                external_id=str(message.id),
                role=role,
                content=text,
                author_id=str(message.sender_id or ""),
            ):
                synced_messages += 1
    with get_connection() as conn:
        conn.execute(
            """DELETE FROM omni_conversations
               WHERE user_id = ?
                 AND platform = 'telegram'
                 AND pinned = 0
                 AND NOT EXISTS (
                     SELECT 1 FROM omni_messages
                     WHERE omni_messages.conversation_id = omni_conversations.id
                 )""",
            (user_id,),
        )
    return synced_conversations, synced_messages


async def _listener_loop(user_id: str, session_string: str) -> None:
    api_id, api_hash = _api_config()
    client = TelegramClient(StringSession(session_string), api_id, api_hash)
    await client.connect()
    me = await client.get_me()
    own_id = str(me.id)

    @client.on(events.NewMessage)
    async def on_new_message(event):
        chat = await event.get_chat()
        external_id = str(event.chat_id)
        title = getattr(chat, "title", None) or " ".join(
            part for part in [getattr(chat, "first_name", ""), getattr(chat, "last_name", "")] if part
        ) or str(event.chat_id)
        thread_type = "group" if event.is_group or event.is_channel else "user"
        upsert_contact(user_id, "telegram", external_id, title, "")
        conv = ensure_conversation(user_id, "telegram", title, external_id, thread_type, "")
        role = "user" if str(event.sender_id or "") == own_id or event.out else "assistant"
        _insert_message_once(
            user_id,
            conv["id"],
            external_id=str(event.message.id),
            role=role,
            content=event.raw_text or "",
            author_id=str(event.sender_id or ""),
        )

    await client.run_until_disconnected()


def _ensure_listener(user_id: str, session_string: str) -> None:
    with _listeners_lock:
        current = _listeners.get(user_id)
        thread = current.get("thread") if current else None
        if thread and thread.is_alive():
            return

        def runner():
            asyncio.run(_listener_loop(user_id, session_string))

        thread = threading.Thread(target=runner, daemon=True)
        _listeners[user_id] = {"thread": thread}
        thread.start()


@router.post("/qr/start")
async def start_qr(request: Request):
    user_id = _get_user_id(request)
    api_id, api_hash = _api_config()
    client = TelegramClient(StringSession(), api_id, api_hash)
    await client.connect()
    qr_login = await client.qr_login()
    wait_task = asyncio.create_task(qr_login.wait())
    session_id = str(uuid.uuid4())
    _qr_sessions[session_id] = {
        "user_id": user_id,
        "client": client,
        "qr_login": qr_login,
        "wait_task": wait_task,
        "created_at": time.time(),
    }
    return {
        "session_id": session_id,
        "qr": _qr_data_uri(qr_login.url),
        "status": "pending",
        "detail": "Quét QR bằng Telegram trên điện thoại.",
    }


@router.get("/qr/{session}/status", response_model=OmniQRStatusResponse)
async def qr_status(session: str, request: Request):
    user_id = _get_user_id(request)
    state = _qr_sessions.get(session)
    if not state or state["user_id"] != user_id:
        return OmniQRStatusResponse(session=session, status="expired", detail="Phiên QR Telegram đã hết hạn.")
    task = state["wait_task"]
    if not task.done():
        return OmniQRStatusResponse(session=session, status="pending", detail="Đang chờ quét QR Telegram...")
    try:
        await task
    except SessionPasswordNeededError:
        return OmniQRStatusResponse(session=session, status="unavailable", detail="Tài khoản Telegram bật 2FA; cần bổ sung màn nhập mật khẩu.")
    except Exception as exc:
        return OmniQRStatusResponse(session=session, status="expired", detail=f"QR Telegram hết hạn hoặc lỗi: {exc}")
    client = state["client"]
    session_string = client.session.save()
    _save_channel(user_id, session_string)
    _ensure_listener(user_id, session_string)
    await client.disconnect()
    _qr_sessions.pop(session, None)
    return OmniQRStatusResponse(session=session, status="connected", detail="Telegram đã kết nối.")


@router.post("/sync/messages")
async def sync_messages(payload: OmniSyncMessagesRequest, request: Request):
    user_id = _get_user_id(request)
    session_string = _load_channel(user_id)
    if not session_string:
        return {
            "synced_conversations": 0,
            "synced_messages": 0,
            "status": "Chưa có phiên Telegram. Hãy quét QR trước.",
        }
    api_id, api_hash = _api_config()
    client = TelegramClient(StringSession(session_string), api_id, api_hash)
    await client.connect()
    if not await client.is_user_authorized():
        await client.disconnect()
        return {
            "synced_conversations": 0,
            "synced_messages": 0,
            "status": "Phiên Telegram hết hạn. Hãy quét QR lại.",
        }
    try:
        synced_conversations, synced_messages = await _sync_client(user_id, client, payload)
        _ensure_listener(user_id, session_string)
    finally:
        await client.disconnect()
    return {
        "synced_conversations": synced_conversations,
        "synced_messages": synced_messages,
        "status": "Đồng bộ Telegram xong bằng user session.",
    }
