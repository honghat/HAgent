"""Chat event bus — SSE-based real-time notification for chat UI."""

from __future__ import annotations

import json
import queue
import threading
import time
from typing import Any


_chat_listeners: list[queue.Queue] = []
_chat_listeners_lock = threading.Lock()


def broadcast_chat_event(event_type: str, data: dict[str, Any]) -> None:
    event = {"type": event_type, **data}
    with _chat_listeners_lock:
        dead: list[queue.Queue] = []
        for q in _chat_listeners:
            try:
                q.put_nowait(event)
            except Exception:
                dead.append(q)
        for q in dead:
            _chat_listeners.remove(q)


def register_listener() -> queue.Queue:
    q: queue.Queue = queue.Queue()
    with _chat_listeners_lock:
        _chat_listeners.append(q)
    return q


def unregister_listener(q: queue.Queue) -> None:
    with _chat_listeners_lock:
        if q in _chat_listeners:
            _chat_listeners.remove(q)
