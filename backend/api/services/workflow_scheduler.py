from __future__ import annotations

import json
import logging
import threading
import time

from api.services.db import get_connection
from api.services.workflow_executor import execute_workflow
from api.services.workflow_store import DEFAULT_GRAPH

logger = logging.getLogger(__name__)

_started = False
_lock = threading.Lock()


def start_workflow_scheduler(poll_seconds: int = 60) -> None:
    """Start a tiny in-process scheduler for active workflow schedules."""
    global _started
    with _lock:
        if _started:
            return
        _started = True

    thread = threading.Thread(
        target=_loop,
        args=(max(15, int(poll_seconds or 60)),),
        name="hagent-workflow-scheduler",
        daemon=True,
    )
    thread.start()


def _loop(poll_seconds: int) -> None:
    while True:
        try:
            run_due_workflows()
        except Exception as exc:  # noqa: BLE001
            logger.warning("workflow scheduler tick failed: %s", exc)
        time.sleep(poll_seconds)


def run_due_workflows(limit: int = 5) -> int:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                s.workflow_id,
                s.user_id,
                s.interval_seconds,
                w.name,
                w.description,
                w.graph_json
            FROM workflow_schedules s
            JOIN workflows w ON w.id = s.workflow_id AND w.user_id = s.user_id
            WHERE s.enabled = 1
              AND (s.next_run_at IS NULL OR s.next_run_at <= datetime('now'))
            ORDER BY COALESCE(s.next_run_at, '1970-01-01') ASC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    count = 0
    for row in rows:
        workflow_id = row["workflow_id"]
        user_id = row["user_id"]
        try:
            graph = json.loads(row["graph_json"] or "{}")
            if not isinstance(graph, dict):
                graph = DEFAULT_GRAPH.copy()
            workflow = {
                "id": workflow_id,
                "user_id": user_id,
                "name": row["name"],
                "description": row["description"] or "",
                "graph": graph,
            }
            execute_workflow(
                workflow,
                user_id,
                {
                    "scheduled": True,
                    "workflow_id": workflow_id,
                    "workflow_name": row["name"],
                },
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("scheduled workflow %s failed: %s", workflow_id, exc)
        finally:
            seconds = max(60, int(row["interval_seconds"] or 7200))
            with get_connection() as conn:
                conn.execute(
                    """
                    UPDATE workflow_schedules
                    SET
                        last_run_at = CURRENT_TIMESTAMP,
                        next_run_at = datetime('now', '+' || ? || ' seconds'),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE workflow_id = ? AND user_id = ?
                    """,
                    (seconds, workflow_id, user_id),
                )
            count += 1
    return count
