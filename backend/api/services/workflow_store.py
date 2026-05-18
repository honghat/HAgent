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
    return {
        "nodes": nodes if isinstance(nodes, list) else [],
        "edges": edges if isinstance(edges, list) else [],
    }


def _row_to_workflow(row) -> dict:
    item = dict(row)
    try:
        item["graph"] = _normalize_graph(json.loads(item.pop("graph_json")))
    except (TypeError, json.JSONDecodeError):
        item["graph"] = DEFAULT_GRAPH.copy()
        item.pop("graph_json", None)
    return item


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
    return _row_to_workflow(row) if row else None


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
