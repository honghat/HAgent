from __future__ import annotations

import json
import sqlite3
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[5]
HAGENT_DB_PATH = PROJECT_ROOT / "data" / "hagent.db"


def _parse_json(value):
    if not value:
        return []
    if isinstance(value, list):
        return value
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def _format_agent(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"] or "",
        "model": row["model"] or "",
        "soul": row["soul_content"] or "",
        "tool_groups": _parse_json(row["tool_groups"]),
        "skills": _parse_json(row["skills"]),
        "is_public": bool(row["is_public"]),
        "is_active": bool(row["is_active"]) if "is_active" in row.keys() else False,
        "auto_start": bool(row["auto_start"]) if "auto_start" in row.keys() else False,
        "last_run_at": row["last_run_at"] if "last_run_at" in row.keys() else None,
        "interval_seconds": row["interval_seconds"] if "interval_seconds" in row.keys() else 300,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def get_agent_profile(agent_id: str | None) -> dict | None:
    if not agent_id or not HAGENT_DB_PATH.exists():
        return None
    with sqlite3.connect(HAGENT_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
        return _format_agent(row) if row else None


def list_agent_profiles(user_id: str) -> list[dict]:
    if not HAGENT_DB_PATH.exists():
        return []
    with sqlite3.connect(HAGENT_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM agents WHERE user_id = ? OR is_public = 1 ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()
        return [_format_agent(row) for row in rows]
