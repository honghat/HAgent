"""HAgent-managed MITM proxy for capturing TTV iPad/iPhone app API traffic."""
from __future__ import annotations

import json
import os
import re
import shutil
import signal
import socket
import subprocess
import time
import unicodedata
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl

import psutil
import requests
from bs4 import BeautifulSoup

from api.services.db import DATA_DIR, get_connection
from api.services.ttv_api_capture import analyze_capture_records

PROXY_DIR = DATA_DIR / "ttv_hagent_proxy"
CONF_DIR = PROXY_DIR / "mitmproxy"
ADDON_PATH = PROXY_DIR / "ttv_capture_addon.py"
CAPTURE_PATH = PROXY_DIR / "ttv_capture.jsonl"
LOG_PATH = PROXY_DIR / "mitmdump.log"
PID_PATH = PROXY_DIR / "mitmdump.pid"
DEFAULT_PORT = 8899
MAX_STRING_CHARS = 500_000

ADDON_CODE = r'''
import json
import re
import time
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit, urlunsplit

CAPTURE_PATH = Path(__import__("os").environ["HAGENT_TTV_PROXY_CAPTURE_PATH"])
CAPTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
SENSITIVE_QUERY_KEYS = {
    "access_token", "api_key", "apikey", "auth", "authorization", "bearer",
    "code", "hash", "jwt", "key", "password", "refresh_token", "secret",
    "session", "sid", "sign", "signature", "token",
}
SENSITIVE_BODY_RE = re.compile(
    r"(access[_-]?token|api[_-]?key|auth|authorization|bearer|cookie|email|"
    r"hash|jwt|key|password|phone|refresh[_-]?token|secret|session|sid|"
    r"sign|signature|token)",
    re.IGNORECASE,
)
SENSITIVE_HEADER_RE = re.compile(
    r"(authorization|bearer|cookie|jwt|password|refresh[_-]?token|secret|"
    r"session|token)",
    re.IGNORECASE,
)
MAX_JSON_BODY_BYTES = 2_000_000
MAX_STRING_CHARS = 500_000
MAX_LIST_ITEMS = 2000

def sanitize_url(url):
    try:
        parsed = urlsplit(url)
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    host = parsed.hostname.lower()
    port = f":{parsed.port}" if parsed.port else ""
    netloc = f"{host}{port}"
    pairs = parse_qsl(parsed.query, keep_blank_values=True)
    query_keys = sorted({k for k, _ in pairs if k.lower() not in SENSITIVE_QUERY_KEYS})
    # Giữ lại giá trị query KHÔNG nhạy cảm (type, page, offset...) để dò cấu hình API.
    query_values = {k: v for k, v in pairs if k.lower() not in SENSITIVE_QUERY_KEYS}
    query = "&".join(f"{key}=..." for key in query_keys)
    safe = urlunsplit((parsed.scheme, netloc, parsed.path or "/", query, ""))
    return {
        "url": safe,
        "host": host,
        "path": parsed.path or "/",
        "query_keys": query_keys,
        "query": query_values,
    }

def json_key_paths(value, limit=80):
    keys = []
    def walk(item, prefix=""):
        if len(keys) >= limit:
            return
        if isinstance(item, dict):
            for key, child in item.items():
                if not isinstance(key, str):
                    continue
                name = f"{prefix}.{key}" if prefix else key
                keys.append(name)
                walk(child, name)
                if len(keys) >= limit:
                    return
        elif isinstance(item, list) and item:
            walk(item[0], f"{prefix}[]" if prefix else "[]")
    walk(value)
    return keys[:limit]

def parse_embedded_payload(value):
    if not isinstance(value, str):
        return value
    text = value.strip()
    if not text or len(text) > MAX_STRING_CHARS:
        return value
    if text[0] in "[{":
        try:
            return json.loads(text)
        except Exception:
            return value
    return value

def sanitize_json(value, key="", depth=0):
    if depth > 24:
        return None
    if key and SENSITIVE_BODY_RE.search(str(key)):
        return "[redacted]"
    if isinstance(value, dict):
        return {
            str(child_key): sanitize_json(child_value, child_key, depth + 1)
            for child_key, child_value in value.items()
            if isinstance(child_key, str)
        }
    if isinstance(value, list):
        return [sanitize_json(item, key, depth + 1) for item in value[:MAX_LIST_ITEMS]]
    if isinstance(value, str):
        if len(value) > MAX_STRING_CHARS:
            return value[:MAX_STRING_CHARS] + "\n...[truncated]"
        parsed = parse_embedded_payload(value)
        if parsed is not value:
            return sanitize_json(parsed, key, depth + 1)
        return value
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return str(value)

def request_payload(flow):
    content_type = flow.request.headers.get("content-type", "")
    try:
        raw_text = flow.request.get_text(strict=False)
    except Exception:
        return None
    if not raw_text or len(raw_text.encode("utf-8", errors="ignore")) > MAX_JSON_BODY_BYTES:
        return None
    try:
        if "json" in content_type.lower():
            return sanitize_json(json.loads(raw_text))
        if "x-www-form-urlencoded" in content_type.lower():
            return sanitize_json(dict(parse_qsl(raw_text, keep_blank_values=True)))
    except Exception:
        return None
    return None

def sanitize_headers(headers):
    result = {}
    for key, value in headers.items():
        normalized = str(key or "").lower()
        if normalized in {"content-length", "host"}:
            continue
        if SENSITIVE_HEADER_RE.search(normalized):
            continue
        text = str(value or "")
        if len(text) > 400:
            text = text[:400] + "...[truncated]"
        result[normalized] = text
    return result

def response(flow):
    safe = sanitize_url(flow.request.pretty_url)
    if not safe:
        return
    content_type = flow.response.headers.get("content-type", "") if flow.response else ""
    body_keys = []
    body_json = None
    if "json" in content_type.lower():
        try:
            raw_text = flow.response.get_text(strict=False)
            if len(raw_text.encode("utf-8", errors="ignore")) <= MAX_JSON_BODY_BYTES:
                parsed = json.loads(raw_text)
                body_keys = json_key_paths(parsed)
                body_json = sanitize_json(parsed)
        except Exception:
            body_keys = []
    record = {
        **safe,
        "ts": time.time(),
        "method": flow.request.method,
        "status": flow.response.status_code if flow.response else 0,
        "mime_type": content_type,
        "body_keys": body_keys,
        "request_headers": sanitize_headers(flow.request.headers),
    }
    request_json = request_payload(flow)
    if request_json is not None:
        record["request_json"] = request_json
    if body_json is not None:
        record["body_json"] = body_json
    with CAPTURE_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")
'''


def _find_mitmdump() -> str | None:
    for candidate in (
        shutil.which("mitmdump"),
        "/opt/homebrew/bin/mitmdump",
        "/usr/local/bin/mitmdump",
    ):
        if candidate and Path(candidate).exists():
            return candidate
    return None


def _lan_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def _read_pid() -> int | None:
    try:
        pid = int(PID_PATH.read_text(encoding="utf-8").strip())
    except Exception:
        return None
    if pid <= 0:
        return None
    return pid


def _running_process() -> psutil.Process | None:
    pid = _read_pid()
    if not pid:
        return None
    try:
        process = psutil.Process(pid)
    except psutil.Error:
        return None
    if process.is_running() and "mitm" in " ".join(process.cmdline()).lower():
        return process
    return None


def _capture_count() -> int:
    if not CAPTURE_PATH.exists():
        return 0
    try:
        with CAPTURE_PATH.open("r", encoding="utf-8") as handle:
            return sum(1 for _ in handle)
    except OSError:
        return 0


def _read_records(limit: int = 1000) -> list[dict[str, Any]]:
    if not CAPTURE_PATH.exists():
        return []
    records: list[dict[str, Any]] = []
    with CAPTURE_PATH.open("r", encoding="utf-8") as handle:
        for line in handle:
            if len(records) >= limit:
                break
            try:
                value = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(value, dict):
                records.append(value)
    return records


def detect_genre_type(save: bool = True) -> dict[str, Any]:
    """Dò giá trị `type` (thể loại) mới nhất từ capture get_list_story_type và lưu config."""
    found = ""
    for record in _read_records(limit=5000):
        if "get_list_story_type" not in str(record.get("path") or ""):
            continue
        value = (record.get("query") or {}).get("type")
        if value:
            found = str(value)  # giữ giá trị mới nhất (records đọc theo thứ tự file)
    if found and save:
        from api.services.tangthuvien_api import save_ttv_config
        save_ttv_config({"genre_type": found})
    return {"genre_type": found}


_TTV_HINT_RE = re.compile(r"(tangthuvien|ttv|truyen|book|novel|chapter|chuong)", re.IGNORECASE)
_STORY_ID_KEYS = {
    "id_story",
    "idstory",
    "bookid",
    "book_id",
    "comicid",
    "comic_id",
    "mangaid",
    "manga_id",
    "novelid",
    "novel_id",
    "storyid",
    "story_id",
    "truyenid",
    "truyen_id",
}
_STORY_TITLE_KEYS = {
    "name",
    "title",
    "bookname",
    "book_name",
    "booktitle",
    "book_title",
    "comicname",
    "comic_name",
    "manganame",
    "manga_name",
    "novelname",
    "novel_name",
    "storyname",
    "story_name",
    "storytitle",
    "story_title",
    "tentruyen",
    "ten_truyen",
    "truyenname",
    "truyen_name",
}
_STORY_COUNT_KEYS = {"chapter_count", "chaptercount", "count_chapter", "countchapter"}
_CHAPTER_ID_KEYS = {
    "chapterid",
    "chapter_id",
    "chuongid",
    "chuong_id",
    "idchapter",
    "id_chapter",
}
_CHAPTER_TITLE_KEYS = {
    "content_title_of_chapter",
    "contenttitleofchapter",
    "name_id_chapter",
    "nameidchapter",
    "chaptername",
    "chapter_name",
    "chaptertitle",
    "chapter_title",
    "chuongname",
    "chuong_name",
    "titlechapter",
    "title_chapter",
}
_CHAPTER_NUMBER_KEYS = {
    "chapter",
    "chapternumber",
    "chapter_number",
    "chuong",
    "chuong_so",
    "index",
    "no",
    "number",
    "order",
    "sort",
    "stt",
}
_CONTENT_KEYS = {
    "body",
    "chaptercontent",
    "chapter_content",
    "chaptertext",
    "chapter_text",
    "content",
    "html",
    "txt",
}
_AUTHOR_KEYS = {"author", "authorname", "author_name", "tacgia", "tac_gia"}
_DESCRIPTION_KEYS = {"description", "desc", "gioithieu", "gioi_thieu", "intro", "introduce", "summary", "synopsis"}
_COVER_KEYS = {"avatar", "bookcover", "book_cover", "cover", "coverurl", "cover_url", "image", "imageurl", "image_url", "poster", "thumbnail"}
_STATUS_KEYS = {"status", "trangthai", "trang_thai"}


def _norm_key(key: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(key or "").lower())


def _clean_text(value: Any) -> str:
    if value is None or isinstance(value, (dict, list)):
        return ""
    text = str(value)
    if not text or text == "[redacted]":
        return ""
    if "<" in text and ">" in text:
        text = BeautifulSoup(text, "lxml").get_text(" ", strip=True)
    text = unicodedata.normalize("NFC", text)
    return re.sub(r"\s+", " ", text).strip()


def _clean_content(value: Any) -> str:
    if value is None or isinstance(value, (dict, list)):
        return ""
    text = str(value)
    if not text or text == "[redacted]":
        return ""
    if "<" in text and ">" in text:
        soup = BeautifulSoup(text, "lxml")
        for unwanted in soup.select("script, style, nav, header, footer, .ads, .ad, .advertisement"):
            unwanted.decompose()
        for br in soup.find_all("br"):
            br.replace_with("\n")
        for block in soup.find_all(["p", "div", "li"]):
            block.append("\n")
        text = soup.get_text("\n", strip=True)
    text = text.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\r\n", "\n")
    text = unicodedata.normalize("NFC", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _match_key(key: Any, candidates: set[str]) -> bool:
    normalized = _norm_key(key)
    return normalized in {_norm_key(item) for item in candidates}


def _first_value(item: dict[str, Any], keys: set[str]) -> Any:
    for key, value in item.items():
        if _match_key(key, keys):
            return value
    return None


def _first_text(item: dict[str, Any], keys: set[str]) -> str:
    return _clean_text(_first_value(item, keys))


def _first_id(item: dict[str, Any], keys: set[str]) -> str:
    value = _first_value(item, keys)
    if value in (None, "", "[redacted]") or isinstance(value, (dict, list)):
        return ""
    return str(value).strip()


def _first_int(item: dict[str, Any], keys: set[str]) -> int:
    value = _first_value(item, keys)
    if value is None:
        return 0
    match = re.search(r"\d+", str(value))
    return int(match.group(0)) if match else 0


def _first_text_preferred(item: dict[str, Any], keys: list[str]) -> str:
    for wanted in keys:
        wanted_key = _norm_key(wanted)
        for key, value in item.items():
            if _norm_key(key) == wanted_key:
                text = _clean_text(value)
                if text:
                    return text
    return ""


def _number_from_text(value: Any) -> int:
    text = _clean_text(value)
    if not text:
        return 0
    match = re.search(r"(?:chương|chuong|chapter|chap)\D{0,12}(\d+)", text, re.IGNORECASE)
    if not match:
        match = re.search(r"\b(\d{1,6})\b", text)
    return int(match.group(1)) if match else 0


def _chapter_number_from_item(item: dict[str, Any]) -> int:
    for key in ("name_id_chapter", "chapter_name", "chapter_title", "title", "name", "url"):
        number = _number_from_text(_first_text_preferred(item, [key]))
        if number:
            return number
    return _first_int(item, _CHAPTER_NUMBER_KEYS)


def _chapter_title_from_item(item: dict[str, Any]) -> str:
    heading = _first_text_preferred(
        item,
        [
            "name_id_chapter",
            "chapter_name",
            "chapter_title",
            "title_chapter",
            "title",
            "name",
        ],
    )
    subtitle = _first_text_preferred(
        item,
        [
            "content_title_of_chapter",
            "contenttitleofchapter",
            "chapter_title",
            "title",
            "name",
        ],
    )
    if heading and subtitle and subtitle.lower() not in heading.lower():
        return f"{heading}: {subtitle}"
    return heading or subtitle


def _parse_embedded_payload(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    text = value.strip()
    if not text or len(text) > MAX_STRING_CHARS:
        return value
    if text[0] in "[{":
        try:
            return json.loads(text)
        except Exception:
            return value
    if "=" in text:
        try:
            parsed = dict(parse_qsl(text, keep_blank_values=True))
        except Exception:
            return value
        return parsed or value
    return value


def _iter_request_dicts(value: Any, depth: int = 0):
    if depth > 8:
        return
    parsed = _parse_embedded_payload(value)
    if parsed is not value:
        yield from _iter_request_dicts(parsed, depth + 1)
        return
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _iter_request_dicts(child, depth + 1)
    elif isinstance(value, list):
        for child in value:
            yield from _iter_request_dicts(child, depth + 1)


def _first_id_deep(value: Any, keys: set[str]) -> str:
    for item in _iter_request_dicts(value):
        found = _first_id(item, keys)
        if found:
            return found
    return ""


def _slug_part(value: str, fallback: str = "capture") -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")
    return slug[:90] or fallback


def _iter_dicts(value: Any):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _iter_dicts(child)
    elif isinstance(value, list):
        for child in value:
            yield from _iter_dicts(child)


def _record_looks_ttv(record: dict[str, Any]) -> bool:
    haystack = " ".join(
        [
            str(record.get("host") or ""),
            str(record.get("path") or ""),
            " ".join(str(key) for key in record.get("body_keys") or []),
        ]
    )
    return bool(_TTV_HINT_RE.search(haystack))


def _extract_story(item: dict[str, Any]) -> dict[str, Any] | None:
    story_id = _first_id(item, _STORY_ID_KEYS) or _first_id(item, {"id"})
    title = _first_text(item, _STORY_TITLE_KEYS)
    if not title:
        has_story_shape = any(
            _first_text(item, keys)
            for keys in (_AUTHOR_KEYS, _DESCRIPTION_KEYS, _COVER_KEYS, _STATUS_KEYS)
        )
        if has_story_shape:
            title = _first_text(item, {"title", "name"})
    if not title:
        return None

    has_story_signal = story_id or any(
        _first_text(item, keys)
        for keys in (_AUTHOR_KEYS, _DESCRIPTION_KEYS, _COVER_KEYS, _STATUS_KEYS)
    )
    if not has_story_signal:
        return None

    key = story_id or title
    # Slug chuẩn theo id_story để khớp với API nae.vn (get_list_story_author).
    slug = f"ttv--{story_id}" if story_id else f"ttv--{_slug_part(title)}"
    cover_url = _first_text(item, _COVER_KEYS)
    if cover_url and not cover_url.startswith(("http://", "https://", "/")):
        cover_url = f"https://nae.vn/ttv/ttv/public/images/story/{cover_url}.jpg"

    return {
        "key": key,
        "slug": slug,
        "story_id": story_id,
        "title": title,
        "author": _first_text(item, _AUTHOR_KEYS),
        "status": _first_text(item, _STATUS_KEYS),
        "description": _first_text(item, _DESCRIPTION_KEYS),
        "cover_url": cover_url,
        "chapter_count": _first_int(item, _STORY_COUNT_KEYS),
    }


def _extract_chapter(item: dict[str, Any], default_chapter_id: str = "") -> dict[str, Any] | None:
    content = _clean_content(_first_value(item, _CONTENT_KEYS))
    number = _chapter_number_from_item(item)
    title = _chapter_title_from_item(item) or _first_text(item, _CHAPTER_TITLE_KEYS)
    raw_chapter_id = _first_id(item, _CHAPTER_ID_KEYS)
    url = _first_text(item, {"url"})
    has_chapter_meta = bool(raw_chapter_id or title or number or url)
    has_content_only_with_request_id = bool(content and default_chapter_id)
    if not (has_chapter_meta or has_content_only_with_request_id):
        return None

    chapter_id = raw_chapter_id or (default_chapter_id if content else "")
    if not chapter_id and has_chapter_meta:
        chapter_id = _first_id(item, {"id"})
    if not title and (raw_chapter_id or number or content):
        title = _first_text(item, {"title", "name"})
    if not number:
        number = _number_from_text(title)
    if not (title or content):
        return None
    if not (chapter_id or number or url or content):
        return None

    slug_seed = chapter_id or url or str(number) or title
    slug = f"chapter-{_slug_part(slug_seed)}"
    if number and not title:
        title = f"Chương {number}"
    return {
        "story_key": _first_id(item, _STORY_ID_KEYS),
        "slug": slug,
        "title": title or "Không có tiêu đề",
        "chapter_number": number,
        "content": content,
    }


def _merge_story(existing: dict[str, Any], new_story: dict[str, Any]) -> dict[str, Any]:
    merged = dict(existing)
    for key, value in new_story.items():
        if key == "chapter_count":
            merged[key] = max(int(merged.get(key) or 0), int(value or 0))
        elif value not in ("", None, [], {}):
            merged[key] = value
        elif key not in merged:
            merged[key] = value
    return merged


def _merge_chapter(existing: dict[str, Any], new_chapter: dict[str, Any]) -> dict[str, Any]:
    if not existing:
        return dict(new_chapter)
    merged = dict(existing)
    title = new_chapter.get("title") or ""
    if title and title != "Không có tiêu đề":
        merged["title"] = title
    elif not merged.get("title"):
        merged["title"] = title

    number = int(new_chapter.get("chapter_number") or 0)
    if number > 0:
        merged["chapter_number"] = number

    content = new_chapter.get("content") or ""
    if content:
        merged["content"] = content

    for key, value in new_chapter.items():
        if key not in merged:
            merged[key] = value
    return merged


def _direct_story_from_body(body: Any) -> dict[str, Any] | None:
    if not isinstance(body, dict):
        return None
    story = body.get("story")
    if isinstance(story, dict):
        return _extract_story(story)
    return None


def _story_from_ttv_detail(story_key: str) -> dict[str, Any] | None:
    story_id = str(story_key or "").strip()
    if not story_id.isdigit():
        return None
    try:
        from api.services.tangthuvien_api import TangThuVienAppApi

        api = TangThuVienAppApi(timeout=15)
        try:
            detail = api.fetch_story_detail(story_id)
        finally:
            api.close()
    except Exception:
        return None
    if not detail:
        return None
    return {
        "key": story_id,
        "slug": detail.slug,
        "story_id": story_id,
        "title": detail.title,
        "author": detail.author,
        "status": detail.status,
        "description": detail.description,
        "cover_url": detail.cover_url,
        "chapter_count": detail.chapter_count,
    }


def _stub_story_for_chapters(story_key: str, chapter_count: int = 0) -> dict[str, Any]:
    value = str(story_key or "").strip() or "ipad-captured"
    story_id = value if value.isdigit() else ""
    return {
        "key": value,
        "slug": f"ttv--{story_id}" if story_id else f"ttv--{_slug_part(value)}",
        "story_id": story_id,
        "title": f"TTV {story_id}" if story_id else "TTV App Capture",
        "author": "",
        "status": "",
        "description": "Nội dung được capture từ app TTV trên iPad.",
        "cover_url": "",
        "chapter_count": chapter_count,
    }


def _request_story_key(record: dict[str, Any]) -> str:
    request_json = record.get("request_json")
    if not isinstance(request_json, dict):
        return ""
    return _first_id_deep(request_json, _STORY_ID_KEYS | {"story", "storyid", "story_id", "id"})


def _request_chapter_id(record: dict[str, Any]) -> str:
    request_json = record.get("request_json")
    if not isinstance(request_json, dict):
        return ""
    return _first_id_deep(request_json, _CHAPTER_ID_KEYS)


def _migrate_legacy_ttv_slugs(conn, stories: dict[str, dict[str, Any]]) -> int:
    """Gộp slug cũ `ttv--ipad-*` sang `ttv--{id}` (giữ nguyên chương). Không mất nội dung."""
    title_to_id: dict[str, str] = {}
    for story in stories.values():
        sid = str(story.get("story_id") or "")
        if sid.isdigit():
            title_to_id[_clean_text(story.get("title", "")).lower()] = sid

    now = int(time.time())
    legacy = conn.execute(
        "SELECT slug, title, version_id FROM stories WHERE slug LIKE 'ttv--ipad-%'"
    ).fetchall()
    migrated = 0
    for row in legacy:
        old = row["slug"]
        sid = str(row["version_id"] or "")
        if not sid.isdigit():
            match = re.search(r"-(\d+)$", old)
            sid = (match.group(1) if match else "") or title_to_id.get(_clean_text(row["title"]).lower(), "")
        if not str(sid).isdigit():
            continue
        new = f"ttv--{sid}"
        if new == old:
            continue
        conn.execute(
            """INSERT OR IGNORE INTO stories
               (slug, title, author, translator_group, status, genres, description,
                cover_url, chapter_count, source, version_id, created_at, updated_at)
               SELECT ?, title, author, translator_group, status, genres, description,
                      cover_url, chapter_count, 'ttv', ?, created_at, ?
               FROM stories WHERE slug=?""",
            (new, int(sid), now, old),
        )
        conn.execute("UPDATE OR IGNORE story_chapters SET story_slug=? WHERE story_slug=?", (new, old))
        conn.execute("DELETE FROM story_chapters WHERE story_slug=?", (old,))
        conn.execute("DELETE FROM stories WHERE slug=?", (old,))
        migrated += 1
    return migrated


def _chapter_id_from_slug(slug: str) -> str:
    match = re.search(r"(\d+)$", str(slug or "").strip())
    return match.group(1) if match else ""


def fetch_missing_chapter_contents(
    story_slugs: list[str] | None = None,
    limit: int = 1000,
) -> dict[str, Any]:
    """Tải nội dung các chương TTV đã có id_chapter nhưng còn trống content."""
    limit = max(0, min(int(limit or 0), 5000))
    if limit <= 0:
        return {"api_attempted": 0, "api_contents": 0, "api_failed": 0, "api_skipped": 0}

    where = [
        "s.source='ttv'",
        "s.version_id IS NOT NULL",
        "sc.slug LIKE 'chapter-%'",
        "(sc.content IS NULL OR sc.content='')",
    ]
    params: list[Any] = []
    if story_slugs:
        clean_slugs = [slug for slug in story_slugs if slug]
        if clean_slugs:
            where.append(f"sc.story_slug IN ({','.join('?' for _ in clean_slugs)})")
            params.extend(clean_slugs)

    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT sc.story_slug, sc.slug, sc.title, sc.chapter_number, s.version_id "
            "FROM story_chapters sc "
            "JOIN stories s ON s.slug=sc.story_slug "
            f"WHERE {' AND '.join(where)} "
            "ORDER BY sc.story_slug ASC, sc.chapter_number ASC, sc.slug ASC "
            "LIMIT ?",
            [*params, limit],
        ).fetchall()
    finally:
        conn.close()

    if not rows:
        return {"api_attempted": 0, "api_contents": 0, "api_failed": 0, "api_skipped": 0}

    from api.services.tangthuvien_api import TangThuVienAppApi

    api = TangThuVienAppApi()
    conn = get_connection()
    attempted = 0
    fetched = 0
    failed = 0
    skipped = 0
    last_error = ""
    now = int(time.time())
    try:
        for row in rows:
            story_id = str(row["version_id"] or "").strip()
            chapter_id = _chapter_id_from_slug(row["slug"])
            if not story_id or not chapter_id:
                skipped += 1
                continue
            attempted += 1
            try:
                content = api.fetch_chapter_content_by_id(
                    story_id,
                    chapter_id,
                    title=row["title"] or "",
                )
            except Exception as exc:
                failed += 1
                last_error = str(exc)
                continue
            if not content or not content.content:
                failed += 1
                continue
            conn.execute(
                "UPDATE story_chapters SET content=?, updated_time=? WHERE story_slug=? AND slug=?",
                (content.content, str(now), row["story_slug"], row["slug"]),
            )
            fetched += 1
            if fetched % 20 == 0:
                conn.commit()
        conn.commit()
    finally:
        conn.close()
        api.close()

    result: dict[str, Any] = {
        "api_attempted": attempted,
        "api_contents": fetched,
        "api_failed": failed,
        "api_skipped": skipped,
    }
    if last_error:
        result["api_last_error"] = last_error
    return result


def import_captured_stories(
    limit: int = 5000,
    fetch_missing_content: bool = False,
    content_limit: int = 1000,
) -> dict[str, Any]:
    """Nhập truyện/chương từ JSON response đã capture qua iPad proxy."""
    records = _read_records(limit=limit)
    stories: dict[str, dict[str, Any]] = {}
    chapters_by_story: dict[str, dict[str, dict[str, Any]]] = {}
    fallback_key = "ttv-ipad-captured"
    active_story_key = ""

    for record in records:
        body = record.get("body_json")
        if body is None or not _record_looks_ttv(record):
            continue
        direct_story = _direct_story_from_body(body)
        if direct_story:
            active_story_key = direct_story["key"]
            stories[active_story_key] = _merge_story(stories.get(active_story_key, {}), direct_story)

        record_story_keys: list[str] = []
        for item in _iter_dicts(body):
            story = _extract_story(item)
            if not story:
                continue
            stories[story["key"]] = _merge_story(stories.get(story["key"], {}), story)
            record_story_keys.append(story["key"])

        request_story_key = _request_story_key(record)
        request_chapter_id = _request_chapter_id(record)
        default_story_key = (
            request_story_key
            or (record_story_keys[0] if len(record_story_keys) == 1 else "")
            or active_story_key
            or fallback_key
        )
        for item in _iter_dicts(body):
            chapter = _extract_chapter(item, default_chapter_id=request_chapter_id)
            if not chapter:
                continue
            story_key = chapter.pop("story_key") or default_story_key
            story_chapters = chapters_by_story.setdefault(story_key, {})
            story_chapters[chapter["slug"]] = _merge_chapter(
                story_chapters.get(chapter["slug"], {}),
                chapter,
            )

    for story_key, story_chapters in list(chapters_by_story.items()):
        if story_key in stories:
            continue
        stories[story_key] = (
            _story_from_ttv_detail(story_key)
            or _stub_story_for_chapters(story_key, chapter_count=len(story_chapters))
        )

    if fallback_key in chapters_by_story and fallback_key not in stories:
        stories[fallback_key] = {
            "key": fallback_key,
            "slug": "ttv--ipad-captured",
            "title": "TTV App Capture",
            "author": "",
            "status": "",
            "description": "Nội dung được capture từ app TTV trên iPad.",
            "cover_url": "",
            "chapter_count": 0,
        }

    now = int(time.time())
    imported_stories = 0
    imported_chapters = 0
    imported_chapter_metadata = 0
    imported_chapter_contents = 0
    conn = get_connection()
    try:
        _migrate_legacy_ttv_slugs(conn, stories)
        for story_key, story in stories.items():
            chapters = list(chapters_by_story.get(story_key, {}).values())
            chapter_count = max(int(story.get("chapter_count") or 0), len(chapters))
            version_id = int(story["story_id"]) if str(story.get("story_id") or "").isdigit() else None
            conn.execute(
                """INSERT INTO stories
                   (slug, title, author, translator_group, status, genres, description,
                    cover_url, chapter_count, source, version_id, created_at, updated_at)
                   VALUES (?, ?, ?, '', ?, '[]', ?, ?, ?, 'ttv', ?, ?, ?)
                   ON CONFLICT(slug) DO UPDATE SET
                       title=excluded.title,
                       author=CASE WHEN excluded.author <> '' THEN excluded.author ELSE stories.author END,
                       status=CASE WHEN excluded.status <> '' THEN excluded.status ELSE stories.status END,
                       description=CASE WHEN excluded.description <> '' THEN excluded.description ELSE stories.description END,
                       cover_url=CASE WHEN excluded.cover_url <> '' THEN excluded.cover_url ELSE stories.cover_url END,
                       chapter_count=GREATEST(stories.chapter_count, excluded.chapter_count),
                       source='ttv',
                       version_id=COALESCE(excluded.version_id, stories.version_id),
                       updated_at=excluded.updated_at""",
                (
                    story["slug"],
                    story["title"],
                    story.get("author", ""),
                    story.get("status", ""),
                    story.get("description", ""),
                    story.get("cover_url", ""),
                    chapter_count,
                    version_id,
                    now,
                    now,
                ),
            )
            imported_stories += 1

            for chapter in chapters:
                if chapter.get("content"):
                    imported_chapter_contents += 1
                else:
                    imported_chapter_metadata += 1
                conn.execute(
                    """INSERT INTO story_chapters
                       (story_slug, slug, title, chapter_number, content, updated_time, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(story_slug, slug) DO UPDATE SET
                           title=CASE
                               WHEN excluded.title <> '' AND excluded.title <> 'Không có tiêu đề' THEN excluded.title
                               ELSE story_chapters.title
                           END,
                           chapter_number=CASE
                               WHEN excluded.chapter_number > 0 THEN excluded.chapter_number
                               ELSE story_chapters.chapter_number
                           END,
                           content=CASE
                               WHEN excluded.content <> '' THEN excluded.content
                               ELSE story_chapters.content
                           END,
                           updated_time=excluded.updated_time""",
                    (
                        story["slug"],
                        chapter["slug"],
                        chapter["title"],
                        chapter["chapter_number"],
                        chapter["content"],
                        str(now),
                        now,
                    ),
                )
                imported_chapters += 1

            count_row = conn.execute(
                "SELECT COUNT(*) AS cnt FROM story_chapters WHERE story_slug=?",
                (story["slug"],),
            ).fetchone()
            count = int(count_row["cnt"] if count_row else 0)
            final_count = max(int(story.get("chapter_count") or 0), count)
            conn.execute(
                "UPDATE stories SET chapter_count=?, updated_at=? WHERE slug=?",
                (final_count, now, story["slug"]),
            )
        conn.commit()
    finally:
        conn.close()

    api_result: dict[str, Any] = {}
    if fetch_missing_content:
        api_result = fetch_missing_chapter_contents(
            story_slugs=[story["slug"] for story in stories.values() if story.get("slug")],
            limit=content_limit,
        )

    return {
        "ok": True,
        "records": len(records),
        "stories": imported_stories,
        "chapters": imported_chapters,
        "chapter_metadata": imported_chapter_metadata,
        "chapter_contents": imported_chapter_contents,
        "chapter_list_stories": sum(
            1
            for story_chapters in chapters_by_story.values()
            if any(not chapter.get("content") for chapter in story_chapters.values())
        ),
        "capture_count": _capture_count(),
        **api_result,
    }


def clear_imported_ttv_stories(clear_capture_file: bool = False) -> dict[str, Any]:
    """Xoá toàn bộ truyện/chương TTV đã nhập trong DB; tuỳ chọn xoá capture cũ."""
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT slug FROM stories WHERE source='ttv' OR slug LIKE 'ttv--%'"
        ).fetchall()
        story_slugs = [row["slug"] for row in rows]
        story_count = len(story_slugs)

        chapter_count = 0
        if story_slugs:
            placeholders = ",".join("?" for _ in story_slugs)
            chapter_count += conn.execute(
                f"SELECT COUNT(*) AS cnt FROM story_chapters WHERE story_slug IN ({placeholders})",
                story_slugs,
            ).fetchone()["cnt"]
            conn.execute(
                f"DELETE FROM story_chapters WHERE story_slug IN ({placeholders})",
                story_slugs,
            )

        orphan_row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM story_chapters WHERE story_slug LIKE 'ttv--%'"
        ).fetchone()
        orphan_count = int(orphan_row["cnt"] if orphan_row else 0)
        if orphan_count:
            chapter_count += orphan_count
            conn.execute("DELETE FROM story_chapters WHERE story_slug LIKE 'ttv--%'")

        conn.execute("DELETE FROM stories WHERE source='ttv' OR slug LIKE 'ttv--%'")
        conn.commit()
    finally:
        conn.close()

    if clear_capture_file:
        clear_capture()

    return {
        "ok": True,
        "stories_deleted": story_count,
        "chapters_deleted": chapter_count,
        "capture_count": _capture_count(),
    }


def status() -> dict[str, Any]:
    process = _running_process()
    ip = _lan_ip()
    port = _current_port()
    cert_path = CONF_DIR / "mitmproxy-ca-cert.cer"
    return {
        "running": process is not None,
        "pid": process.pid if process else None,
        "port": port,
        "lan_ip": ip,
        "proxy_server": ip,
        "proxy_port": port,
        "mitmdump_path": _find_mitmdump() or "",
        "capture_path": str(CAPTURE_PATH),
        "capture_count": _capture_count(),
        "cert_path": str(cert_path),
        "cert_ready": cert_path.exists(),
        "cert_install_url": "http://mitm.it",
        "note": (
            "Cấu hình iPad Wi-Fi proxy Manual tới proxy_server/proxy_port, "
            "mở http://mitm.it để cài CA, rồi bật trust trong Certificate Trust Settings."
        ),
    }


def _current_port() -> int:
    meta_path = PROXY_DIR / "proxy_meta.json"
    try:
        data = json.loads(meta_path.read_text(encoding="utf-8"))
        return int(data.get("port") or DEFAULT_PORT)
    except Exception:
        return DEFAULT_PORT


def start(port: int = DEFAULT_PORT, clear_capture: bool = False) -> dict[str, Any]:
    if _running_process():
        return status()

    mitmdump = _find_mitmdump()
    if not mitmdump:
        raise RuntimeError("Không tìm thấy mitmdump. Cài mitmproxy hoặc brew install mitmproxy.")

    port = max(1024, min(int(port or DEFAULT_PORT), 65535))
    PROXY_DIR.mkdir(parents=True, exist_ok=True)
    CONF_DIR.mkdir(parents=True, exist_ok=True)
    ADDON_PATH.write_text(ADDON_CODE, encoding="utf-8")
    if clear_capture and CAPTURE_PATH.exists():
        CAPTURE_PATH.unlink()
    (PROXY_DIR / "proxy_meta.json").write_text(json.dumps({"port": port}), encoding="utf-8")

    env = os.environ.copy()
    env["HAGENT_TTV_PROXY_CAPTURE_PATH"] = str(CAPTURE_PATH)
    log_handle = LOG_PATH.open("a", encoding="utf-8")
    process = subprocess.Popen(
        [
            mitmdump,
            "--listen-host",
            "0.0.0.0",
            "--listen-port",
            str(port),
            "--set",
            f"confdir={CONF_DIR}",
            "--set",
            "block_global=false",
            "-s",
            str(ADDON_PATH),
        ],
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        env=env,
        start_new_session=True,
    )
    PID_PATH.write_text(str(process.pid), encoding="utf-8")
    time.sleep(1.0)
    if process.poll() is not None:
        raise RuntimeError(f"mitmdump exited early with code {process.returncode}. Xem log: {LOG_PATH}")
    return status()


def stop() -> dict[str, Any]:
    process = _running_process()
    if process:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except Exception:
            try:
                process.terminate()
            except psutil.Error:
                pass
        try:
            process.wait(timeout=5)
        except psutil.TimeoutExpired:
            try:
                process.kill()
            except psutil.Error:
                pass
    return status()


def clear_capture() -> dict[str, Any]:
    if CAPTURE_PATH.exists():
        CAPTURE_PATH.unlink()
    return status()


def analyze(save_profile: bool = True) -> dict[str, Any]:
    records = _read_records()
    profile = analyze_capture_records(records, save_profile=save_profile)
    profile["proxy_status"] = status()
    return profile


def tail_log(limit: int = 80) -> dict[str, Any]:
    if not LOG_PATH.exists():
        return {"log": ""}
    lines = LOG_PATH.read_text(encoding="utf-8", errors="replace").splitlines()
    return {"log": "\n".join(lines[-limit:])}
