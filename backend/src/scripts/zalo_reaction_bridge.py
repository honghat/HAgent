#!/usr/bin/env python3
import json
import sys

from zlapi import ZaloAPI
from zlapi.models import MessageObject, ThreadType


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


def find_message_meta(node, msg_id):
    if isinstance(node, dict):
        node_msg_id = str(node.get("msgId") or node.get("id") or node.get("msg_id") or "")
        if node_msg_id == str(msg_id):
            cli_msg_id = str(node.get("cliMsgId") or node.get("clientMsgId") or node.get("cli_msg_id") or "")
            msg_type = str(node.get("msgType") or node.get("type") or "webchat")
            return {
                "msg_id": node_msg_id,
                "cli_msg_id": cli_msg_id,
                "msg_type": msg_type,
            }
        for value in node.values():
            found = find_message_meta(value, msg_id)
            if found:
                return found
    elif isinstance(node, list):
        for item in node:
            found = find_message_meta(item, msg_id)
            if found:
                return found
    return None


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    cookie = payload.get("cookie", "")
    imei = payload.get("imei", "")
    target = str(payload.get("target", "")).strip()
    msg_id = str(payload.get("msg_id", "")).strip()
    cli_msg_id = str(payload.get("cli_msg_id", "")).strip()
    msg_type = str(payload.get("msg_type", "") or "webchat").strip()
    emoji = str(payload.get("emoji", "")).strip()
    thread_type = str(payload.get("thread_type", "user")).lower()
    reaction_type = int(payload.get("reaction_type") or 75)

    if not cookie:
        raise RuntimeError("Missing Zalo cookie")
    if not imei:
        raise RuntimeError("Missing Zalo IMEI. Reconnect Zalo QR to capture IMEI.")
    if not target:
        raise RuntimeError("Missing Zalo target")
    if not msg_id:
        raise RuntimeError("Missing Zalo msg_id")
    if not emoji:
        raise RuntimeError("Missing reaction emoji")

    bot = ZaloAPI("</>", "</>", imei, parse_cookie(cookie))
    t_type = ThreadType.GROUP if thread_type == "group" else ThreadType.USER

    if not cli_msg_id:
        raw = plain(bot.getRecentGroup(target) if t_type == ThreadType.GROUP else bot.getLastMsgs())
        meta = find_message_meta(raw, msg_id) or {}
        cli_msg_id = meta.get("cli_msg_id", "")
        msg_type = meta.get("msg_type", msg_type or "webchat")

    if not cli_msg_id:
        raise RuntimeError("Không tìm thấy cliMsgId để thả cảm xúc. Hãy sync Zalo rồi thử lại.")

    message = MessageObject(msgId=str(msg_id), cliMsgId=str(cli_msg_id), msgType=msg_type or "webchat")
    result = bot.sendReaction(message, emoji, target, t_type, reaction_type)
    print(json.dumps({
        "ok": True,
        "target": target,
        "msg_id": str(msg_id),
        "cli_msg_id": str(cli_msg_id),
        "msg_type": msg_type or "webchat",
        "emoji": emoji,
        "result": str(result),
    }, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        sys.exit(1)
