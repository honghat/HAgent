from __future__ import annotations

import json
import threading
from copy import deepcopy

from api.services.db import get_connection

_LOCK = threading.RLock()
_STATE: dict[str, dict] = {}


def _session_state(session_id: str) -> dict:
    with _LOCK:
        return _STATE.setdefault(session_id, {"tools": {}, "todos": _load_session_todos(session_id)})


def record_tool(session_id: str, name: str, label: str | None = None, status: str = "info") -> None:
    if not session_id or not name:
        return
    with _LOCK:
        state = _session_state(session_id)
        current = state["tools"].get(name, {})
        state["tools"][name] = {
            "name": name,
            "desc": current.get("desc") or label or name,
            "status": status,
        }


def record_tool_result(session_id: str, name: str, args: dict | None, result) -> None:
    record_tool(session_id, name, status="done")
    if name != "todo":
        return
    payload = result
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return
    if not isinstance(payload, dict):
        return
    todos = payload.get("todos")
    if not isinstance(todos, list):
        return
    normalized = []
    for item in todos:
        if not isinstance(item, dict):
            continue
        normalized.append(
            {
                "id": str(item.get("id") or len(normalized) + 1),
                "content": str(item.get("content") or ""),
                "status": str(item.get("status") or "pending"),
            }
        )
    with _LOCK:
        _session_state(session_id)["todos"] = normalized
    _persist_session_todos(session_id, normalized)


def get_workspace_state(session_id: str) -> dict:
    with _LOCK:
        existing = _STATE.get(session_id)
        state = deepcopy(existing or {"tools": {}, "todos": _load_session_todos(session_id)})
    return {
        "tools": list((state.get("tools") or {}).values()),
        "todos": state.get("todos") or [],
    }


def _persist_session_todos(session_id: str, todos: list[dict]) -> None:
    if not session_id:
        return
    try:
        with get_connection() as conn:
            conn.execute("DELETE FROM session_todos WHERE session_id = ?", (session_id,))
            for todo in todos:
                todo_id = str(todo.get("id") or "").strip() or str(len(todos) + 1)
                conn.execute(
                    """
                    INSERT INTO session_todos (id, session_id, content, status)
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        f"{session_id}:{todo_id}",
                        session_id,
                        str(todo.get("content") or ""),
                        str(todo.get("status") or "pending"),
                    ),
                )
    except Exception:
        pass


def _load_session_todos(session_id: str) -> list[dict]:
    if not session_id:
        return []
    try:
        with get_connection() as conn:
            rows = conn.execute(
                """
                SELECT id, content, status
                FROM session_todos
                WHERE session_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (session_id,),
            ).fetchall()
    except Exception:
        return []
    prefix = f"{session_id}:"
    return [
        {
            "id": str(row["id"])[len(prefix):] if str(row["id"]).startswith(prefix) else str(row["id"]),
            "content": row["content"],
            "status": row["status"],
        }
        for row in rows
    ]
