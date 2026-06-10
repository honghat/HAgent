from __future__ import annotations

import json
from uuid import uuid4

from api.services.db import get_connection


DEFAULT_GRAPH = {"nodes": [], "edges": []}


def _row_to_workflow(row) -> dict:
    item = dict(row)
    if "last_run_id" in row.keys():
        last_run_id = item.pop("last_run_id", None)
        last_run_status = item.pop("last_run_status", None)
        last_run_error = item.pop("last_run_error", None)
        last_run_started_at = item.pop("last_run_started_at", None)
        last_run_finished_at = item.pop("last_run_finished_at", None)
        item["last_run"] = (
            {
                "id": last_run_id,
                "status": last_run_status,
                "error": last_run_error,
                "started_at": last_run_started_at,
                "finished_at": last_run_finished_at,
            }
            if last_run_id
            else None
        )
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


def _save_graph(workflow_id: str, graph: dict) -> None:
    if not isinstance(graph, dict):
        return
    nodes = graph.get("nodes") if isinstance(graph.get("nodes"), list) else []
    edges = graph.get("edges") if isinstance(graph.get("edges"), list) else []
    with get_connection() as conn:
        conn.execute("DELETE FROM workflow_nodes WHERE workflow_id = ?", (workflow_id,))
        conn.execute("DELETE FROM workflow_edges WHERE workflow_id = ?", (workflow_id,))
        for node in nodes:
            conn.execute(
                """INSERT INTO workflow_nodes
                   (id, workflow_id, type, title, config_json, position_x, position_y)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    str(node.get("id", "")),
                    workflow_id,
                    str(node.get("type", "")),
                    str(node.get("title", "")),
                    json.dumps(node.get("config", {}), ensure_ascii=False),
                    float(node.get("x", 0)),
                    float(node.get("y", 0)),
                ),
            )
        for edge in edges:
            conn.execute(
                """INSERT INTO workflow_edges
                   (id, workflow_id, from_node_id, to_node_id)
                   VALUES (?, ?, ?, ?)""",
                (
                    str(edge.get("id", "")),
                    workflow_id,
                    str(edge.get("from", "")),
                    str(edge.get("to", "")),
                ),
            )
        conn.execute(
            "UPDATE workflows SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (workflow_id,),
        )


def list_workflows(user_id: str) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                w.id,
                w.user_id,
                w.name,
                w.description,
                w.created_at,
                w.updated_at,
                (
                    SELECT r.id
                    FROM workflow_runs r
                    WHERE r.workflow_id = w.id AND r.user_id = w.user_id
                    ORDER BY r.started_at DESC
                    LIMIT 1
                ) AS last_run_id,
                (
                    SELECT r.status
                    FROM workflow_runs r
                    WHERE r.workflow_id = w.id AND r.user_id = w.user_id
                    ORDER BY r.started_at DESC
                    LIMIT 1
                ) AS last_run_status,
                (
                    SELECT r.error
                    FROM workflow_runs r
                    WHERE r.workflow_id = w.id AND r.user_id = w.user_id
                    ORDER BY r.started_at DESC
                    LIMIT 1
                ) AS last_run_error,
                (
                    SELECT r.started_at
                    FROM workflow_runs r
                    WHERE r.workflow_id = w.id AND r.user_id = w.user_id
                    ORDER BY r.started_at DESC
                    LIMIT 1
                ) AS last_run_started_at,
                (
                    SELECT r.finished_at
                    FROM workflow_runs r
                    WHERE r.workflow_id = w.id AND r.user_id = w.user_id
                    ORDER BY r.started_at DESC
                    LIMIT 1
                ) AS last_run_finished_at
            FROM workflows w
            WHERE w.user_id = ?
            ORDER BY updated_at DESC
            """,
            (user_id,),
        ).fetchall()
    items = [_row_to_workflow(row) for row in rows]
    for item in items:
        item["graph"] = _load_graph(item["id"])
    with get_connection() as conn:
        schedule_rows = conn.execute(
            "SELECT workflow_id, enabled, interval_seconds, last_run_at, next_run_at FROM workflow_schedules WHERE user_id = ?",
            (user_id,),
        ).fetchall()
    schedule_map = {}
    for srow in schedule_rows:
        schedule_map[srow[0]] = _row_to_schedule(srow)
    for item in items:
        item["schedule"] = schedule_map.get(item["id"])
    return items


def get_workflow(workflow_id: str, user_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, user_id, name, description, created_at, updated_at FROM workflows WHERE id = ? AND user_id = ?",
            (workflow_id, user_id),
        ).fetchone()
    if not row:
        return None
    item = _row_to_workflow(row)
    item["graph"] = _load_graph(workflow_id)
    with get_connection() as conn:
        schedule = conn.execute(
            "SELECT enabled, interval_seconds, last_run_at, next_run_at FROM workflow_schedules WHERE workflow_id = ? AND user_id = ?",
            (workflow_id, user_id),
        ).fetchone()
    item["schedule"] = _row_to_schedule(schedule)
    return item


def create_workflow(user_id: str, name: str, description: str = "", graph=None) -> dict:
    workflow_id = str(uuid4())
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO workflows (id, user_id, name, description) VALUES (?, ?, ?, ?)",
            (workflow_id, user_id, name, description or ""),
        )
    if graph:
        _save_graph(workflow_id, graph)
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
    if fields:
        fields.append("updated_at = CURRENT_TIMESTAMP")
        params.extend([workflow_id, user_id])
        with get_connection() as conn:
            conn.execute(
                f"UPDATE workflows SET {', '.join(fields)} WHERE id = ? AND user_id = ?",
                params,
            )
    if "graph" in updates:
        _save_graph(workflow_id, updates["graph"])
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
