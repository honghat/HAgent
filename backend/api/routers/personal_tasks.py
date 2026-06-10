"""Personal Tasks router — CRUD công việc + subtasks."""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from uuid import uuid4

from api.services.db import get_db
from api.routers.auth import _get_user_id

router = APIRouter(prefix="/api/personal/tasks", tags=["personal_tasks"])


class SubtaskCreate(BaseModel):
    text: str
    completed: bool = False


class TaskCreate(BaseModel):
    text: str
    status: str = "pending"
    category: str = "work"
    priority: str = "medium"
    due_date: Optional[str] = None
    assignee: str = ""
    subtasks: List[SubtaskCreate] = []


class TaskUpdate(BaseModel):
    text: Optional[str] = None
    status: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    assignee: Optional[str] = None


def _row_to_task(row, subtasks):
    return {
        "id": row["id"], "text": row["text"], "status": row["status"],
        "category": row["category"], "priority": row["priority"],
        "due_date": row["due_date"], "assignee": row["assignee"],
        "created_at": row["created_at"], "updated_at": row["updated_at"],
        "subtasks": subtasks,
    }


def _get_subtasks(conn, task_id):
    rows = conn.execute(
        "SELECT id, text, completed FROM personal_todo_subtasks WHERE task_id = ?",
        (task_id,),
    ).fetchall()
    return [{"id": r["id"], "text": r["text"], "completed": bool(r["completed"]), "task_id": task_id} for r in rows]


# ── Tasks ────────────────────────────────────────────────────────────────────

@router.get("")
def get_tasks(request: Request):
    uid = _get_user_id(request)
    with get_db() as conn:
        tasks = conn.execute(
            "SELECT * FROM personal_todo_tasks WHERE user_id = ? ORDER BY created_at DESC",
            (uid,),
        ).fetchall()
        result = []
        for t in tasks:
            subtasks = _get_subtasks(conn, t["id"])
            result.append(_row_to_task(t, subtasks))
    return result


@router.post("")
def create_task(body: TaskCreate, request: Request):
    uid = _get_user_id(request)
    task_id = str(uuid4())
    with get_db() as conn:
        conn.execute(
            """INSERT INTO personal_todo_tasks (id, user_id, text, status, category, priority, due_date, assignee)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (task_id, uid, body.text, body.status, body.category, body.priority, body.due_date, body.assignee),
        )
        for st in body.subtasks:
            conn.execute(
                "INSERT INTO personal_todo_subtasks (id, task_id, text, completed) VALUES (?, ?, ?, ?)",
                (str(uuid4()), task_id, st.text, 1 if st.completed else 0),
            )
        task_row = conn.execute("SELECT * FROM personal_todo_tasks WHERE id = ?", (task_id,)).fetchone()
        subtasks = _get_subtasks(conn, task_id)
    return _row_to_task(task_row, subtasks)


@router.put("/{task_id}")
def update_task(task_id: str, body: TaskUpdate, request: Request):
    uid = _get_user_id(request)
    data = body.dict(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="Không có gì để cập nhật")
    fields = [f"{k} = ?" for k in data] + ["updated_at = NOW()"]
    params = list(data.values()) + [task_id, uid]
    with get_db() as conn:
        res = conn.execute(
            f"UPDATE personal_todo_tasks SET {', '.join(fields)} WHERE id = ? AND user_id = ?",
            params,
        )
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Không tìm thấy task")
        task_row = conn.execute("SELECT * FROM personal_todo_tasks WHERE id = ?", (task_id,)).fetchone()
        subtasks = _get_subtasks(conn, task_id)
    return _row_to_task(task_row, subtasks)


@router.delete("/{task_id}")
def delete_task(task_id: str, request: Request):
    uid = _get_user_id(request)
    with get_db() as conn:
        res = conn.execute(
            "DELETE FROM personal_todo_tasks WHERE id = ? AND user_id = ?", (task_id, uid)
        )
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Không tìm thấy task")
    return {"ok": True}


# ── Subtasks ─────────────────────────────────────────────────────────────────

@router.post("/{task_id}/subtasks")
def add_subtask(task_id: str, body: SubtaskCreate, request: Request):
    uid = _get_user_id(request)
    with get_db() as conn:
        task = conn.execute(
            "SELECT id FROM personal_todo_tasks WHERE id = ? AND user_id = ?", (task_id, uid)
        ).fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="Không tìm thấy task")
        st_id = str(uuid4())
        conn.execute(
            "INSERT INTO personal_todo_subtasks (id, task_id, text, completed) VALUES (?, ?, ?, ?)",
            (st_id, task_id, body.text, 0),
        )
        task_row = conn.execute("SELECT * FROM personal_todo_tasks WHERE id = ?", (task_id,)).fetchone()
        subtasks = _get_subtasks(conn, task_id)
    return _row_to_task(task_row, subtasks)


@router.put("/{task_id}/subtasks/{st_id}/toggle")
def toggle_subtask(task_id: str, st_id: str, request: Request):
    uid = _get_user_id(request)
    with get_db() as conn:
        task = conn.execute(
            "SELECT id FROM personal_todo_tasks WHERE id = ? AND user_id = ?", (task_id, uid)
        ).fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="Không tìm thấy task")
        st = conn.execute(
            "SELECT completed FROM personal_todo_subtasks WHERE id = ? AND task_id = ?", (st_id, task_id)
        ).fetchone()
        if not st:
            raise HTTPException(status_code=404, detail="Không tìm thấy subtask")
        conn.execute(
            "UPDATE personal_todo_subtasks SET completed = ? WHERE id = ?",
            (0 if st["completed"] else 1, st_id),
        )
        task_row = conn.execute("SELECT * FROM personal_todo_tasks WHERE id = ?", (task_id,)).fetchone()
        subtasks = _get_subtasks(conn, task_id)
    return _row_to_task(task_row, subtasks)


@router.delete("/{task_id}/subtasks/{st_id}")
def delete_subtask(task_id: str, st_id: str, request: Request):
    uid = _get_user_id(request)
    with get_db() as conn:
        task = conn.execute(
            "SELECT id FROM personal_todo_tasks WHERE id = ? AND user_id = ?", (task_id, uid)
        ).fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="Không tìm thấy task")
        conn.execute("DELETE FROM personal_todo_subtasks WHERE id = ? AND task_id = ?", (st_id, task_id))
    return {"ok": True}
