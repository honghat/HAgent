"""Phân tích HAR/cURL capture từ app TTV trên iPad/iPhone.

Module này chỉ lưu URL/path/schema đã sanitize. Không lưu header, cookie, token,
query value hoặc response body.
"""
from __future__ import annotations

import json
import re
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlsplit, urlunsplit

from api.services.db import DATA_DIR

PROFILE_PATH = DATA_DIR / "ttv_api_profile.json"

URL_RE = re.compile(r"https?://[^\s\"'<>\\]+", re.IGNORECASE)
HOST_HINT_RE = re.compile(r"(tangthuvien|ttv|truyen|book|novel|chapter|chuong)", re.IGNORECASE)
SEARCH_HINT_RE = re.compile(r"(search|tim-kiem|find|keyword|query|term|q=)", re.IGNORECASE)
DETAIL_HINT_RE = re.compile(r"(detail|info|book|story|novel|truyen|manga)", re.IGNORECASE)
CHAPTERS_HINT_RE = re.compile(r"(chapters|chapter-list|list-chapter|toc|muc-luc|chuong)", re.IGNORECASE)
CONTENT_HINT_RE = re.compile(r"(content|read|doc|chapter-content|chuong)", re.IGNORECASE)
RECENT_HINT_RE = re.compile(r"(recent|latest|updated|new|moi|cap-nhat|home|rank)", re.IGNORECASE)
SENSITIVE_QUERY_KEYS = {
    "access_token",
    "api_key",
    "apikey",
    "auth",
    "authorization",
    "bearer",
    "code",
    "jwt",
    "key",
    "password",
    "refresh_token",
    "secret",
    "session",
    "sid",
    "sign",
    "signature",
    "token",
}


def _safe_json_loads(text: str) -> Any:
    try:
        return json.loads(text)
    except Exception:
        return None


def _sanitize_url(url: str) -> dict[str, Any] | None:
    url = url.rstrip(".,;:!?)]}").strip()
    try:
        parsed = urlsplit(url)
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None

    host = parsed.hostname.lower()
    port = f":{parsed.port}" if parsed.port else ""
    netloc = f"{host}{port}"
    path = parsed.path or "/"
    query_keys = sorted(
        {
            key
            for key, _ in parse_qsl(parsed.query, keep_blank_values=True)
            if key.lower() not in SENSITIVE_QUERY_KEYS
        }
    )
    query = "&".join(f"{key}=..." for key in query_keys)
    sanitized = urlunsplit((parsed.scheme, netloc, path, query, ""))

    return {
        "url": sanitized,
        "base_url": urlunsplit((parsed.scheme, netloc, "", "", "")),
        "host": host,
        "path": path,
        "query_keys": query_keys,
    }


def _json_key_paths(value: Any, limit: int = 60) -> list[str]:
    keys: list[str] = []

    def walk(item: Any, prefix: str = "") -> None:
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


def _category_for(candidate: dict[str, Any]) -> str:
    haystack = " ".join(
        [
            candidate.get("path", ""),
            " ".join(candidate.get("query_keys", [])),
            " ".join(candidate.get("body_keys", [])),
        ]
    )
    if SEARCH_HINT_RE.search(haystack):
        return "search"
    if CHAPTERS_HINT_RE.search(haystack) and not CONTENT_HINT_RE.search(haystack):
        return "chapters"
    if CONTENT_HINT_RE.search(haystack) and re.search(r"(content|read|doc|chapter)", haystack, re.IGNORECASE):
        return "chapter_content"
    if DETAIL_HINT_RE.search(haystack):
        return "detail"
    if RECENT_HINT_RE.search(haystack):
        return "recent"
    return "other"


def _entry_from_har(entry: dict[str, Any]) -> dict[str, Any] | None:
    request = entry.get("request") or {}
    response = entry.get("response") or {}
    url = request.get("url") or ""
    safe = _sanitize_url(url)
    if not safe:
        return None

    content = response.get("content") or {}
    body_keys: list[str] = []
    body_text = content.get("text")
    if isinstance(body_text, str) and len(body_text) <= 2_000_000:
        parsed = _safe_json_loads(body_text)
        if parsed is not None:
            body_keys = _json_key_paths(parsed)

    candidate = {
        **safe,
        "method": (request.get("method") or "GET").upper(),
        "status": response.get("status") or 0,
        "mime_type": content.get("mimeType") or response.get("contentType") or "",
        "body_keys": body_keys,
    }
    candidate["category"] = _category_for(candidate)
    return candidate


def _entries_from_har_json(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, dict):
        return []
    log = value.get("log") if isinstance(value.get("log"), dict) else value
    entries = log.get("entries") if isinstance(log, dict) else None
    if not isinstance(entries, list):
        return []
    return [candidate for entry in entries if (candidate := _entry_from_har(entry))]


def _entries_from_urls(text: str) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    method = "POST" if re.search(r"\b-X\s+POST\b|--request\s+POST", text, re.IGNORECASE) else "GET"
    for match in URL_RE.finditer(text):
        safe = _sanitize_url(match.group(0))
        if not safe or safe["url"] in seen:
            continue
        seen.add(safe["url"])
        candidate = {
            **safe,
            "method": method,
            "status": 0,
            "mime_type": "",
            "body_keys": [],
        }
        candidate["category"] = _category_for(candidate)
        candidates.append(candidate)
    return candidates


def _build_profile(candidates: list[dict[str, Any]], save_profile: bool = False) -> dict[str, Any]:
    deduped: dict[tuple[str, str], dict[str, Any]] = {}
    for item in candidates:
        if not HOST_HINT_RE.search(f"{item.get('host', '')} {item.get('path', '')}"):
            continue
        key = (item["method"], item["url"])
        deduped.setdefault(key, item)

    items = list(deduped.values())
    host_counts = Counter(item["host"] for item in items)
    base_counts = Counter(item["base_url"] for item in items)
    by_category: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        by_category[item["category"]].append(item)

    preferred: dict[str, dict[str, Any]] = {}
    for category, category_items in by_category.items():
        preferred[category] = sorted(
            category_items,
            key=lambda item: (
                0 if item.get("status") in {200, 201, 204, 304} else 1,
                len(item.get("query_keys", [])),
                len(item.get("path", "")),
            ),
        )[0]

    profile = {
        "source": "ttv_capture",
        "updated_at": int(time.time()),
        "hosts": [host for host, _ in host_counts.most_common(20)],
        "api_base_urls": [base for base, _ in base_counts.most_common(20)],
        "preferred_endpoints": preferred,
        "candidates": items[:120],
        "note": "Đã loại header/cookie/token/query value/response body; chỉ giữ URL path, query key và schema key.",
    }
    if save_profile and items:
        PROFILE_PATH.parent.mkdir(parents=True, exist_ok=True)
        PROFILE_PATH.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    return profile


def analyze_capture_text(capture_text: str, save_profile: bool = False) -> dict[str, Any]:
    raw = (capture_text or "").strip()
    if not raw:
        raise ValueError("Capture rỗng")

    parsed = _safe_json_loads(raw)
    candidates = _entries_from_har_json(parsed)
    if not candidates:
        candidates = _entries_from_urls(raw)
    return _build_profile(candidates, save_profile=save_profile)


def analyze_capture_records(records: list[dict[str, Any]], save_profile: bool = False) -> dict[str, Any]:
    candidates: list[dict[str, Any]] = []
    for record in records:
        if not isinstance(record, dict):
            continue
        safe = _sanitize_url(str(record.get("url") or ""))
        if not safe:
            continue
        candidate = {
            **safe,
            "method": str(record.get("method") or "GET").upper(),
            "status": int(record.get("status") or 0),
            "mime_type": str(record.get("mime_type") or ""),
            "body_keys": [
                str(key)
                for key in record.get("body_keys", [])
                if isinstance(key, str)
            ][:80],
        }
        candidate["category"] = _category_for(candidate)
        candidates.append(candidate)
    return _build_profile(candidates, save_profile=save_profile)


def load_profile() -> dict[str, Any]:
    if not PROFILE_PATH.exists():
        return {}
    try:
        profile = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
        if not profile.get("candidates") and not profile.get("api_base_urls"):
            return {}
        return profile
    except Exception:
        return {}
