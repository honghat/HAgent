from __future__ import annotations

import json
import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from api.services.db import get_connection
from api.services.workflow_executor import execute_workflow

logger = logging.getLogger(__name__)

_started = False
_lock = threading.Lock()


def start_workflow_scheduler(poll_seconds: int = 60) -> None:
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
        try:
            from api.services.auto_fetch import run_due_auto_fetch_sources
            run_due_auto_fetch_sources()
        except Exception as exc:  # noqa: BLE001
            logger.warning("auto-fetch scheduler tick failed: %s", exc)
        time.sleep(poll_seconds)


def _load_graph(workflow_id: str) -> dict:
    with get_connection() as conn:
        node_rows = conn.execute(
            "SELECT id, type, title, config_json, position_x, position_y FROM workflow_nodes WHERE workflow_id = ?",
            (workflow_id,),
        ).fetchall()
        edge_rows = conn.execute(
            "SELECT id, from_node_id, to_node_id FROM workflow_edges WHERE workflow_id = ?",
            (workflow_id,),
        ).fetchall()
    nodes = []
    for nr in node_rows:
        try:
            config = json.loads(nr["config_json"]) if nr["config_json"] else {}
        except (TypeError, json.JSONDecodeError):
            config = {}
        nodes.append({
            "id": nr["id"],
            "type": nr["type"],
            "title": nr["title"],
            "x": nr["position_x"],
            "y": nr["position_y"],
            "config": config,
        })
    edges = [
        {"id": er["id"], "from": er["from_node_id"], "to": er["to_node_id"]}
        for er in edge_rows
    ]
    return {"nodes": nodes, "edges": edges}


def run_due_workflows(limit: int = 5) -> int:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                s.workflow_id,
                s.user_id,
                s.interval_seconds,
                w.name,
                w.description
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
        graph = _load_graph(workflow_id)
        try:
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
            try:
                from api.services.agent_events import broadcast_agent_event
                broadcast_agent_event("agent.notification", {
                    "message": f"Workflow lịch '{row['name']}' chạy xong",
                })
            except Exception:
                pass
        except Exception as exc:  # noqa: BLE001
            logger.warning("scheduled workflow %s failed: %s", workflow_id, exc)
            try:
                from api.services.agent_events import broadcast_agent_event
                broadcast_agent_event("agent.notification", {
                    "message": f"Workflow lịch '{row['name']}' lỗi: {str(exc)[:60]}",
                })
            except Exception:
                pass
        finally:
            seconds = max(60, int(row["interval_seconds"] or 7200))
            next_run_at = _next_run_at(graph, seconds)
            with get_connection() as conn:
                conn.execute(
                    """
                    UPDATE workflow_schedules
                    SET
                        last_run_at = CURRENT_TIMESTAMP,
                        next_run_at = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE workflow_id = ? AND user_id = ?
                    """,
                    (next_run_at, workflow_id, user_id),
                )
            count += 1
    return count


def _next_run_at(graph: dict, interval_seconds: int) -> str:
    schedule = graph.get("schedule") if isinstance(graph, dict) else None
    if not isinstance(schedule, dict):
        schedule = None

    if not schedule and isinstance(graph, dict):
        for node in graph.get("nodes") or []:
            if node.get("type") == "trigger" and isinstance(node.get("config"), dict):
                cfg = node["config"]
                if cfg.get("type") == "daily" or cfg.get("time"):
                    schedule = cfg
                    break

    if schedule and str(schedule.get("type") or "").lower() == "daily" and schedule.get("time"):
        tz_name = str(schedule.get("timezone") or "Asia/Ho_Chi_Minh")
        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            tz = ZoneInfo("Asia/Ho_Chi_Minh")
        time_text = str(schedule.get("time") or "09:00")
        try:
            hour_text, minute_text = time_text.split(":", 1)
            hour = max(0, min(23, int(hour_text)))
            minute = max(0, min(59, int(minute_text[:2])))
        except Exception:
            hour, minute = 9, 0

        now_local = datetime.now(tz)
        target = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if target <= now_local:
            target += timedelta(days=1)
        return target.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S+00")

    next_time = datetime.now(timezone.utc) + timedelta(seconds=max(60, int(interval_seconds or 7200)))
    return next_time.strftime("%Y-%m-%d %H:%M:%S+00")
