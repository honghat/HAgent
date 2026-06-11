"""Periodic integration pull into Wiki memory.

Auto-fetch sources are lightweight proactive ingesters. The scheduler polls due
sources, fetches new external items, deduplicates them, and stores normalized
facts into the existing wiki memory tables.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from html import unescape
from urllib import error, request
from uuid import uuid4
from xml.etree import ElementTree

from api.services.db import get_connection
from api.services.wiki_memory import save_wiki_entry

logger = logging.getLogger(__name__)

DEFAULT_INTERVAL_SECONDS = 20 * 60
_MIN_INTERVAL_SECONDS = 60
_MAX_FETCH_LIMIT = 50
_USER_AGENT = "HAgent AutoFetch/1.0"


class AutoFetchError(RuntimeError):
    pass


def create_auto_fetch_source(
    user_id: str,
    *,
    name: str,
    kind: str,
    url: str,
    config: dict | None = None,
    enabled: bool = True,
    interval_seconds: int = DEFAULT_INTERVAL_SECONDS,
    next_run_at: str | None = None,
) -> dict:
    source_id = str(uuid4())
    source = {
        "id": source_id,
        "user_id": user_id,
        "name": name,
        "kind": _normalize_kind(kind),
        "url": url.strip(),
        "config": config if isinstance(config, dict) else {},
        "enabled": bool(enabled),
        "interval_seconds": _normalize_interval(interval_seconds),
        "next_run_at": next_run_at,
    }
    if not source["name"].strip():
        raise AutoFetchError("Auto-fetch source requires a name")
    if not source["url"]:
        raise AutoFetchError("Auto-fetch source requires a URL")
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO auto_fetch_sources
                (id, user_id, name, kind, url, config_json, enabled, interval_seconds, next_run_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
            """,
            (
                source_id,
                user_id,
                source["name"].strip(),
                source["kind"],
                source["url"],
                json.dumps(source["config"], ensure_ascii=False),
                1 if source["enabled"] else 0,
                source["interval_seconds"],
                source["next_run_at"],
            ),
        )
    return get_auto_fetch_source(source_id, user_id) or source


def get_auto_fetch_source(source_id: str, user_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM auto_fetch_sources WHERE id = ? AND user_id = ?",
            (source_id, user_id),
        ).fetchone()
    return _row_to_source(row) if row else None


def list_auto_fetch_sources(user_id: str) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM auto_fetch_sources WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()
    return [_row_to_source(row) for row in rows]


def update_auto_fetch_source(source_id: str, user_id: str, updates: dict) -> dict | None:
    fields: list[str] = []
    params: list[object] = []
    if "name" in updates:
        fields.append("name = ?")
        params.append(str(updates["name"] or "").strip())
    if "kind" in updates:
        fields.append("kind = ?")
        params.append(_normalize_kind(str(updates["kind"] or "")))
    if "url" in updates:
        fields.append("url = ?")
        params.append(str(updates["url"] or "").strip())
    if "config" in updates:
        cfg = updates["config"] if isinstance(updates["config"], dict) else {}
        fields.append("config_json = ?")
        params.append(json.dumps(cfg, ensure_ascii=False))
    if "enabled" in updates:
        fields.append("enabled = ?")
        params.append(1 if updates["enabled"] else 0)
    if "interval_seconds" in updates:
        fields.append("interval_seconds = ?")
        params.append(_normalize_interval(updates["interval_seconds"]))
    if "next_run_at" in updates:
        fields.append("next_run_at = COALESCE(?, datetime('now'))")
        params.append(updates["next_run_at"])
    if not fields:
        return get_auto_fetch_source(source_id, user_id)
    fields.append("updated_at = CURRENT_TIMESTAMP")
    params.extend([source_id, user_id])
    with get_connection() as conn:
        conn.execute(
            f"UPDATE auto_fetch_sources SET {', '.join(fields)} WHERE id = ? AND user_id = ?",
            params,
        )
    return get_auto_fetch_source(source_id, user_id)


def delete_auto_fetch_source(source_id: str, user_id: str) -> bool:
    with get_connection() as conn:
        cur = conn.execute(
            "DELETE FROM auto_fetch_sources WHERE id = ? AND user_id = ?",
            (source_id, user_id),
        )
        return cur.rowcount > 0


def run_due_auto_fetch_sources(limit: int = 5) -> int:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM auto_fetch_sources
            WHERE enabled = 1
              AND (next_run_at IS NULL OR next_run_at <= datetime('now'))
            ORDER BY COALESCE(next_run_at, '1970-01-01') ASC
            LIMIT ?
            """,
            (max(1, int(limit or 5)),),
        ).fetchall()
    count = 0
    for row in rows:
        source = _row_to_source(row)
        try:
            run_auto_fetch_source(source)
        except Exception as exc:  # noqa: BLE001
            logger.warning("auto-fetch source %s failed: %s", source.get("id"), exc)
            _finish_source(source, error=str(exc))
        count += 1
    return count


def run_auto_fetch_source(source: dict) -> dict:
    kind = _normalize_kind(source.get("kind") or "rss")
    if kind == "rss":
        items = _fetch_rss(source)
    elif kind == "json":
        items = _fetch_json(source)
    else:
        raise AutoFetchError(f"Unsupported auto-fetch kind: {kind}")

    saved = 0
    skipped = 0
    for item in items:
        if not _mark_seen(source["id"], _item_fingerprint(source, item)):
            skipped += 1
            continue
        entry = _item_to_wiki_entry(source, item)
        if save_wiki_entry(source["user_id"], entry, source=f"auto_fetch:{source['id']}"):
            saved += 1
        else:
            skipped += 1
    _finish_source(source, fetched=len(items), saved=saved, skipped=skipped)
    return {"fetched": len(items), "saved": saved, "skipped": skipped}


def _fetch_rss(source: dict) -> list[dict]:
    root = ElementTree.fromstring(_fetch_bytes(source))
    limit = _source_limit(source)
    items = []
    for item in root.findall(".//item")[:limit]:
        title = _node_text(item, "title")
        link = _node_text(item, "link")
        summary = _clean_html(_node_text(item, "description"))
        published = _node_text(item, "pubDate")
        guid = _node_text(item, "guid")
        if title or link or summary:
            items.append({"title": title, "link": link, "summary": summary, "published": published, "id": guid})
    if items:
        return items
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    for entry in root.findall(".//atom:entry", ns)[:limit]:
        link_el = entry.find("atom:link", ns)
        link = link_el.get("href") if link_el is not None else ""
        items.append(
            {
                "title": _node_text(entry, "atom:title", ns),
                "link": link,
                "summary": _clean_html(_node_text(entry, "atom:summary", ns) or _node_text(entry, "atom:content", ns)),
                "published": _node_text(entry, "atom:updated", ns) or _node_text(entry, "atom:published", ns),
                "id": _node_text(entry, "atom:id", ns),
            }
        )
    return items


def _fetch_json(source: dict) -> list[dict]:
    raw = _fetch_bytes(source).decode("utf-8", errors="replace")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AutoFetchError(f"JSON parse failed: {exc}") from exc
    items = _extract_json_items(payload, source.get("config") or {})
    return [_normalize_json_item(item) for item in items[:_source_limit(source)] if isinstance(item, dict)]


def _fetch_bytes(source: dict) -> bytes:
    headers = {"User-Agent": _USER_AGENT, "Accept": "application/rss+xml, application/json, text/xml;q=0.9, */*;q=0.8"}
    extra_headers = (source.get("config") or {}).get("headers")
    if isinstance(extra_headers, dict):
        headers.update({str(k): str(v) for k, v in extra_headers.items()})
    req = request.Request(str(source.get("url") or ""), headers=headers, method="GET")
    try:
        with request.urlopen(req, timeout=float((source.get("config") or {}).get("timeout") or 30)) as response:
            return response.read()
    except error.HTTPError as exc:
        raise AutoFetchError(f"HTTP {exc.code}") from exc
    except OSError as exc:
        raise AutoFetchError(f"Request failed: {exc}") from exc


def _extract_json_items(payload, config: dict) -> list:
    path = str(config.get("items_path") or config.get("item_path") or "").strip()
    current = payload
    if path:
        for part in path.split("."):
            if isinstance(current, dict):
                current = current.get(part)
            elif isinstance(current, list) and part.isdigit():
                idx = int(part)
                current = current[idx] if 0 <= idx < len(current) else None
            else:
                current = None
            if current is None:
                break
    if isinstance(current, list):
        return current
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("items", "data", "results", "entries"):
            if isinstance(payload.get(key), list):
                return payload[key]
    return []


def _normalize_json_item(item: dict) -> dict:
    return {
        "id": item.get("id") or item.get("guid") or item.get("external_id"),
        "title": item.get("title") or item.get("name") or item.get("subject") or "Untitled",
        "link": item.get("url") or item.get("link") or item.get("html_url") or "",
        "summary": item.get("summary") or item.get("description") or item.get("content") or item.get("text") or "",
        "published": item.get("published") or item.get("published_at") or item.get("updated_at") or item.get("created_at") or "",
    }


def _item_to_wiki_entry(source: dict, item: dict) -> dict:
    title = " ".join(str(item.get("title") or "Untitled").split())[:160]
    summary = " ".join(str(item.get("summary") or "").split())[:500]
    link = str(item.get("link") or "").strip()
    published = str(item.get("published") or "").strip()
    lines = [f"Nguồn auto-fetch: {source.get('name')}"]
    if published:
        lines.append(f"Thời điểm nguồn: {published}")
    if link:
        lines.append(f"Liên kết: {link}")
    if summary:
        lines.extend(["", summary])
    topics = ["auto-fetch", _normalize_kind(source.get("kind") or "rss")]
    configured_topics = (source.get("config") or {}).get("topics")
    if isinstance(configured_topics, list):
        topics.extend(str(t) for t in configured_topics if str(t).strip())
    return {"title": title, "summary": summary or title, "topics": topics[:3], "content": "\n".join(lines).strip()}


def _mark_seen(source_id: str, fingerprint: str) -> bool:
    try:
        with get_connection() as conn:
            conn.execute(
                "INSERT INTO auto_fetch_seen (source_id, fingerprint) VALUES (?, ?)",
                (source_id, fingerprint),
            )
        return True
    except Exception:
        return False


def _item_fingerprint(source: dict, item: dict) -> str:
    stable = item.get("id") or item.get("link") or item.get("title") or json.dumps(item, sort_keys=True, default=str)
    raw = f"{source.get('id')}\n{stable}"
    return hashlib.sha256(raw.encode("utf-8", errors="replace")).hexdigest()


def _finish_source(source: dict, *, fetched: int = 0, saved: int = 0, skipped: int = 0, error: str = "") -> None:
    status = {"fetched": fetched, "saved": saved, "skipped": skipped, "error": error[:300]}
    next_run_at = _next_run_at(source)
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE auto_fetch_sources
            SET last_run_at = CURRENT_TIMESTAMP,
                next_run_at = ?,
                last_status_json = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
            """,
            (next_run_at, json.dumps(status, ensure_ascii=False), source["id"], source["user_id"]),
        )


def _next_run_at(source: dict) -> str:
    seconds = _normalize_interval(source.get("interval_seconds") or DEFAULT_INTERVAL_SECONDS)
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).strftime("%Y-%m-%d %H:%M:%S+00")


def _row_to_source(row) -> dict:
    config = {}
    try:
        config = json.loads(row["config_json"] or "{}")
    except (TypeError, json.JSONDecodeError):
        config = {}
    status = None
    try:
        status = json.loads(row["last_status_json"] or "null")
    except (TypeError, json.JSONDecodeError):
        status = None
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "name": row["name"],
        "kind": row["kind"],
        "url": row["url"],
        "config": config,
        "enabled": bool(row["enabled"]),
        "interval_seconds": int(row["interval_seconds"] or DEFAULT_INTERVAL_SECONDS),
        "last_run_at": row["last_run_at"],
        "next_run_at": row["next_run_at"],
        "last_status": status,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _normalize_kind(kind: str) -> str:
    normalized = str(kind or "rss").strip().lower()
    return normalized if normalized in {"rss", "json"} else "rss"


def _normalize_interval(value) -> int:
    try:
        seconds = int(value or DEFAULT_INTERVAL_SECONDS)
    except (TypeError, ValueError):
        seconds = DEFAULT_INTERVAL_SECONDS
    return max(_MIN_INTERVAL_SECONDS, seconds)


def _source_limit(source: dict) -> int:
    try:
        limit = int((source.get("config") or {}).get("limit") or 10)
    except (TypeError, ValueError):
        limit = 10
    return max(1, min(_MAX_FETCH_LIMIT, limit))


def _node_text(node, tag: str, ns: dict | None = None) -> str:
    child = node.find(tag, ns or {})
    return unescape((child.text or "").strip()) if child is not None and child.text else ""


def _clean_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text or "")
    return " ".join(unescape(text).split())
