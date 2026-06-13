from __future__ import annotations

import requests

from facebook._utils import parse_cookie_string, dataSplit


def dataGetHome(setCookies: str) -> dict:
    mainRequests = {
        "headers": {
            "authority": "www.facebook.com",
            "method": "GET",
            "path": "/",
            "scheme": "https",
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
            "cache-control": "max-age=0",
            "cookie": setCookies,
            "dpr": "1.25",
            "priority": "u=0, i",
            "sec-ch-prefers-color-scheme": "dark",
            "sec-ch-ua": '"Chromium";v="134", "Not=A?Brand";v="24", "Google Chrome";v="134"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "same-origin",
            "sec-fetch-user": "?1",
            "upgrade-insecure-requests": "1",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
            "viewport-width": "493",
        },
        "timeout": 60000,
        "url": "https://www.facebook.com/",
        "cookies": parse_cookie_string(setCookies),
        "verify": True,
    }

    dictValueSaved: dict[str, str] = {}
    splitDataList = [
        ["fb_dtsg", "DTSGInitialData\",[],{\"token\":\"", "\""],
        ["fb_dtsg_ag", "async_get_token\":\"", "\""],
        ["jazoest", "jazoest=", "\""],
        ["hash", "hash\":\"", "\""],
        ["sessionID", "sessionId\":\"", "\""],
        ["FacebookID", "\"actorID\":\"", "\""],
        ["clientRevision", "client_revision\":", ","],
    ]

    sendRequests = requests.get(**mainRequests)
    html = sendRequests.text

    for nameValue, startStr, endStr in splitDataList:
        try:
            exportValue = dataSplit(html, startStr, endStr)
        except (IndexError, AttributeError, TypeError):
            exportValue = ""
        dictValueSaved[nameValue] = str(exportValue)

    dictValueSaved["cookieFacebook"] = setCookies
    return dictValueSaved


def validate_cookie(cookie: str) -> tuple[bool, str, dict]:
    """Validate a Facebook cookie by attempting to fetch homepage data.

    Returns (is_valid, error_message, data).
    """
    try:
        data = dataGetHome(cookie)
        if not data.get("FacebookID") or not data.get("fb_dtsg"):
            return False, "Cookie không hợp lệ hoặc đã hết hạn", {}
        return True, "", data
    except requests.RequestException as exc:
        return False, f"Lỗi kết nối Facebook: {exc}", {}
    except Exception as exc:
        return False, f"Lỗi xác thực Facebook: {exc}", {}
