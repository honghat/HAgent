#!/usr/bin/env python3
import json
import sys

from zlapi import ZaloAPI
from zlapi.models import Message, ThreadType


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


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    cookie = payload.get("cookie", "")
    imei = payload.get("imei", "")
    target = str(payload.get("target", "")).strip()
    text = str(payload.get("text", "")).strip()
    thread_type = str(payload.get("thread_type", "user")).lower()

    if not cookie:
        raise RuntimeError("Missing Zalo cookie")
    if not imei:
        raise RuntimeError("Missing Zalo IMEI. Reconnect Zalo QR to capture IMEI.")
    if not target:
        raise RuntimeError("Missing Zalo target")
    if not text:
        raise RuntimeError("Missing Zalo text")

    bot = ZaloAPI("</>", "</>", imei, parse_cookie(cookie))
    t_type = ThreadType.GROUP if thread_type == "group" else ThreadType.USER
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
