from __future__ import annotations

import json
import sqlite3
from typing import Any


DEFAULT_USER_ID = "398f6a8a-8954-4315-8240-df769e664b54"


def resolve_hagent_user_id(user_id: str | None = None, authorization: str | None = None) -> str:
    value = (user_id or "").strip()
    if value:
        return value
    try:
        from api.services.wiki_memory import resolve_user_id

        return resolve_user_id(authorization)
    except Exception:
        return DEFAULT_USER_ID


def _trim(text: str, limit: int) -> str:
    text = (text or "").strip()
    if limit <= 0 or len(text) <= limit:
        return text
    return text[: max(0, limit - 32)].rstrip() + "\n...[trimmed]"


def _format_topics(raw: Any) -> str:
    if isinstance(raw, list):
        topics = raw
    else:
        try:
            topics = json.loads(raw or "[]")
        except Exception:
            topics = []
    cleaned = [str(topic) for topic in topics if str(topic).strip()]
    return ", ".join(cleaned[:4])


def build_memory_context(max_chars: int = 6000) -> str:
    """Return the current built-in memory snapshot for ephemeral LLM context."""
    try:
        from tools.memory_tool import MemoryStore

        store = MemoryStore(memory_char_limit=max_chars, user_char_limit=max_chars)
        store.load_from_disk()
        blocks = []
        memory_block = store.format_for_system_prompt("memory")
        if memory_block:
            blocks.append(memory_block)
        user_block = store.format_for_system_prompt("user")
        if user_block:
            blocks.append(user_block)
        return _trim("\n\n".join(blocks), max_chars)
    except Exception:
        return ""


def build_wiki_context(user_id: str | None, query: str, limit: int = 5, max_chars: int = 7000) -> str:
    """Return relevant private Wiki entries for the current user message."""
    query = (query or "").strip()
    if not query:
        return ""
    resolved_user_id = resolve_hagent_user_id(user_id)
    try:
        from api.services.wiki_memory import search_wiki

        entries = search_wiki(resolved_user_id, query, limit=limit)
    except Exception:
        entries = []

    if not entries:
        return ""

    parts = []
    for entry in entries:
        title = str(entry.get("title") or "").strip()
        summary = str(entry.get("summary") or "").strip()
        content = str(entry.get("content") or "").strip()
        topics = _format_topics(entry.get("topics"))
        updated_at = str(entry.get("updated_at") or "").strip()
        meta = []
        if topics:
            meta.append(f"topics: {topics}")
        if updated_at:
            meta.append(f"updated: {updated_at}")
        header = f"### {title or 'Untitled wiki entry'}"
        if meta:
            header += f" ({'; '.join(meta)})"
        body = content or summary
        if summary and summary not in body:
            body = f"{summary}\n\n{body}"
        parts.append(f"{header}\n{body}".strip())

    return _trim("\n\n---\n\n".join(parts), max_chars)


def build_personal_context(
    query: str,
    user_id: str | None = None,
    include_memory: bool = True,
    include_wiki: bool = True,
    memory_chars: int = 6000,
    wiki_chars: int = 7000,
) -> str:
    blocks = []
    if include_memory:
        memory = build_memory_context(memory_chars)
        if memory:
            blocks.append("Current built-in memory:\n" + memory)
    if include_wiki:
        wiki = build_wiki_context(user_id, query, max_chars=wiki_chars)
        if wiki:
            blocks.append("Relevant private Wiki entries:\n" + wiki)
    if not blocks:
        return ""
    return (
        "<hagent-personal-context>\n"
        "Use this private HAgent memory/wiki context when it is relevant. "
        "If it conflicts with the user's latest message, prefer the latest message or ask briefly.\n\n"
        + "\n\n".join(blocks)
        + "\n</hagent-personal-context>"
    )


def wiki_entry_count(user_id: str | None = None) -> int:
    """Small diagnostic helper used by tests and doctor commands."""
    resolved_user_id = resolve_hagent_user_id(user_id)
    try:
        from api.services.db import get_connection

        with get_connection() as conn:
            row = conn.execute(
                "SELECT count(*) FROM wiki_entries WHERE user_id = ?",
                (resolved_user_id,),
            ).fetchone()
            return int(row[0] or 0) if row else 0
    except Exception:
        return 0
