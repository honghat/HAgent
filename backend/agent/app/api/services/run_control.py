from __future__ import annotations

from dataclasses import dataclass
from threading import Lock
from time import time

from api.services.session_store import set_session_status


@dataclass
class RunState:
    session_id: str
    started_at: float
    stop_requested: bool = False


_ACTIVE_RUNS: dict[str, RunState] = {}
_LOCK = Lock()


def mark_running(session_id: str) -> None:
    with _LOCK:
        _ACTIVE_RUNS[session_id] = RunState(session_id=session_id, started_at=time())
    set_session_status(session_id, "busy")


def stop_session(session_id: str) -> bool:
    with _LOCK:
        run = _ACTIVE_RUNS.get(session_id)
        if run:
            run.stop_requested = True
            return True
    set_session_status(session_id, "idle")
    return False


def finish_session(session_id: str) -> None:
    with _LOCK:
        _ACTIVE_RUNS.pop(session_id, None)
    set_session_status(session_id, "idle")


def is_running(session_id: str) -> bool:
    with _LOCK:
        return session_id in _ACTIVE_RUNS


def is_stop_requested(session_id: str) -> bool:
    with _LOCK:
        run = _ACTIVE_RUNS.get(session_id)
        return bool(run and run.stop_requested)
