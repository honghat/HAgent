from __future__ import annotations

import json
import threading
from copy import deepcopy

_LOCK = threading.RLock()
_STATE: dict[str, dict] = {}


def _session_state(session_id: str) -> dict:
    with _LOCK:
        return _STATE.setdefault(session_id, {"tools": {}, "todos": []})


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


def get_workspace_state(session_id: str) -> dict:
    with _LOCK:
        state = deepcopy(_STATE.get(session_id) or {"tools": {}, "todos": []})
    return {
        "tools": list((state.get("tools") or {}).values()),
        "todos": state.get("todos") or [],
    }
