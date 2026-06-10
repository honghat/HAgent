"""In-memory per-user queue of URLs the agent wants to show the user.

Frontend polls /api/media/pending and opens each item in a new tab, then
acks the ID so it's removed from the queue.
"""

from __future__ import annotations
import threading
import time
import uuid
from typing import Dict, List

_lock = threading.Lock()
_queues: Dict[str, List[dict]] = {}
_MAX_PER_USER = 50


def push(user_id: str, url: str, title: str = "", kind: str = "url") -> dict:
    if not user_id or not url:
        raise ValueError("user_id and url are required")
    item = {
        "id": uuid.uuid4().hex[:12],
        "url": url,
        "title": title or url,
        "kind": kind,
        "created_at": time.time(),
    }
    with _lock:
        q = _queues.setdefault(user_id, [])
        q.append(item)
        if len(q) > _MAX_PER_USER:
            del q[: len(q) - _MAX_PER_USER]
    return item


def pending(user_id: str) -> List[dict]:
    with _lock:
        return list(_queues.get(user_id, []))


def ack(user_id: str, item_id: str) -> bool:
    with _lock:
        q = _queues.get(user_id)
        if not q:
            return False
        for i, it in enumerate(q):
            if it["id"] == item_id:
                del q[i]
                return True
    return False


def clear(user_id: str) -> int:
    with _lock:
        q = _queues.pop(user_id, None)
        return len(q) if q else 0
