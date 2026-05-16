"""Utility tools ported from JS: time, calculate, translate, uuid, hash, etc."""

import hashlib
import json
import math
import random
import re
import base64 as b64
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, Any
from urllib.parse import quote, unquote

import aiohttp

from .registry import registry


async def _handle_get_time(args, **kwargs):
    tz = timezone(timedelta(hours=7))
    now = datetime.now(tz)
    days = ["Thu Hai", "Thu Ba", "Thu Tu", "Thu Nam", "Thu Sau", "Thu Bay", "Chu Nhat"]
    return (
        f"Thoi gian hien tai (Ha Noi): {now.strftime('%H:%M:%S %d/%m/%Y')}\n"
        f"Thu: {days[now.weekday()]}\n"
        f"Timestamp: {int(now.timestamp() * 1000)}\n"
        f"Mui gio: Asia/Ho_Chi_Minh (UTC+7)"
    )


def _handle_calculate(args, **kwargs):
    expr = args.get("expression", "")
    s = re.sub(r"\s+", "", expr)
    if not re.match(r"^[\d+\-*/().,%^]+$", s):
        return "Chi ho tro bieu thuc toan hoc co ban (+, -, *, /, %, ^, ())."
    try:
        allowed = {"__builtins__": {}}
        allowed.update({k: getattr(math, k) for k in dir(math) if not k.startswith("_")})
        return f"Ket qua: {eval(s.replace('^', '**'), allowed)}"
    except Exception:
        return "Bieu thuc khong hop le."


LANG_MAP = {"vi": "vi", "en": "en", "zh": "zh", "ja": "ja", "ko": "ko",
            "fr": "fr", "de": "de", "es": "es", "ru": "ru", "th": "th"}

async def _handle_translate(args, **kwargs):
    text = args.get("text", "")
    to_lang = args.get("target_lang", "en")
    target = LANG_MAP.get(to_lang.lower())
    if not target:
        return f"Ngon ngu khong ho tro: {to_lang}. Ho tro: {', '.join(LANG_MAP)}"
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(f"https://lingva.ml/api/v1/auto/{target}/{quote(text)}",
                             timeout=aiohttp.ClientTimeout(total=10)) as r:
                if r.status != 200:
                    return "Khong the dich."
                data = await r.json()
                return f"Ban dich ({to_lang.upper()}): {data.get('translation', '')}"
    except Exception:
        return "Khong the dich van ban."


async def _handle_get_definition(args, **kwargs):
    word = args.get("term", "")
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(f"https://api.dictionaryapi.dev/api/v2/entries/en/{quote(word)}",
                             timeout=aiohttp.ClientTimeout(total=8)) as r:
                if r.status != 200:
                    return f'Khong tim thay tu "{word}".'
                data = (await r.json())[0]
                phon = ""
                for p in data.get("phonetics") or []:
                    if p.get("text"):
                        phon = f"Phien am: {p['text']}"
                        break
                meanings = []
                for m in data.get("meanings") or []:
                    defs = [d["definition"] for d in (m.get("definitions") or [])[:2]]
                    meanings.append(f"**{m['partOfSpeech']}**: {'; '.join(defs)}")
                return "\n".join(p for p in [phon, "\n".join(meanings)] if p)
    except Exception:
        return "Khong the tra tu dien."


async def _handle_get_ip_info(args, **kwargs):
    ip = args.get("ip", "")
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(f"http://ip-api.com/json/{quote(ip) if ip else ''}",
                             timeout=aiohttp.ClientTimeout(total=8)) as r:
                if r.status != 200:
                    return "Khong the tra cuu IP."
                d = await r.json()
                if d.get("status") == "fail":
                    return f"Khong tim thay thong tin{(' cho IP: ' + ip) if ip else ''}."
                parts = [
                    f'Thong tin{(" IP " + ip) if ip else " IP cua ban"}:',
                    f'- IP: {d.get("query", "")}',
                    f'- Vi tri: {d.get("city", "")}, {d.get("regionName", "")}, {d.get("country", "")}',
                    f'- ISP: {d.get("isp", "")}',
                    f'- Toa do: {d.get("lat", "")}, {d.get("lon", "")}',
                ]
                if d.get("org"):
                    parts.append(f'- To chuc: {d["org"]}')
                return "\n".join(parts)
    except Exception:
        return "Khong the tra cuu IP."


def _handle_generate_uuid(args, **kwargs):
    count = min(int(args.get("count", 1)), 10)
    return "\n".join(str(uuid.uuid4()) for _ in range(count))


def _handle_hash_text(args, **kwargs):
    text = args.get("text", "")
    algo = args.get("algorithm", "sha256").lower()
    m = {"sha256": hashlib.sha256, "sha1": hashlib.sha1, "sha512": hashlib.sha512, "md5": hashlib.md5}.get(algo)
    if not m:
        return "Ho tro: sha256, sha1, sha512, md5"
    return f"{algo.upper()}: {m(text.encode()).hexdigest()}"


def _handle_format_json(args, **kwargs):
    raw = args.get("json", "")
    action = args.get("action", "format")
    try:
        parsed = json.loads(raw)
        if action == "minify":
            return json.dumps(parsed, ensure_ascii=False)
        if action == "validate":
            return "JSON hop le."
        return json.dumps(parsed, ensure_ascii=False, indent=2)
    except json.JSONDecodeError as e:
        return f"JSON khong hop le: {e}"


def _handle_unit_convert(args, **kwargs):
    value = float(args.get("value", 0))
    from_u = args.get("from", "").lower()
    to_u = args.get("to", "").lower()
    ctype = args.get("type", "length").lower()
    convs = {
        "length": {"m": 1, "km": 0.001, "cm": 100, "mm": 1000,
                    "mile": 0.000621371, "yard": 1.09361, "foot": 3.28084, "inch": 39.3701},
        "weight": {"kg": 1, "g": 1000, "mg": 1e6, "lb": 2.20462, "oz": 35.274, "ton": 0.001},
        "area": {"m2": 1, "km2": 1e-6, "ha": 1e-4, "acre": 0.000247105, "ft2": 10.7639},
        "volume": {"l": 1, "ml": 1000, "m3": 0.001, "gal": 0.264172, "qt": 1.05669, "cup": 4.22675},
    }
    if ctype == "temp":
        f, t = from_u, to_u
        c = value if f == "c" else (value - 32) * 5 / 9 if f == "f" else value - 273.15 if f == "k" else None
        if c is None:
            return "Ho tro: C, F, K"
        r = c if t == "c" else c * 9 / 5 + 32 if t == "f" else c + 273.15 if t == "k" else None
        if r is None:
            return "Ho tro: C, F, K"
        return f"{value}°{f.upper()} = {r:.2f}°{t.upper()}"
    units = convs.get(ctype)
    if not units:
        return f"Ho tro: {', '.join(convs)}"
    if from_u not in units or to_u not in units:
        return "Don vi khong hop le."
    return f"{value} {from_u} = {value / units[from_u] * units[to_u]:.6f} {to_u}"


def _handle_random_number(args, **kwargs):
    mn, mx, cnt = int(args.get("min", 0)), int(args.get("max", 100)), min(int(args.get("count", 1)), 20)
    nums = [random.randint(mn, mx) for _ in range(cnt)]
    return str(nums[0]) if len(nums) == 1 else f"So ngau nhien: {', '.join(map(str, nums))}"


def _handle_encode_decode(args, **kwargs):
    text, action, enc = args.get("text", ""), args.get("action", "encode"), args.get("encoding", "base64").lower()
    if enc == "base64":
        return b64.b64encode(text.encode()).decode() if action == "encode" else b64.b64decode(text).decode("utf-8", errors="replace")
    if enc == "url":
        return quote(text) if action == "encode" else unquote(text)
    return "Ho tro: base64, url. Action: encode, decode."


def _handle_password_generate(args, **kwargs):
    length = min(max(int(args.get("length", 16)), 8), 64)
    sym = args.get("include_symbols", True)
    uc, lc, dg, sy = "ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghjkmnpqrstuvwxyz", "23456789", "!@#$%&*+-="
    all_chars = uc + lc + dg + (sy if sym else "")
    pwd = random.choice(uc) + random.choice(lc) + random.choice(dg) + (random.choice(sy) if sym else "")
    pwd += "".join(random.choice(all_chars) for _ in range(length - len(pwd)))
    lst = list(pwd)
    random.shuffle(lst)
    return f"Mat khau: {''.join(lst)}"


REGISTRATIONS = [
    ("get_time", "Lay thoi gian va ngay hien tai (mui gio Viet Nam).", {}, [], _handle_get_time, True),
    ("calculate", "Tinh toan bieu thuc toan hoc co ban (+, -, *, /, %, ^, ()).", {"expression": {"type": "string", "description": "VD: 2+2*3"}}, ["expression"], _handle_calculate, False),
    ("translate", "Dich van ban sang ngon ngu khac.", {"text": {"type": "string"}, "target_lang": {"type": "string"}}, ["text"], _handle_translate, True),
    ("get_definition", "Tra cuu dinh nghia tu tieng Anh.", {"term": {"type": "string"}}, ["term"], _handle_get_definition, True),
    ("get_ip_info", "Tra cuu thong tin dia chi IP.", {"ip": {"type": "string"}}, [], _handle_get_ip_info, True),
    ("generate_uuid", "Tao UUID ngau nhien (phien ban 4).", {"count": {"type": "integer"}}, [], _handle_generate_uuid, False),
    ("hash_text", "Bam van ban (md5, sha1, sha256, sha512).", {"text": {"type": "string"}, "algorithm": {"type": "string"}}, ["text"], _handle_hash_text, False),
    ("format_json", "Format, minify hoac validate JSON.", {"json": {"type": "string"}, "action": {"type": "string"}}, ["json"], _handle_format_json, False),
    ("unit_convert", "Doi don vi do luong. Types: length, weight, temp, area, volume.", {"value": {"type": "number"}, "from": {"type": "string"}, "to": {"type": "string"}, "type": {"type": "string"}}, ["value", "from", "to"], _handle_unit_convert, False),
    ("random_number", "Sinh so ngau nhien trong khoang.", {"min": {"type": "integer"}, "max": {"type": "integer"}, "count": {"type": "integer"}}, [], _handle_random_number, False),
    ("encode_decode", "Ma hoa/giai ma base64 hoac URL encode/decode.", {"text": {"type": "string"}, "action": {"type": "string"}, "encoding": {"type": "string"}}, ["text", "action"], _handle_encode_decode, False),
    ("password_generate", "Tao mat khau ngau nhien an toan (8-64 ky tu).", {"length": {"type": "integer"}, "include_symbols": {"type": "boolean"}}, [], _handle_password_generate, False),
]

for name, desc, props, required, handler, is_async in REGISTRATIONS:
    registry.register(
        name=name,
        toolset="utils",
        schema={"name": name, "description": desc, "parameters": {"type": "object", "properties": props, "required": required}},
        handler=handler,
        is_async=is_async,
    )
