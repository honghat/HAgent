#!/usr/bin/env python3
"""
HTTP-based Facebook Messenger send bridge.

Reads JSON payload from stdin, sends message via Go bridge.
"""
import json
import sys
from pathlib import Path

def find_backend_root() -> Path:
    curr = Path(__file__).resolve().parent
    for _ in range(10):
        if (curr / "requirements.txt").exists():
            return curr
        curr = curr.parent
    return Path(__file__).resolve().parents[3]

backend_root = find_backend_root()
sys.path.insert(0, str(backend_root))

# Monkey patch fbchat_v2 to fix switched headers parameters in reactions
try:
    import fbchat_v2._core._utils as _utils
    _orig_headers = _utils.Headers
    def patched_headers(dataForm=None, Host='www.facebook.com'):
        if isinstance(Host, dict):
            dataForm, Host = Host, 'www.facebook.com'
        elif isinstance(dataForm, dict) and not isinstance(Host, str):
            Host = 'www.facebook.com'
        return _orig_headers(dataForm, Host)
    _utils.Headers = patched_headers
    
    try:
        import fbchat_v2._messaging._reactions as _reactions
        _reactions.Headers = patched_headers
    except ImportError:
        pass
except Exception as e:
    import sys
    sys.stderr.write(f"Warning: Failed to monkeypatch fbchat_v2 Headers: {e}\n")

from fbchat_v2 import dataGetHome as fbDataGetHome


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    action = str(payload.get("action") or "send").lower()
    cookie = str(payload.get("cookie") or "")
    target = str(payload.get("target") or "").strip()
    text = str(payload.get("text") or "").strip()
    user_id = str(payload.get("user_id") or "default").strip()

    thread_type = str(payload.get("thread_type") or "user").lower()

    # New parameters
    reply_to_id = str(payload.get("reply_to_id") or "").strip()
    reply_to_author_id = str(payload.get("reply_to_author_id") or "").strip()
    message_id = str(payload.get("message_id") or "").strip()
    emoji = str(payload.get("emoji") or "").strip()
    type_added = str(payload.get("type_added") or "add").strip().lower()
    force_non_e2ee = bool(payload.get("force_non_e2ee"))

    # Phân giải ID ảo thành ID thật từ database nếu có thể
    if message_id.startswith("fb_"):
        try:
            from api.services.db import get_connection
            with get_connection() as conn:
                db_row = conn.execute(
                    "SELECT external_id FROM omni_messages WHERE external_cli_msg_id = ? AND external_id NOT LIKE 'fb_%' LIMIT 1",
                    (message_id,)
                ).fetchone()
                if db_row and db_row["external_id"]:
                    message_id = db_row["external_id"]
                    sys.stderr.write(f"Resolved synthetic ID to real ID: {message_id}\n")
        except Exception as e:
            sys.stderr.write(f"Failed to resolve synthetic ID: {e}\n")

    if not cookie:
        raise RuntimeError("Missing Facebook cookie")
    if action in {"send", "reply", "send_group"} and not target:
        raise RuntimeError("Missing Facebook target")

    dataFB = fbDataGetHome(cookie)
    if not dataFB.get("FacebookID"):
        raise RuntimeError("Facebook cookie expired or invalid")

    binary_path = str(backend_root / "bin/fbchat-bridge-e2ee")
    device_path = str(backend_root / f"data/fb_e2ee_device_{user_id}.json")

    if action in {"send", "reply"}:
        from fbchat_v2 import sendingE2EEEvent
        chat_jid = f"{target}@s.whatsapp.net"

        is_e2ee = True
        if force_non_e2ee or target == "156025504001094" or thread_type in {"group", "thread"}:
            is_e2ee = False

        # 1. Thử gửi E2EE trước
        success = False
        result = {}
        e2ee_exc = None
        if is_e2ee:
            try:
                with sendingE2EEEvent(dataFB=dataFB, binary_path=binary_path, device_path=device_path, e2ee_memory_only=False) as e2ee_sender:
                    data = e2ee_sender.bridge.call("sendE2EEMessage", {
                        "chatJid": chat_jid,
                        "text": text,
                        "replyToId": reply_to_id,
                        "replyToSenderJid": f"{reply_to_author_id}@s.whatsapp.net" if reply_to_author_id else "",
                    }, timeout=8.0)
                    result = {
                        "success": 1,
                        "payload": {
                            "messageID": data.get("messageId") or data.get("id"),
                            "timestamp": data.get("timestampMs") or data.get("timestamp") or 0,
                        }
                    }
                    success = True
            except Exception as e:
                e2ee_exc = e
                sys.stderr.write(f"E2EE send failed/timeout: {e}. Trying non-E2EE fallback...\n")
            
        # 2. Fallback sang gửi non-E2EE nếu E2EE thất bại (như Meta AI hoặc Page/Group)
        if not success:
            try:
                from facebook._send import api as SendApi
                send_api = SendApi()
                type_chat = "user" if thread_type == "user" else None
                res = send_api.send(
                    dataFB=dataFB,
                    contentSend=text,
                    threadID=target,
                    typeChat=type_chat,
                    messageID=reply_to_id or None
                )
                if res.get("success"):
                    result = res
                    success = True
                else:
                    raise RuntimeError(res.get("payload", {}).get("error-decription", "Native send failed"))
            except Exception as non_e2ee_exc:
                sys.stderr.write(f"Native send failed: {non_e2ee_exc}. Trying Go bridge sendMessage fallback...\n")
                try:
                    e2ee_sender = sendingE2EEEvent(dataFB=dataFB, binary_path=binary_path, device_path=device_path, e2ee_memory_only=False)
                    try:
                        e2ee_sender.connect(enable_e2ee=False)
                        data = e2ee_sender.bridge.call("sendMessage", {"threadId": int(target), "text": text}, timeout=15.0)
                        result = {
                            "success": 1,
                            "payload": {
                                "messageID": data.get("messageId") or data.get("id"),
                                "timestamp": data.get("timestampMs") or data.get("timestamp") or 0,
                            }
                        }
                        success = True
                    finally:
                        e2ee_sender.close()
                    success = True
                except Exception as final_exc:
                    result = {
                        "error": 1,
                        "payload": {
                            "error-decription": f"Native failed: {non_e2ee_exc}. Go fallback failed: {final_exc}",
                            "error-code": "both_failed",
                        }
                    }
    elif action == "react":
        if not message_id or not emoji:
            raise RuntimeError("Missing message_id or emoji for react action")
        
        chat_jid = f"{target}@s.whatsapp.net"
        is_e2ee = True
        if not target or target == "156025504001094" or thread_type in {"group", "thread"}:
            is_e2ee = False

        success = False
        result = {}
        if is_e2ee:
            try:
                from fbchat_v2 import sendingE2EEEvent
                with sendingE2EEEvent(dataFB=dataFB, binary_path=binary_path, device_path=device_path, e2ee_memory_only=False) as e2ee_sender:
                    reaction_val = "" if type_added == "remove" else emoji
                    e2ee_sender.bridge.call("SendE2EEReaction", {
                        "chatJid": chat_jid,
                        "messageId": message_id,
                        "reaction": reaction_val,
                        "emoji": reaction_val,
                    }, timeout=8.0)
                    result = {
                        "success": 1,
                        "payload": {
                            "messageID": message_id,
                            "emoji": emoji,
                        }
                    }
                    success = True
            except Exception as e:
                sys.stderr.write(f"E2EE react failed/timeout: {e}. Trying non-E2EE fallback...\n")

        if not success:
            try:
                from fbchat_v2._messaging._reactions import func as react_func
                res_req = react_func(dataFB=dataFB, typeAdded=type_added, messageID=message_id, emojiChoice=emoji)
                if res_req.status_code == 200:
                    result = {
                        "success": 1,
                        "payload": {
                            "messageID": message_id,
                            "emoji": emoji,
                        }
                    }
                else:
                    raise RuntimeError(f"GraphQL react mutation returned status {res_req.status_code}")
            except Exception as exc:
                result = {
                    "error": 1,
                    "payload": {
                        "error-decription": str(exc),
                        "error-code": "react_failed",
                    }
                }
    elif action == "unsend":
        if not message_id:
            raise RuntimeError("Missing message_id for unsend action")

        chat_jid = f"{target}@s.whatsapp.net"
        is_e2ee = True
        if not target or target == "156025504001094" or thread_type in {"group", "thread"}:
            is_e2ee = False

        success = False
        result = {}
        if is_e2ee:
            try:
                from fbchat_v2 import sendingE2EEEvent
                with sendingE2EEEvent(dataFB=dataFB, binary_path=binary_path, device_path=device_path, e2ee_memory_only=False) as e2ee_sender:
                    e2ee_sender.bridge.call("UnsendE2EEMessage", {
                        "chatJid": chat_jid,
                        "messageId": message_id,
                    }, timeout=8.0)
                    result = {
                        "success": 1,
                        "payload": {
                            "messageID": message_id,
                        }
                    }
                    success = True
            except Exception as e:
                sys.stderr.write(f"E2EE unsend failed/timeout: {e}. Trying non-E2EE fallback...\n")

        if not success:
            try:
                from fbchat_v2._messaging._unsend import func as unsend_func
                res = unsend_func(messageID=message_id, dataFB=dataFB)
                # _unsend.func trả về Exception({"error":...}) thay vì raise → cần kiểm tra
                if isinstance(res, Exception):
                    raise RuntimeError(str(res))
                if (res or {}).get("success"):
                    result = res
                else:
                    raise RuntimeError((res or {}).get("payload", {}).get("error-decription", "Native unsend failed"))
            except Exception as exc:
                result = {
                    "error": 1,
                    "payload": {
                        "error-decription": str(exc),
                        "error-code": "unsend_failed",
                    }
                }
    elif action == "send_group":
        from fbchat_v2 import sendingE2EEEvent
        with sendingE2EEEvent(dataFB=dataFB, binary_path=binary_path, device_path=device_path, e2ee_memory_only=False, enable_e2ee=False) as e2ee_sender:
            try:
                data = e2ee_sender.bridge.call("sendMessage", {"threadId": int(target), "text": text})
                result = {
                    "success": 1,
                    "payload": {
                        "messageID": data.get("messageId") or data.get("id"),
                        "timestamp": data.get("timestampMs") or data.get("timestamp") or 0,
                    }
                }
            except Exception as exc:
                result = {
                    "error": 1,
                    "payload": {
                        "error-decription": str(exc),
                        "error-code": "bridge_error",
                    }
                }
    else:
        raise RuntimeError(f"Unknown action: {action}")

    if result.get("success"):
        msg_id = result.get("payload", {}).get("messageID", "")
        if not msg_id and action in {"react", "unsend"}:
            msg_id = message_id
        timestamp = result.get("payload", {}).get("timestamp", 0)
        print(
            json.dumps(
                {
                    "ok": True,
                    "target": target,
                    "msg_id": msg_id,
                    "cli_msg_id": f"fb_{msg_id[:12]}" if msg_id else "",
                    "msg_type": action,
                    "timestamp": timestamp,
                },
                ensure_ascii=False,
            )
        )
    else:
        error = result.get("payload", {}).get("error-decription", "Action failed")
        print(json.dumps({"ok": False, "error": error}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        sys.exit(1)

