"""OmniChat — unified multi-platform messaging hub."""

from __future__ import annotations

import json
import queue
import asyncio
import base64
import io
import re
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Query
from fastapi.responses import StreamingResponse
from PIL import Image, ImageOps

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
    upsert_contact,
    update_conversation_preview,
)
from api.services.db import get_connection
from api.services.user_store import resolve_user_id

router = APIRouter(prefix="/omni", tags=["OmniChat"])

BACKEND_ROOT = Path(__file__).resolve().parents[2]
ZALO_SYNC_BRIDGE = BACKEND_ROOT / "plugins/platforms/omnichannel/backend/zalo_bridges/zalo_sync_bridge.py"
ZALO_SEND_BRIDGE = BACKEND_ROOT / "plugins/platforms/omnichannel/backend/zalo_bridges/zalo_send_bridge.py"
ZALO_LISTEN_BRIDGE = BACKEND_ROOT / "plugins/platforms/omnichannel/backend/zalo_bridges/zalo_listen_bridge.py"


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

    external_id = conv.get("external_id") or ""
    platform = conv.get("platform") or ""
    send_meta = {}
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
                "text": payload.content,
                "thread_type": conv.get("thread_type") or "user",
                "action": "reply" if payload.reply_to_id else "send",
                "reply_to": _get_zalo_reply_meta(payload.reply_to_id, uid),
            },
            timeout=45,
        )

    msg_id = create_message(
        conversation_id=id,
        user_id=uid,
        role="user",
        content=payload.content,
        reply_to_id=payload.reply_to_id or None,
        platform=platform,
    )
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
    if not delete_message(id):
        raise HTTPException(status_code=404, detail="Message not found")
    return {"deleted": True}


@router.post("/messages/{id}/reaction")
def react_to_message(id: str, payload: OmniReactionRequest, request: Request):
    uid = _get_user_id(request)
    _row, meta = _get_zalo_message_context(id, uid)
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


# ── Sync / Connect ─────────────────────────────────────────────────────────

_zalo_qr_sessions: dict[str, dict] = {}
_zalo_listeners: dict[str, dict] = {}
_zalo_listeners_lock = threading.Lock()


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


def _mark_zalo_channel_inactive(user_id: str) -> None:
    with get_connection() as conn:
        conn.execute(
            """UPDATE omni_channels
               SET is_active = 0, updated_at = ?
               WHERE user_id = ? AND platform = ?""",
            (datetime.now().isoformat(), user_id, "zalo"),
        )


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
        detail = data.get("error") or proc.stderr.strip() or "Zalo bridge lỗi."
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
            """SELECT id FROM omni_messages
               WHERE user_id = ?
                 AND platform = 'zalo'
                 AND (external_id = ? OR external_cli_msg_id = ?)
               ORDER BY created_at DESC LIMIT 1""",
            (user_id, msg_id, cli_msg_id),
        ).fetchone()
        if not row:
            return False
        conn.execute("DELETE FROM omni_messages WHERE id = ?", (row["id"],))
    return True


def _handle_zalo_listener_event(user_id: str, state: dict, event: dict) -> None:
    if event.get("event") == "ready":
        state["own_id"] = str(event.get("own_id") or "")
        return
    if event.get("event") != "message":
        return

    thread_id = str(event.get("thread_id") or "")
    if not thread_id:
        return
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

    conv = ensure_conversation(user_id, "zalo", thread_id, thread_id, thread_type)
    msg = {
        "external_id": str(event.get("mid") or f"{thread_id}:{time.time()}"),
        "cli_msg_id": str(message_object.get("cliMsgId") or ""),
        "msg_type": str(message_object.get("msgType") or "webchat"),
        "author_id": str(event.get("author_id") or ""),
        "author_name": str(message_object.get("dName") or ""),
        "content": _zalo_event_content(event),
    }
    if _insert_zalo_message_once(user_id, conv["id"], msg, own_id=str(state.get("own_id") or "")):
        sender_type = "user" if str(state.get("own_id") or "") and msg["author_id"] == str(state.get("own_id") or "") else "assistant"
        _broadcast({
            "type": "message",
            "platform": "zalo",
            "conversationId": conv["id"],
            "message": {
                "sender_type": sender_type,
                "content": msg["content"],
                "status": "received",
            },
        })


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
            _handle_zalo_listener_event(user_id, state, event)
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
        state = {"proc": proc, "own_id": "", "error": ""}
        _zalo_listeners[user_id] = state
        thread = threading.Thread(
            target=_zalo_listener_reader,
            args=(user_id, proc, state),
            daemon=True,
        )
        state["thread"] = thread
        thread.start()
        return True


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


def _insert_zalo_message_once(user_id: str, conversation_id: str, msg: dict, own_id: str = "") -> bool:
    external_id = str(msg.get("external_id") or "")
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
        author_id = str(msg.get("author_id") or "")
        role = "user" if own_id and author_id == own_id else "assistant"
        created_at = datetime.now().isoformat()
        conn.execute(
            """INSERT INTO omni_messages
               (id, conversation_id, user_id, role, content, platform, external_id,
                external_cli_msg_id, external_msg_type, external_author_id,
                external_author_name, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                str(uuid.uuid4()),
                conversation_id,
                user_id,
                role,
                str(msg.get("content") or ""),
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
    return True


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
        result = conn.execute(
            """DELETE FROM omni_messages
               WHERE user_id = ?
                 AND platform = 'zalo'
                 AND external_msg_type IN ('chat.reaction', 'chat.undo')""",
            (user_id,),
        )
        return result.rowcount


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
        upsert_contact(user_id, "zalo", friend_id, str(friend.get("name") or friend_id), friend.get("avatar") or "")
        synced_contacts += 1
    for group in data.get("groups") or []:
        if not group.get("group_id"):
            continue
        group_id = str(group["group_id"])
        group_profiles[group_id] = group
        active_contact_ids.add(group_id)
        upsert_contact(user_id, "zalo", group_id, str(group.get("name") or group_id), group.get("avatar") or "")

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

    remaining_slots = max(0, payload.maxThreads - synced_conversations)
    for friend_id, friend in friend_profiles.items():
        if remaining_slots <= 0:
            break
        if friend_id in active_thread_ids:
            continue
        conv = ensure_conversation(
            user_id,
            "zalo",
            str(friend.get("name") or friend_id),
            friend_id,
            "user",
            str(friend.get("avatar") or ""),
        )
        touched_conversations.add(conv["id"])
        active_thread_ids.add(friend_id)
        synced_conversations += 1
        remaining_slots -= 1

    for group_id, group in group_profiles.items():
        if remaining_slots <= 0:
            break
        if group_id in active_thread_ids:
            continue
        group_name = str(group.get("name") or group_id)
        if group_name == group_id and not group.get("avatar"):
            continue
        conv = ensure_conversation(
            user_id,
            "zalo",
            group_name,
            group_id,
            "group",
            str(group.get("avatar") or ""),
        )
        touched_conversations.add(conv["id"])
        active_thread_ids.add(group_id)
        synced_conversations += 1
        remaining_slots -= 1

    if touched_conversations:
        _broadcast({
            "type": "sync",
            "platform": "zalo",
            "conversationIds": list(touched_conversations),
            "messages": synced_messages,
        })
    _cleanup_stale_zalo_contacts(user_id, active_contact_ids)
    _cleanup_stale_zalo_group_conversations(user_id, active_thread_ids)
    _cleanup_zalo_reaction_messages(user_id)
    _ensure_zalo_listener(user_id, cookie, imei)

    return {
        "synced_contacts": synced_contacts,
        "synced_conversations": synced_conversations,
        "synced_messages": synced_messages,
        "status": "Đồng bộ Zalo xong bằng Python backend.",
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
