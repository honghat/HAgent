"""Simple goals API for Telegram bot and other clients."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(tags=["goals"])


class GoalRequest(BaseModel):
    goal: str


def _load_goals():
    """Load goals from session state."""
    import sqlite3
    from pathlib import Path
    try:
        from api.services.db import DB_PATH
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        conn.execute("CREATE TABLE IF NOT EXISTS state_meta (key TEXT PRIMARY KEY, value TEXT)")
        c = conn.cursor()
        c.execute("SELECT value FROM state_meta WHERE key = 'goals'")
        row = c.fetchone()
        conn.close()
        if row:
            import json
            return json.loads(row["value"])
    except Exception:
        pass
    return []


def _save_goals(goals):
    import sqlite3
    import json
    from api.services.db import DB_PATH
    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.execute("CREATE TABLE IF NOT EXISTS state_meta (key TEXT PRIMARY KEY, value TEXT)")
        c = conn.cursor()
        c.execute(
            "INSERT OR REPLACE INTO state_meta (key, value) VALUES (?, ?)",
            ("goals", json.dumps(goals, ensure_ascii=False)),
        )
        conn.commit()
        conn.close()
        return True
    except Exception:
        return False


@router.get("/api/goals")
def list_goals():
    return _load_goals()


@router.post("/api/goals")
def set_goal(req: GoalRequest):
    goals = _load_goals()
    new_goal = {"id": len(goals) + 1, "title": req.goal, "done": False}
    goals.append(new_goal)
    if _save_goals(goals):
        return new_goal
    raise HTTPException(status_code=500, detail="Failed to save goal")


@router.delete("/api/goals")
def clear_goals():
    if _save_goals([]):
        return {"ok": True}
    raise HTTPException(status_code=500, detail="Failed to clear goals")


@router.post("/api/goals/resume")
def resume_goals():
    goals = _load_goals()
    if goals:
        return {"ok": True, "goal": goals[-1]}
    raise HTTPException(status_code=404, detail="No goals to resume")
