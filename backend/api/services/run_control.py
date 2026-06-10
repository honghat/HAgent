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
    agent: object | None = None
    pending_steer: str = ""
    agent_started: bool = False
    agent_finished: bool = False


_ACTIVE_RUNS: dict[str, RunState] = {}
_LOCK = Lock()


def mark_running(session_id: str) -> None:
    with _LOCK:
        _ACTIVE_RUNS[session_id] = RunState(session_id=session_id, started_at=time())
    set_session_status(session_id, "busy")


def stop_session(session_id: str) -> bool:
    agent = None
    with _LOCK:
        run = _ACTIVE_RUNS.get(session_id)
        if run:
            run.stop_requested = True
            agent = run.agent
        else:
            set_session_status(session_id, "idle")
            return False
    if agent is not None:
        try:
            interrupt = getattr(agent, "interrupt", None)
            if callable(interrupt):
                interrupt("Xử lý đã bị dừng theo yêu cầu của người dùng.")
        except Exception:
            pass
    return True


def steer_session(session_id: str, text: str) -> bool:
    cleaned = (text or "").strip()
    if not cleaned:
        return False
    with _LOCK:
        run = _ACTIVE_RUNS.get(session_id)
        agent = run.agent if run else None
        if run and agent is None and not run.agent_finished:
            run.pending_steer = f"{run.pending_steer}\n{cleaned}".strip()
            return True
    if agent is None:
        return False
    steer = getattr(agent, "steer", None)
    if not callable(steer):
        return False
    try:
        return bool(steer(cleaned))
    except Exception:
        return False


def attach_agent(session_id: str, agent: object | None) -> None:
    pending = ""
    with _LOCK:
        run = _ACTIVE_RUNS.get(session_id)
        if run:
            run.agent = agent
            if agent is not None:
                run.agent_started = True
                run.agent_finished = False
                if run.pending_steer:
                    pending = run.pending_steer
                    run.pending_steer = ""
            elif run.agent_started:
                run.agent_finished = True
    if agent is not None and pending:
        steer = getattr(agent, "steer", None)
        if callable(steer):
            try:
                steer(pending)
            except Exception:
                pass


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
