"""Agent event bus — SSE-based real-time data push từ agent xuống mọi frontend tab.

Dùng:
    from api.services.agent_events import broadcast_agent_event

    broadcast_agent_event("agent.data", {
        "tab": "jobs",
        "payload": [...],
    })

Event types:
    agent.message      — agent đang trả lời chat
    agent.tool_call    — agent đang gọi tool
    agent.data         — agent push data cho tab cụ thể (jobs, video, system...)
    agent.notification — thông báo toàn cục
    agent.progress     — tiến độ tác vụ (0-100)
"""

from __future__ import annotations

import json
import queue
import threading
import time
from typing import Any


_listeners: list[queue.Queue] = []
_lock = threading.Lock()


def broadcast_agent_event(event_type: str, data: dict[str, Any]) -> None:
    """Push event tới tất cả frontend client đang subscribe /api/agent/stream."""
    event = {"type": event_type, "ts": time.time(), **data}
    with _lock:
        dead: list[queue.Queue] = []
        for q in _listeners:
            try:
                q.put_nowait(event)
            except Exception:
                dead.append(q)
        for q in dead:
            _listeners.remove(q)


def register_listener() -> queue.Queue:
    """Đăng ký 1 SSE client mới, trả về queue riêng của client đó."""
    q: queue.Queue = queue.Queue(maxsize=100)
    with _lock:
        _listeners.append(q)
    return q


def unregister_listener(q: queue.Queue) -> None:
    """Huỷ đăng ký khi client ngắt kết nối."""
    with _lock:
        if q in _listeners:
            _listeners.remove(q)


def listener_count() -> int:
    """Số client đang kết nối."""
    with _lock:
        return len(_listeners)
