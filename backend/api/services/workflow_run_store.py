from __future__ import annotations

import json
from uuid import uuid4

from api.services.db import get_connection


def _loads(raw, fallback=None):
    if raw in (None, ""):
        return fallback
    try:
        return json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return fallback


def _row_to_run(row, *, include_steps: bool = False) -> dict | None:
    if not row:
        return None
    item = dict(row)
    item["input"] = _loads(item.pop("input_json"), {})
    item["output"] = _loads(item.pop("output_json"), None)
    if include_steps:
        item["steps"] = list_run_steps(item["id"])
        item["artifacts"] = list_run_artifacts(item["id"], item["user_id"])
    return item


def _row_to_step(row) -> dict:
    item = dict(row)
    item["input"] = _loads(item.pop("input_json"), None)
    item["output"] = _loads(item.pop("output_json"), None)
    return item


def create_run(workflow_id: str, user_id: str, input_payload: dict) -> dict:
    run_id = str(uuid4())
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO workflow_runs (id, workflow_id, user_id, input_json)
            VALUES (?, ?, ?, ?)
            """,
            (run_id, workflow_id, user_id, json.dumps(input_payload)),
        )
    return get_run(run_id, user_id)


def finish_run(run_id: str, user_id: str, status: str, output=None, error: str | None = None) -> dict | None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE workflow_runs
            SET status = ?, output_json = ?, error = ?, finished_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
            """,
            (status, json.dumps(output) if output is not None else None, error, run_id, user_id),
        )
    return get_run(run_id, user_id, include_steps=True)


def get_run(run_id: str, user_id: str, *, include_steps: bool = False) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id, workflow_id, user_id, status, input_json, output_json, error, started_at, finished_at
            FROM workflow_runs
            WHERE id = ? AND user_id = ?
            """,
            (run_id, user_id),
        ).fetchone()
    return _row_to_run(row, include_steps=include_steps)


def list_runs(workflow_id: str, user_id: str, limit: int = 30) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, workflow_id, user_id, status, input_json, output_json, error, started_at, finished_at
            FROM workflow_runs
            WHERE workflow_id = ? AND user_id = ?
            ORDER BY started_at DESC
            LIMIT ?
            """,
            (workflow_id, user_id, max(1, min(limit, 100))),
        ).fetchall()
    return [_row_to_run(row) for row in rows]


def start_step(run_id: str, node: dict, input_payload) -> str:
    step_id = str(uuid4())
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO workflow_run_steps
            (id, run_id, node_id, node_type, node_title, status, input_json)
            VALUES (?, ?, ?, ?, ?, 'running', ?)
            """,
            (
                step_id,
                run_id,
                str(node.get("id") or ""),
                str(node.get("type") or ""),
                str(node.get("title") or ""),
                json.dumps(input_payload),
            ),
        )
    return step_id


def finish_step(step_id: str, status: str, output=None, error: str | None = None) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE workflow_run_steps
            SET status = ?, output_json = ?, error = ?, finished_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (status, json.dumps(output) if output is not None else None, error, step_id),
        )


def list_run_steps(run_id: str) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, run_id, node_id, node_type, node_title, status,
                   input_json, output_json, error, started_at, finished_at
            FROM workflow_run_steps
            WHERE run_id = ?
            ORDER BY started_at ASC, rowid ASC
            """,
            (run_id,),
        ).fetchall()
    return [_row_to_step(row) for row in rows]


def save_artifact(run_id: str, workflow_id: str, user_id: str, node_id: str, payload) -> dict:
    artifact_id = str(uuid4())
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO workflow_artifacts (id, run_id, workflow_id, user_id, node_id, payload_json)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (artifact_id, run_id, workflow_id, user_id, node_id, json.dumps(payload)),
        )
    return {"id": artifact_id, "payload": payload}


def list_run_artifacts(run_id: str, user_id: str) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, run_id, workflow_id, user_id, node_id, payload_json, created_at
            FROM workflow_artifacts
            WHERE run_id = ? AND user_id = ?
            ORDER BY created_at ASC, rowid ASC
            """,
            (run_id, user_id),
        ).fetchall()
    artifacts = []
    for row in rows:
        item = dict(row)
        item["payload"] = _loads(item.pop("payload_json"), None)
        artifacts.append(item)
    return artifacts


def delete_artifact(artifact_id: str, workflow_id: str, user_id: str) -> bool:
    with get_connection() as conn:
        cursor = conn.execute(
            """
            DELETE FROM workflow_artifacts
            WHERE id = ? AND workflow_id = ? AND user_id = ?
            """,
            (artifact_id, workflow_id, user_id),
        )
        return cursor.rowcount > 0
