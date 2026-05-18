from __future__ import annotations

from dataclasses import dataclass, field
import json
from uuid import uuid4

from api.services.db import get_connection


@dataclass
class SessionRecord:
    session_id: str
    title: str
    agent_id: str | None = None
    user_id: str = "398f6a8a-8954-4315-8240-df769e664b54"
    messages: list[dict] = field(default_factory=list)
    status: str = "idle"


def _row_to_session(row) -> SessionRecord:
    messages = list_messages(row["id"])
    return SessionRecord(
        session_id=row["id"],
        title=row["title"],
        user_id=row["user_id"] if "user_id" in row.keys() else "398f6a8a-8954-4315-8240-df769e664b54",
        agent_id=row["agent_id"] if "agent_id" in row.keys() else None,
        status=row["status"] if "status" in row.keys() else "idle",
        messages=messages,
    )


def create_session(
    title: str | None = None,
    agent_id: str | None = None,
    user_id: str = "398f6a8a-8954-4315-8240-df769e664b54",
) -> SessionRecord:
    session_id = str(uuid4())
    session_title = title or "Cuộc trò chuyện mới"
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO chat_sessions (id, title, agent_id, user_id) VALUES (?, ?, ?, ?)",
            (session_id, session_title, agent_id, user_id),
        )
    return SessionRecord(session_id=session_id, title=session_title, agent_id=agent_id, user_id=user_id, status="idle")


def get_session(session_id: str) -> SessionRecord | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, title, agent_id, user_id, processing FROM chat_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
    if not row:
        return None
    # Map processing to status for backward compatibility
    data = dict(row)
    data["status"] = "busy" if row["processing"] else "idle"
    return _row_to_session(data)


def list_sessions() -> list[SessionRecord]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, title, agent_id, processing FROM chat_sessions ORDER BY updated_at DESC, created_at DESC"
        ).fetchall()
    records = []
    for row in rows:
        data = dict(row)
        data["status"] = "busy" if row["processing"] else "idle"
        records.append(_row_to_session(data))
    return records


def add_message(
    session_id: str,
    role: str,
    content: str,
    provider: str | None = None,
    usage: dict | None = None,
) -> str | None:
    with get_connection() as conn:
        session_row = conn.execute(
            "SELECT id, user_id FROM chat_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        if not session_row:
            return None
        msg_id = str(uuid4())
        cursor = conn.execute(
            "INSERT INTO messages (id, session_id, role, content, provider, usage_json, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (msg_id, session_id, role, content, provider, json.dumps(usage) if usage else None, session_row["user_id"]),
        )
        conn.execute(
            "UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (session_id,),
        )
        return msg_id


def list_messages(session_id: str) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, role, content, provider, usage_json, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,),
        ).fetchall()
    items = []
    for row in rows:
        usage = None
        if row["usage_json"]:
            try:
                usage = json.loads(row["usage_json"])
            except Exception:
                usage = None
        items.append({
            "id": str(row["id"]),
            "role": row["role"],
            "content": row["content"],
            "provider": row["provider"],
            "usage": usage,
            "createdAt": row["created_at"],
        })
    return items


def set_session_status(session_id: str, status: str) -> None:
    # Node uses 'processing' integer instead of 'status' text
    processing = 1 if status == "busy" else 0
    with get_connection() as conn:
        conn.execute(
            "UPDATE chat_sessions SET processing = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (processing, session_id),
        )


def update_session_title(session_id: str, title: str) -> None:
    clean_title = " ".join((title or "").split()).strip()[:80]
    if not clean_title:
        return
    with get_connection() as conn:
        conn.execute(
            "UPDATE chat_sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (clean_title, session_id),
        )


def delete_session(session_id: str) -> bool:
    with get_connection() as conn:
        result = conn.execute("DELETE FROM chat_sessions WHERE id = ?", (session_id,))
        return result.rowcount > 0


def delete_message(session_id: str, message_id: str) -> bool:
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM run_journals WHERE session_id = ? AND message_id = ?",
            (session_id, message_id),
        )
        result = conn.execute(
            "DELETE FROM messages WHERE session_id = ? AND id = ?",
            (session_id, message_id),
        )
        conn.execute(
            "UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (session_id,),
        )
        return result.rowcount > 0


def add_journal(
    session_id: str,
    type_: str,
    message_id: str | None = None,
    content: str | None = None,
    event_name: str | None = None,
    status: str | None = None,
    count: int = 0,
) -> str:
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO run_journals
              (message_id, session_id, type, content, event_name, status, count)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (message_id, session_id, type_, content, event_name, status, count),
        )
        return str(cursor.lastrowid)


def list_journal(session_id: str, message_id: str | None = None) -> list[dict]:
    query = (
        "SELECT type, content, event_name, status, count, created_at "
        "FROM run_journals WHERE session_id = ?"
    )
    params: tuple = (session_id,)
    if message_id:
        query += " AND message_id = ?"
        params = (session_id, message_id)
    query += " ORDER BY id ASC"
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
    return [
        {
            "type": row["type"],
            "name": row["event_name"],
            "content": row["content"],
            "status": row["status"],
            "count": row["count"] or 0,
            "time": (row["created_at"] or "").split(" ")[-1],
        }
        for row in rows
    ]


def clear_journal(session_id: str) -> bool:
    with get_connection() as conn:
        result = conn.execute("DELETE FROM run_journals WHERE session_id = ?", (session_id,))
        return result.rowcount > 0


def count_session_messages(session_id: str) -> int:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM messages WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        return row["cnt"] if row else 0


def update_session_summary(session_id: str, summary: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE chat_sessions SET summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (summary, session_id),
        )


def get_session_summary(session_id: str) -> str | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT summary FROM chat_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        return row["summary"] if row else None


def create_child_session(parent_session_id: str, title: str | None = None) -> SessionRecord:
    """Create a new session linked to a parent session (for rotation)."""
    session_id = str(uuid4())
    session_title = title or "Cuộc trò chuyện mới"
    with get_connection() as conn:
        # Copy agent_id from parent
        parent = conn.execute(
            "SELECT agent_id, user_id FROM chat_sessions WHERE id = ?",
            (parent_session_id,),
        ).fetchone()
        agent_id = parent["agent_id"] if parent else None
        user_id = parent["user_id"] if parent else "398f6a8a-8954-4315-8240-df769e664b54"
        conn.execute(
            "INSERT INTO chat_sessions (id, title, agent_id, user_id, parent_session_id) VALUES (?, ?, ?, ?, ?)",
            (session_id, session_title, agent_id, user_id, parent_session_id),
        )
    return SessionRecord(session_id=session_id, title=session_title, agent_id=agent_id, status="idle")
