from __future__ import annotations

import json
import random
import re
import string
import time
from mimetypes import guess_type

from attr import ib


_global_req_counter: int = 0


def Headers(dataForm: bytes | None = None, Host: str = "www.facebook.com") -> dict:
    headers: dict[str, str] = {}
    headers["Host"] = Host
    headers["Connection"] = "keep-alive"
    headers["User-Agent"] = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
        " Chrome/140.0.0.0 Safari/537.36"
    )
    headers["Accept"] = "*/*"
    headers["Origin"] = "https://" + Host
    headers["Sec-Fetch-Site"] = "same-origin"
    headers["Sec-Fetch-Mode"] = "cors"
    headers["Sec-Fetch-Dest"] = "empty"
    headers["Referer"] = "https://" + Host
    headers["sec-ch-ua"] = '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"'
    headers["sec-ch-ua-mobile"] = "?0"
    headers["sec-ch-ua-platform"] = '"Windows"'
    headers["Accept-Language"] = "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7"
    return headers


def digitToChar(digit: int) -> str:
    if digit < 10:
        return str(digit)
    return chr(ord("a") + digit - 10)


def str_base(number: int, base: int) -> str:
    if number < 0:
        return "-" + str_base(-number, base)
    d, m = divmod(number, base)
    if d > 0:
        return str_base(d, base) + digitToChar(m)
    return digitToChar(m)


def parse_cookie_string(cookie_string: str) -> dict[str, str]:
    cookie_dict: dict[str, str] = {}
    cookies = cookie_string.split(";")
    for cookie in cookies:
        if "=" in cookie:
            key, value = cookie.split("=", 1)
            cookie_dict[key.strip()] = value.strip()
    return cookie_dict


def dataSplit(
    HTML: str,
    string1: str,
    string2: str,
    numberSplit1: int = 1,
    numberSplit2: int = 0,
) -> str:
    return HTML.split(string1)[numberSplit1].split(string2)[numberSplit2]


def formAll(dataFB: dict, docID: int | None = None, requireGraphql: bool = True) -> dict:
    global _global_req_counter
    _global_req_counter += 1
    dataForm: dict[str, str | int] = {
        "fb_dtsg": dataFB["fb_dtsg"],
        "jazoest": dataFB["jazoest"],
        "__a": 1,
        "__user": str(dataFB["FacebookID"]),
        "__req": str_base(_global_req_counter, 36),
        "__rev": dataFB["clientRevision"],
        "av": dataFB["FacebookID"],
    }
    if requireGraphql:
        dataForm["fb_api_caller_class"] = "RelayModern"
        dataForm["server_timestamps"] = "true"
        if docID is not None:
            dataForm["doc_id"] = str(docID)
    return dataForm


def mainRequests(urlRequests: str, dataForm: dict, setCookies: str) -> dict:
    return {
        "headers": Headers(str(dataForm).encode() if dataForm else None, "www.facebook.com"),
        "timeout": 10,
        "url": urlRequests,
        "data": dataForm,
        "cookies": parse_cookie_string(setCookies),
        "verify": True,
    }


def generate_session_id() -> int:
    return random.randint(1, 2 ** 53)


def generate_client_id() -> str:
    def gen(length: int) -> str:
        return "".join(random.choices(string.ascii_lowercase + string.digits, k=length))
    return f"{gen(8)}-{gen(4)}-{gen(4)}-{gen(4)}-{gen(12)}"


def json_minimal(data) -> str:
    return json.dumps(data, separators=(",", ":"))


def gen_threading_id() -> str:
    return str(
        int(
            format(int(time.time() * 1000), "b")
            + ("0000000000000000000000" + format(int(random.random() * 4294967295), "b"))[-22:],
            2,
        )
    )


def get_files_from_paths(filenames: str):
    files = [filenames, open(filenames, "rb"), guess_type(filenames)[0]]
    yield files
