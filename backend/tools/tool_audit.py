"""Append-only JSONL audit trail for agent tool dispatches."""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from hagent_constants import get_logs_home


_AUDIT_LOCK = threading.Lock()
_PREVIEW_LIMIT = 500


def is_tool_audit_enabled() -> bool:
    """Return whether tool audit logging should write JSONL rows."""
    raw = os.environ.get("HAGENT_TOOL_AUDIT", "1").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def get_tool_audit_path() -> Path:
    """Return the tool audit JSONL path under the centralized logs dir."""
    override = os.environ.get("HAGENT_TOOL_AUDIT_PATH", "").strip()
    if override:
        return Path(override).expanduser()
    return get_logs_home() / "tool_audit.jsonl"


def _redact_preview(value: Any, limit: int = _PREVIEW_LIMIT) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)
    except Exception:
        text = str(value)
    try:
        from agent.redact import redact_sensitive_text
        text = redact_sensitive_text(text)
    except Exception:
        pass
    if len(text) > limit:
        return text[:limit] + "...[truncated]"
    return text


def append_tool_audit(
    *,
    phase: str,
    tool_name: str,
    toolset: str = "",
    task_id: str = "",
    session_id: str = "",
    tool_call_id: str = "",
    duration_ms: int | None = None,
    args: Any = None,
    result: Any = None,
    error: str = "",
) -> None:
    """Append one redacted tool audit row.

    Audit failures are intentionally swallowed by callers; this helper may
    still raise if filesystem access fails, so call through ``safe_append``.
    """
    if not is_tool_audit_enabled():
        return

    row = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "phase": phase,
        "tool_name": tool_name,
        "toolset": toolset,
        "task_id": task_id,
        "session_id": session_id,
        "tool_call_id": tool_call_id,
    }
    if duration_ms is not None:
        row["duration_ms"] = int(duration_ms)
    if args is not None:
        row["args_preview"] = _redact_preview(args)
    if result is not None:
        row["result_preview"] = _redact_preview(result)
    if error:
        row["error"] = _redact_preview(error, limit=300)

    path = get_tool_audit_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n"
    with _AUDIT_LOCK:
        with path.open("a", encoding="utf-8") as fh:
            fh.write(line)


def safe_append_tool_audit(**kwargs: Any) -> None:
    """Best-effort wrapper used from hot dispatch paths."""
    try:
        append_tool_audit(**kwargs)
    except Exception:
        pass
