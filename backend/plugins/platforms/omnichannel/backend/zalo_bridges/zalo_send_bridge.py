#!/usr/bin/env python3
import json
import sys

from zlapi import ZaloAPI
from zlapi.models import Message, MessageObject, ThreadType


def parse_cookie(cookie):
    result = {}
    for item in (cookie or "").split(";"):
        if "=" in item:
            key, value = item.strip().split("=", 1)
            if key:
                result[key] = value
    return result


def plain(value):
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        return {str(k): plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [plain(v) for v in value]
    if hasattr(value, "toDict"):
        try:
            return plain(value.toDict())
        except Exception:
            pass
    if hasattr(value, "__dict__"):
        return plain(vars(value))
    return str(value)


def pick(obj, *keys):
    if not isinstance(obj, dict):
        return ""
    for key in keys:
        value = obj.get(key)
        if value not in (None, ""):
            return value
    return ""


def message_object_from_payload(data):
    if not isinstance(data, dict):
        return None
    msg_id = str(pick(data, "msgId", "msg_id", "external_id") or "")
    cli_msg_id = str(pick(data, "cliMsgId", "cli_msg_id", "external_cli_msg_id") or "")
    msg_type = pick(data, "msgType", "msg_type", "external_msg_type") or "webchat"
    if not msg_id or not cli_msg_id:
        return None
    return MessageObject.fromDict({
        "msgId": msg_id,
        "cliMsgId": cli_msg_id,
        "msgType": msg_type,
        "uidFrom": str(pick(data, "uidFrom", "author_id", "external_author_id") or ""),
        "content": str(pick(data, "content", "text") or ""),
        "ts": pick(data, "ts", "created_at", "timestamp") or 0,
    }, None)


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    action = str(payload.get("action", "send")).lower()
    cookie = payload.get("cookie", "")
    imei = payload.get("imei", "")
    target = str(payload.get("target", "")).strip()
    text = str(payload.get("text", "")).strip()
    thread_type = str(payload.get("thread_type", "user")).lower()
    
    # Image/file parameters
    image_path = str(payload.get("image_path", "")).strip()
    image_paths = payload.get("image_paths", [])  # For multiple images
    file_url = str(payload.get("file_url", "")).strip()

    if not cookie:
        raise RuntimeError("Missing Zalo cookie")
    if not imei:
        raise RuntimeError("Missing Zalo IMEI. Reconnect Zalo QR to capture IMEI.")
    if not target:
        raise RuntimeError("Missing Zalo target")
    if action in ("send", "reply") and not text and not image_path and not image_paths and not file_url:
        raise RuntimeError("Missing Zalo text, image, or file")

    bot = ZaloAPI("</>", "</>", imei, parse_cookie(cookie))
    t_type = ThreadType.GROUP if thread_type == "group" else ThreadType.USER
    
    # Prepare message object if text is provided
    msg = Message(text=text) if text else None
    
    if action == "send_image":
        # Send single image
        if not image_path:
            raise RuntimeError("Missing image_path for send_image action")
        result = bot.sendLocalImage(
            image_path, 
            thread_id=target, 
            thread_type=t_type, 
            message=msg
        )
    elif action == "send_images":
        # Send multiple images
        if not image_paths or not isinstance(image_paths, list):
            raise RuntimeError("Missing or invalid image_paths for send_images action")
        result = bot.sendMultiLocalImage(
            image_paths, 
            thread_id=target, 
            thread_type=t_type, 
            message=msg
        )
    elif action == "send_file":
        # Send file from URL
        if not file_url:
            raise RuntimeError("Missing file_url for send_file action")
        result = bot.sendRemoteFile(
            file_url, 
            thread_id=target, 
            thread_type=t_type, 
            message=msg
        )
    elif action == "react":
        reaction = str(payload.get("emoji", "")).strip()
        message_object = message_object_from_payload(payload.get("message") or {})
        if not reaction:
            raise RuntimeError("Missing reaction emoji")
        if not message_object:
            raise RuntimeError("Thiếu metadata Zalo của tin nhắn nên chưa gửi cảm xúc được.")
        result = bot.sendReaction(message_object, reaction, thread_id=target, thread_type=t_type)
    elif action == "undo":
        message_object = message_object_from_payload(payload.get("message") or {})
        if not message_object:
            raise RuntimeError("Thiếu metadata Zalo của tin nhắn nên chưa thu hồi được.")
        result = bot.undoMessage(message_object.msgId, message_object.cliMsgId, thread_id=target, thread_type=t_type)
    else:
        # Default send or reply
        reply_object = message_object_from_payload(payload.get("reply_to") or {})
        if action == "reply" and reply_object:
            result = bot.replyTo(reply_object, Message(text=text), thread_id=target, thread_type=t_type)
        else:
            result = bot.send(Message(text=text), thread_id=target, thread_type=t_type)
    
    data = plain(result)
    print(json.dumps({
        "ok": True,
        "target": target,
        "msg_id": str(pick(data, "msgId", "globalMsgId", "global_msg_id") or ""),
        "cli_msg_id": str(pick(data, "cliMsgId", "clientMsgId", "client_msg_id") or ""),
        "msg_type": str(pick(data, "msgType", "type") or "webchat"),
        "result": data,
    }, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        sys.exit(1)
