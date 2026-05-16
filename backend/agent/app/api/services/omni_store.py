"""OmniChat storage — conversations, messages, contacts, stats."""

from __future__ import annotations

import json
from uuid import uuid4
from datetime import datetime

from api.services.db import get_connection


# ── Helpers ────────────────────────────────────────────────────────────────

def _row_to_conversation(row) -> dict:
    return {
        "id": row["id"],
        "sender": row["custom_name"] or row["title"],
        "content": row["last_message_preview"] or "",
        "channel": row["platform"],
        "avatar": "",
        "is_pinned": bool(row["pinned"]),
        "unread": bool(row["unread_count"] > 0),
        "thread_type": "personal",
        "external_id": row["external_id"] or "",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _row_to_message(row) -> dict:
    reactions = {}
    if row["reactions_json"]:
        try:
            reactions = json.loads(row["reactions_json"])
        except (json.JSONDecodeError, TypeError):
            reactions = {}

    reply_to = None
    if row["reply_to_id"]:
        reply_to = {
            "id": row["reply_to_id"],
            "content": _get_message_preview(row["reply_to_id"]),
        }

    return {
        "id": row["id"],
        "sender_type": row["role"],
        "content": row["content"] or "",
        "reply_to": reply_to,
        "external_author_name": None,
        "reactions": reactions,
        "status": "sent",
        "created_at": row["created_at"],
        "conversation_id": row["conversation_id"],
    }


def _get_message_preview(message_id: str) -> str:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT content FROM omni_messages WHERE id = ?", (message_id,)
        ).fetchone()
    if row:
        text = row["content"] or ""
        return text[:100] + ("..." if len(text) > 100 else "")
    return ""


# ── Conversations ──────────────────────────────────────────────────────────

def list_conversations(user_id: str) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT * FROM omni_conversations
               WHERE user_id = ?
               ORDER BY pinned DESC, last_message_at DESC, created_at DESC""",
            (user_id,),
        ).fetchall()
    return [_row_to_conversation(r) for r in rows]


def get_conversation(conversation_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM omni_conversations WHERE id = ?", (conversation_id,)
        ).fetchone()
    return dict(row) if row else None


def create_conversation(
    user_id: str,
    platform: str,
    title: str,
    external_id: str | None = None,
) -> dict:
    conv_id = str(uuid4())
    now = datetime.now().isoformat()
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO omni_conversations
               (id, user_id, platform, external_id, title, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (conv_id, user_id, platform, external_id, title, now, now),
        )
    conv = get_conversation(conv_id)
    return _row_to_conversation(dict(conv)) if conv else {}


def ensure_conversation(
    user_id: str,
    platform: str,
    title: str,
    external_id: str | None = None,
) -> dict:
    """Find existing conversation by platform+external_id, or create new one."""
    if external_id:
        with get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM omni_conversations WHERE user_id = ? AND platform = ? AND external_id = ?",
                (user_id, platform, external_id),
            ).fetchone()
        if row:
            return _row_to_conversation(dict(row))
    return create_conversation(user_id, platform, title, external_id)


def delete_conversation(conversation_id: str) -> bool:
    with get_connection() as conn:
        result = conn.execute(
            "DELETE FROM omni_conversations WHERE id = ?", (conversation_id,)
        )
        return result.rowcount > 0


def toggle_pin_conversation(conversation_id: str) -> bool | None:
    """Toggle pinned state. Returns new state, or None if not found."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT pinned FROM omni_conversations WHERE id = ?", (conversation_id,)
        ).fetchone()
        if not row:
            return None
        new_state = 0 if row["pinned"] else 1
        conn.execute(
            "UPDATE omni_conversations SET pinned = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
            (new_state, conversation_id),
        )
        return bool(new_state)


def rename_conversation(conversation_id: str, custom_name: str) -> bool:
    with get_connection() as conn:
        result = conn.execute(
            "UPDATE omni_conversations SET custom_name = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
            (custom_name, conversation_id),
        )
        return result.rowcount > 0


def update_conversation_preview(
    conversation_id: str,
    preview: str,
    sender: str,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """UPDATE omni_conversations
               SET last_message_preview = ?, last_message_sender = ?,
                   last_message_at = datetime('now', 'localtime'),
                   updated_at = datetime('now', 'localtime')
               WHERE id = ?""",
            (preview, sender, conversation_id),
        )


# ── Messages ───────────────────────────────────────────────────────────────

def get_conversation_messages(
    conversation_id: str,
    limit: int = 100,
    before_id: str | None = None,
) -> list[dict]:
    with get_connection() as conn:
        if before_id:
            before_row = conn.execute(
                "SELECT created_at FROM omni_messages WHERE id = ? AND conversation_id = ?",
                (before_id, conversation_id),
            ).fetchone()
            if before_row:
                rows = conn.execute(
                    """SELECT * FROM omni_messages
                       WHERE conversation_id = ? AND created_at < ?
                       ORDER BY created_at DESC LIMIT ?""",
                    (conversation_id, before_row["created_at"], limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM omni_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?",
                    (conversation_id, limit),
                ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM omni_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?",
                (conversation_id, limit),
            ).fetchall()
    # Return oldest first (chat UI convention)
    result = [_row_to_message(r) for r in reversed(rows)]
    return result


def create_message(
    conversation_id: str,
    user_id: str,
    role: str,
    content: str,
    reply_to_id: str | None = None,
    platform: str | None = None,
) -> str:
    msg_id = str(uuid4())
    now = datetime.now().isoformat()
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO omni_messages
               (id, conversation_id, user_id, role, content, reply_to_id, platform, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (msg_id, conversation_id, user_id, role, content, reply_to_id, platform, now),
        )
    # Update conversation preview
    update_conversation_preview(conversation_id, content[:200], role)
    return msg_id


def delete_message(message_id: str) -> bool:
    with get_connection() as conn:
        result = conn.execute(
            "DELETE FROM omni_messages WHERE id = ?", (message_id,)
        )
        return result.rowcount > 0


def get_message(message_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM omni_messages WHERE id = ?", (message_id,)
        ).fetchone()
    return _row_to_message(row) if row else None


def add_reaction(message_id: str, emoji: str, user_id: str) -> bool:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT reactions_json FROM omni_messages WHERE id = ?", (message_id,)
        ).fetchone()
        if not row:
            return False
        reactions = {}
        if row["reactions_json"]:
            try:
                reactions = json.loads(row["reactions_json"])
            except (json.JSONDecodeError, TypeError):
                reactions = {}
        # Toggle: if user already reacted, remove; otherwise add
        if emoji in reactions:
            users = reactions[emoji]
            if user_id in users:
                users.remove(user_id)
                if not users:
                    del reactions[emoji]
            else:
                users.append(user_id)
        else:
            reactions[emoji] = [user_id]
        conn.execute(
            "UPDATE omni_messages SET reactions_json = ? WHERE id = ?",
            (json.dumps(reactions, ensure_ascii=False), message_id),
        )
        return True


# ── Contacts ───────────────────────────────────────────────────────────────

def list_contacts(user_id: str, platform: str | None = None) -> list[dict]:
    with get_connection() as conn:
        if platform:
            rows = conn.execute(
                """SELECT c.*,
                          EXISTS(SELECT 1 FROM omni_conversations
                                 WHERE user_id = c.user_id AND platform = c.platform
                                 AND external_id = c.external_id) as has_conv
                   FROM omni_contacts c
                   WHERE c.user_id = ? AND c.platform = ?
                   ORDER BY c.name ASC""",
                (user_id, platform),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT c.*,
                          EXISTS(SELECT 1 FROM omni_conversations
                                 WHERE user_id = c.user_id AND platform = c.platform
                                 AND external_id = c.external_id) as has_conv
                   FROM omni_contacts c
                   WHERE c.user_id = ?
                   ORDER BY c.platform, c.name ASC""",
                (user_id,),
            ).fetchall()

    result = []
    for r in rows:
        result.append({
            "id": r["id"],
            "sender": r["name"],
            "external_id": r["external_id"] or "",
            "avatar": r["avatar_url"] or "",
            "has_conversation": bool(r["has_conv"]),
            "channel": r["platform"],
        })
    return result


def upsert_contact(
    user_id: str,
    platform: str,
    external_id: str,
    name: str,
    avatar_url: str | None = None,
) -> str:
    contact_id = str(uuid4())
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM omni_contacts WHERE user_id = ? AND platform = ? AND external_id = ?",
            (user_id, platform, external_id),
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE omni_contacts SET name = ?, avatar_url = ? WHERE id = ?",
                (name, avatar_url, existing["id"]),
            )
            return existing["id"]
        else:
            conn.execute(
                """INSERT INTO omni_contacts (id, user_id, platform, external_id, name, avatar_url)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (contact_id, user_id, platform, external_id, name, avatar_url),
            )
            return contact_id


# ── Stats ──────────────────────────────────────────────────────────────────

def get_today_stats(user_id: str) -> dict:
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT role, COUNT(*) as cnt FROM omni_messages
               WHERE user_id = ? AND date(created_at) = date('now', 'localtime')
               GROUP BY role""",
            (user_id,),
        ).fetchall()

    sent = 0
    received = 0
    for r in rows:
        if r["role"] == "user":
            sent = r["cnt"]
        else:
            received = r["cnt"]

    # Per-conversation stats
    conv_rows = conn.execute(
        """SELECT m.conversation_id, COUNT(*) as total FROM omni_messages m
           JOIN omni_conversations c ON c.id = m.conversation_id
           WHERE m.user_id = ? AND date(m.created_at) = date('now', 'localtime')
           GROUP BY m.conversation_id
           ORDER BY total DESC LIMIT 20""",
        (user_id,),
    ).fetchall()

    by_conversation = []
    for r in conv_rows:
        by_conversation.append({
            "conversation_id": r["conversation_id"],
            "total": r["total"],
        })

    return {
        "sent": sent,
        "received": received,
        "total": sent + received,
        "by_conversation": by_conversation,
    }
