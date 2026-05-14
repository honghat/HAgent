#!/usr/bin/env python3
import json
import sys

from zlapi import ZaloAPI


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


def write(payload):
    print(json.dumps(payload, ensure_ascii=False), flush=True)


class HAgentZaloListener(ZaloAPI):
    def onMessage(
        self,
        mid=None,
        author_id=None,
        message=None,
        message_object=None,
        thread_id=None,
        thread_type=None,
    ):
        write({
            "event": "message",
            "mid": str(mid or ""),
            "author_id": str(author_id or ""),
            "content": plain(message),
            "message_object": plain(message_object),
            "thread_id": str(thread_id or ""),
            "thread_type": getattr(thread_type, "name", str(thread_type or "USER")).lower(),
        })

    def onErrorCallBack(self, error):
        write({"event": "error", "error": str(error)})


def run_bot():
    payload = json.loads(sys.stdin.read() or "{}")
    cookie = payload.get("cookie", "")
    imei = payload.get("imei", "")
    if not cookie:
        raise RuntimeError("Missing Zalo cookie")
    if not imei:
        raise RuntimeError("Missing Zalo IMEI")

    bot = HAgentZaloListener("</>", "</>", imei, parse_cookie(cookie))
    own_id = str(getattr(getattr(bot, "_state", None), "user_id", "") or getattr(bot, "uid", "") or "")
    write({"event": "ready", "own_id": own_id})
    bot.listen(type="websocket", run_forever=True, reconnect=5)


def main():
    try:
        run_bot()
    except Exception as exc:
        err_msg = str(exc)
        if "'NoneType' object is not subscriptable" in err_msg:
            err_msg = "Phiên Zalo hết hạn hoặc Cookie/IMEI không hợp lệ. Hãy quét QR lại."
        write({"event": "error", "error": err_msg})
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        write({"event": "error", "error": str(exc)})
        sys.exit(1)
