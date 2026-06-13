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

from fbchat_v2 import dataGetHome as fbDataGetHome


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    action = str(payload.get("action") or "send").lower()
    cookie = str(payload.get("cookie") or "")
    target = str(payload.get("target") or "").strip()
    text = str(payload.get("text") or "").strip()
    user_id = str(payload.get("user_id") or "default").strip()

    thread_type = str(payload.get("thread_type") or "user").lower()

    if not cookie:
        raise RuntimeError("Missing Facebook cookie")
    if not target:
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
        if target == "156025504001094" or thread_type in {"group", "thread"}:
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
                        "replyToId": "",
                        "replyToSenderJid": "",
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
                finally:
                    e2ee_sender.close()
            except Exception as non_e2ee_exc:
                result = {
                    "error": 1,
                    "payload": {
                        "error-decription": f"E2EE failed: {e2ee_exc}. Non-E2EE fallback failed: {non_e2ee_exc}",
                        "error-code": "both_failed",
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
        timestamp = result.get("payload", {}).get("timestamp", 0)
        print(
            json.dumps(
                {
                    "ok": True,
                    "target": target,
                    "msg_id": msg_id,
                    "cli_msg_id": f"fb_{msg_id[:12]}" if msg_id else "",
                    "msg_type": "message",
                    "timestamp": timestamp,
                },
                ensure_ascii=False,
            )
        )
    else:
        error = result.get("payload", {}).get("error-decription", "Send failed")
        print(json.dumps({"ok": False, "error": error}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        sys.exit(1)
