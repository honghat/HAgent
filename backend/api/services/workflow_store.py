from __future__ import annotations

import json
from uuid import uuid4

from api.services.db import get_connection


DEFAULT_GRAPH = {"nodes": [], "edges": []}


def _normalize_graph(graph) -> dict:
    if not isinstance(graph, dict):
        return DEFAULT_GRAPH.copy()
    nodes = graph.get("nodes")
    edges = graph.get("edges")
    normalized = {
        "nodes": nodes if isinstance(nodes, list) else [],
        "edges": edges if isinstance(edges, list) else [],
    }
    if isinstance(graph.get("schedule"), dict):
        normalized["schedule"] = graph["schedule"]
    if isinstance(graph.get("settings"), dict):
        normalized["settings"] = graph["settings"]
    return normalized


def _row_to_workflow(row) -> dict:
    item = dict(row)
    try:
        item["graph"] = _normalize_graph(json.loads(item.pop("graph_json")))
    except (TypeError, json.JSONDecodeError):
        item["graph"] = DEFAULT_GRAPH.copy()
        item.pop("graph_json", None)
    return item


def _row_to_schedule(row) -> dict | None:
    if not row:
        return None
    return {
        "enabled": bool(row["enabled"]),
        "interval_seconds": int(row["interval_seconds"] or 7200),
        "last_run_at": row["last_run_at"],
        "next_run_at": row["next_run_at"],
    }


def list_workflows(user_id: str) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, user_id, name, description, graph_json, created_at, updated_at
            FROM workflows
            WHERE user_id = ?
            ORDER BY updated_at DESC
            """,
            (user_id,),
        ).fetchall()
    return [_row_to_workflow(row) for row in rows]


def get_workflow(workflow_id: str, user_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id, user_id, name, description, graph_json, created_at, updated_at
            FROM workflows
            WHERE id = ? AND user_id = ?
            """,
            (workflow_id, user_id),
        ).fetchone()
    if not row:
        return None
    item = _row_to_workflow(row)
    with get_connection() as conn:
        schedule = conn.execute(
            """
            SELECT enabled, interval_seconds, last_run_at, next_run_at
            FROM workflow_schedules
            WHERE workflow_id = ? AND user_id = ?
            """,
            (workflow_id, user_id),
        ).fetchone()
    item["schedule"] = _row_to_schedule(schedule)
    return item


def create_workflow(user_id: str, name: str, description: str = "", graph=None) -> dict:
    workflow_id = str(uuid4())
    normalized_graph = _normalize_graph(graph)
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO workflows (id, user_id, name, description, graph_json)
            VALUES (?, ?, ?, ?, ?)
            """,
            (workflow_id, user_id, name, description, json.dumps(normalized_graph)),
        )
    return get_workflow(workflow_id, user_id)


def update_workflow(workflow_id: str, user_id: str, updates: dict) -> dict | None:
    fields = []
    params = []
    if "name" in updates:
        fields.append("name = ?")
        params.append(str(updates["name"]).strip())
    if "description" in updates:
        fields.append("description = ?")
        params.append(str(updates["description"] or ""))
    if "graph" in updates:
        fields.append("graph_json = ?")
        params.append(json.dumps(_normalize_graph(updates["graph"])))
    if not fields:
        return get_workflow(workflow_id, user_id)
    fields.append("updated_at = CURRENT_TIMESTAMP")
    params.extend([workflow_id, user_id])
    with get_connection() as conn:
        conn.execute(
            f"UPDATE workflows SET {', '.join(fields)} WHERE id = ? AND user_id = ?",
            params,
        )
    return get_workflow(workflow_id, user_id)


def delete_workflow(workflow_id: str, user_id: str) -> bool:
    with get_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM workflows WHERE id = ? AND user_id = ?",
            (workflow_id, user_id),
        )
        return cursor.rowcount > 0


def upsert_workflow_schedule(
    workflow_id: str,
    user_id: str,
    *,
    enabled: bool,
    interval_seconds: int = 7200,
    next_run_at: str | None = None,
) -> None:
    seconds = max(60, int(interval_seconds or 7200))
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO workflow_schedules (workflow_id, user_id, enabled, interval_seconds, next_run_at)
            VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')))
            ON CONFLICT(workflow_id) DO UPDATE SET
                enabled = excluded.enabled,
                interval_seconds = excluded.interval_seconds,
                next_run_at = COALESCE(excluded.next_run_at, workflow_schedules.next_run_at, datetime('now')),
                updated_at = CURRENT_TIMESTAMP
            """,
            (workflow_id, user_id, 1 if enabled else 0, seconds, next_run_at),
        )
