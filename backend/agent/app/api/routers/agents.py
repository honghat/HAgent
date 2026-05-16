"""Agents router — full CRUD for agent profiles + agent todos."""

import json
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request

from api.services.db import get_connection
from api.services.wiki_memory import resolve_user_id

router = APIRouter(tags=["agents"])

NAME_PATTERN = r"^[A-Za-z0-9-]+$"


def _uid(request: Request) -> str:
    return resolve_user_id(request.headers.get("authorization"))


def _fmt(row: dict) -> dict:
    def pj(val):
        if not val:
            return None
        if isinstance(val, str):
            try:
                return json.loads(val)
            except (json.JSONDecodeError, TypeError):
                return None
        return val
    return {
        "id": row["id"], "name": row["name"],
        "description": row["description"] or "",
        "model": row["model"] or "lmstudio",
        "soul": row["soul_content"] or "",
        "tool_groups": pj(row["tool_groups"]),
        "skills": pj(row["skills"]),
        "is_public": bool(row["is_public"]),
        "is_active": bool(row["is_active"]),
        "auto_start": bool(row["auto_start"]),
        "last_run_at": row.get("last_run_at"),
        "interval_seconds": row["interval_seconds"] or 300,
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


@router.get("/agents")
def list_agents(request: Request):
    uid = _uid(request)
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM agents WHERE user_id = ? OR is_public = 1 ORDER BY updated_at DESC",
            (uid,),
        ).fetchall()
        todos = conn.execute(
            "SELECT agent_id, COUNT(*) as c FROM agent_todos WHERE status = 'pending' GROUP BY agent_id"
        ).fetchall()
    count_map = {r["agent_id"]: r["c"] for r in todos}
    agents = []
    for r in rows:
        a = _fmt(dict(r))
        a["pending_todos"] = count_map.get(r["id"], 0)
        agents.append(a)
    return agents


@router.get("/agents/check")
def check_agent_name(request: Request, name: str = ""):
    import re
    if not name or not re.match(NAME_PATTERN, name):
        raise HTTPException(status_code=422, detail="Invalid name. Use letters, digits, and hyphens only.")
    normalized = name.lower()
    uid = _uid(request)
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM agents WHERE LOWER(name) = ? AND user_id = ?",
            (normalized, uid),
        ).fetchone()
    return {"available": not existing, "name": normalized}


@router.get("/agents/{agent_id}")
def get_agent(agent_id: str, request: Request):
    uid = _uid(request)
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM agents WHERE id = ? AND (user_id = ? OR is_public = 1)",
            (agent_id, uid),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _fmt(dict(row))


@router.post("/agents")
def create_agent(request: Request, body: dict):
    import re
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not re.match(NAME_PATTERN, name):
        raise HTTPException(status_code=422, detail="Invalid name. Use letters, digits, and hyphens only.")
    uid = _uid(request)
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM agents WHERE LOWER(name) = ? AND user_id = ?",
            (name.lower(), uid),
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Agent name already exists")
        aid = str(uuid4())
        conn.execute(
            """INSERT INTO agents (id, user_id, name, description, model, soul_content, tool_groups, skills, auto_start, interval_seconds)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (aid, uid, name, body.get("description", ""), body.get("model", "lmstudio"),
             body.get("soul", ""),
             json.dumps(body.get("tool_groups", [])),
             json.dumps(body.get("skills", [])),
             1 if body.get("auto_start") else 0,
             body.get("interval_seconds", 300)),
        )
        row = conn.execute("SELECT * FROM agents WHERE id = ?", (aid,)).fetchone()
    return _fmt(dict(row))


@router.put("/agents/{agent_id}")
def update_agent(agent_id: str, request: Request, body: dict):
    uid = _uid(request)
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT * FROM agents WHERE id = ? AND user_id = ?", (agent_id, uid)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Agent not found or unauthorized")
        updates, params = [], []
        for f in ("name", "description", "model", "interval_seconds"):
            if f in body:
                updates.append(f"{f} = ?")
                params.append(body[f])
        for jf in ("tool_groups", "skills"):
            if jf in body:
                updates.append(f"{jf} = ?")
                params.append(json.dumps(body[jf]))
        if "soul" in body:
            updates.append("soul_content = ?")
            params.append(body["soul"])
        if "auto_start" in body:
            updates.append("auto_start = ?")
            params.append(1 if body["auto_start"] else 0)
        if updates:
            updates.append("updated_at = datetime('now')")
            params.extend([agent_id, uid])
            conn.execute(f"UPDATE agents SET {', '.join(updates)} WHERE id = ? AND user_id = ?", params)
        row = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
    return _fmt(dict(row))


@router.delete("/agents/{agent_id}")
def delete_agent(agent_id: str, request: Request):
    uid = _uid(request)
    with get_connection() as conn:
        cur = conn.execute("DELETE FROM agents WHERE id = ? AND user_id = ?", (agent_id, uid))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Agent not found or unauthorized")
    return {"success": True}


@router.post("/agents/{agent_id}/toggle-active")
def toggle_agent(agent_id: str, request: Request):
    """Toggle agent active state."""
    uid = _uid(request)
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM agents WHERE id = ? AND user_id = ?", (agent_id, uid)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Agent not found")
    return {"ok": True, "message": "Agent worker control delegated to Python agent"}


@router.get("/agents/workers/status")
def list_workers(request: Request):
    """List all agent workers (admin)."""
    return []


# ── Agent Todos ──

@router.get("/agents/{agent_id}/todos")
def list_todos(agent_id: str, request: Request):
    with get_connection() as conn:
        todos = conn.execute(
            "SELECT * FROM agent_todos WHERE agent_id = ? ORDER BY created_at ASC",
            (agent_id,),
        ).fetchall()
    return [dict(r) for r in todos]


@router.post("/agents/{agent_id}/todos")
def create_todo(agent_id: str, request: Request, body: dict):
    content = body.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Todo content required")
    tid = str(uuid4())
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO agent_todos (id, agent_id, content) VALUES (?, ?, ?)",
            (tid, agent_id, content),
        )
        todo = conn.execute("SELECT * FROM agent_todos WHERE id = ?", (tid,)).fetchone()
    return dict(todo)


@router.put("/agents/{agent_id}/todos/{todo_id}")
def update_todo(agent_id: str, todo_id: str, request: Request, body: dict):
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT * FROM agent_todos WHERE id = ? AND agent_id = ?",
            (todo_id, agent_id),
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Todo not found")
        if "content" in body:
            conn.execute("UPDATE agent_todos SET content = ?, updated_at = datetime('now') WHERE id = ?",
                         (body["content"], todo_id))
        if "status" in body:
            conn.execute("UPDATE agent_todos SET status = ?, updated_at = datetime('now') WHERE id = ?",
                         (body["status"], todo_id))
        todo = conn.execute("SELECT * FROM agent_todos WHERE id = ?", (todo_id,)).fetchone()
    return dict(todo)


@router.delete("/agents/{agent_id}/todos/{todo_id}")
def delete_todo(agent_id: str, todo_id: str, request: Request):
    with get_connection() as conn:
        cur = conn.execute("DELETE FROM agent_todos WHERE id = ? AND agent_id = ?", (todo_id, agent_id))
    return {"deleted": cur.rowcount > 0}
