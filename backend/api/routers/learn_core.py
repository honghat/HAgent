from __future__ import annotations

import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from fastapi import Header
from api.services.user_store import resolve_user_id
from api.services.db import get_db

router = APIRouter(prefix="/api/learn", tags=["learn"])


def get_current_user_id(authorization: str = Header(None)) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="No token provided")
    token = authorization.replace("Bearer ", "").strip()
    uid = resolve_user_id(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token")
    return uid


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Day Logs ────────────────────────────────────────────────────────────

class DayLogUpsert(BaseModel):
    date: str
    hours: float = 0
    topic: str = ""
    notes: str = ""


class DayLogPatch(BaseModel):
    date: str
    hours: float | None = None
    topic: str | None = None
    notes: str | None = None


@router.get("/logs")
def list_logs(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        rows = db.execute(
            "SELECT id, date, hours, topic, notes, created_at, updated_at FROM learn_day_logs WHERE user_id = ? ORDER BY date DESC LIMIT 30",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        db.close()


@router.post("/logs", status_code=201)
def upsert_log(body: DayLogUpsert, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        db.execute(
            """INSERT INTO learn_day_logs (user_id, date, hours, topic, notes)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(user_id, date) DO UPDATE SET
               hours = excluded.hours, topic = excluded.topic, notes = excluded.notes,
               updated_at = CURRENT_TIMESTAMP""",
            (user_id, body.date, body.hours, body.topic, body.notes),
        )
        db.commit()
        row = db.execute(
            "SELECT id, date, hours, topic, notes FROM learn_day_logs WHERE user_id = ? AND date = ?",
            (user_id, body.date),
        ).fetchone()
        if row:
            db.execute(
                "UPDATE learn_mission SET total_hours = (SELECT COALESCE(SUM(hours),0) FROM learn_day_logs WHERE user_id = ?) WHERE user_id = ?",
                (user_id, user_id),
            )
            db.commit()
        return dict(row) if row else {"ok": True}
    finally:
        db.close()


@router.patch("/logs")
def patch_log(body: DayLogPatch, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        existing = db.execute(
            "SELECT id FROM learn_day_logs WHERE user_id = ? AND date = ?", (user_id, body.date)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Log not found")
        updates = []
        params = []
        if body.hours is not None:
            updates.append("hours = ?")
            params.append(body.hours)
        if body.topic is not None:
            updates.append("topic = ?")
            params.append(body.topic)
        if body.notes is not None:
            updates.append("notes = ?")
            params.append(body.notes)
        if updates:
            params.append(user_id)
            params.append(body.date)
            updates.append("updated_at = CURRENT_TIMESTAMP")
            db.execute(
                f"UPDATE learn_day_logs SET {', '.join(updates)} WHERE user_id = ? AND date = ?",
                params,
            )
            db.commit()
            db.execute(
                "UPDATE learn_mission SET total_hours = (SELECT COALESCE(SUM(hours),0) FROM learn_day_logs WHERE user_id = ?) WHERE user_id = ?",
                (user_id, user_id),
            )
            db.commit()
        row = db.execute(
            "SELECT id, date, hours, topic, notes FROM learn_day_logs WHERE user_id = ? AND date = ?",
            (user_id, body.date),
        ).fetchone()
        return dict(row)
    finally:
        db.close()


# ── Mission ─────────────────────────────────────────────────────────────

@router.get("/mission")
def get_mission(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        row = db.execute(
            "SELECT start_date, total_hours FROM learn_mission WHERE user_id = ?", (user_id,)
        ).fetchone()
        if not row:
            db.execute("INSERT INTO learn_mission (user_id) VALUES (?)", (user_id,))
            db.commit()
            row = db.execute(
                "SELECT start_date, total_hours FROM learn_mission WHERE user_id = ?", (user_id,)
            ).fetchone()
        return {"startDate": row["start_date"], "totalHours": row["total_hours"]}
    finally:
        db.close()


# ── Pomodoro ────────────────────────────────────────────────────────────

class PomodoroUpsert(BaseModel):
    date: str
    sessions: int | None = None
    currentEndTime: int | None = None
    currentMode: str | None = None


@router.get("/pomodoro")
def get_pomodoro(date: str | None = None, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        d = date or datetime.now().strftime("%Y-%m-%d")
        row = db.execute(
            "SELECT sessions, current_end_time, current_mode FROM learn_pomodoro WHERE user_id = ? AND date = ?",
            (user_id, d),
        ).fetchone()
        if row:
            return {"sessions": row["sessions"], "currentEndTime": row["current_end_time"], "currentMode": row["current_mode"]}
        return {"sessions": 0, "currentEndTime": 0, "currentMode": "work"}
    finally:
        db.close()


@router.post("/pomodoro", status_code=201)
def upsert_pomodoro(body: PomodoroUpsert, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        d = body.date or datetime.now().strftime("%Y-%m-%d")
        db.execute(
            """INSERT INTO learn_pomodoro (user_id, date, sessions, current_end_time, current_mode)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(user_id, date) DO UPDATE SET
               sessions = COALESCE(?, excluded.sessions),
               current_end_time = COALESCE(?, excluded.current_end_time),
               current_mode = COALESCE(?, excluded.current_mode),
               updated_at = CURRENT_TIMESTAMP""",
            (user_id, d, body.sessions or 0, body.currentEndTime or 0, body.currentMode or "work",
             body.sessions, body.currentEndTime, body.currentMode),
        )
        db.commit()
        row = db.execute(
            "SELECT sessions, current_end_time, current_mode FROM learn_pomodoro WHERE user_id = ? AND date = ?",
            (user_id, d),
        ).fetchone()
        return {"sessions": row["sessions"], "currentEndTime": row["current_end_time"], "currentMode": row["current_mode"]}
    finally:
        db.close()


# ── Roadmap ─────────────────────────────────────────────────────────────

class RoadmapUpsert(BaseModel):
    id: str
    completed: bool = True


@router.get("/roadmap")
def list_roadmap(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        rows = db.execute(
            "SELECT id FROM learn_roadmap WHERE user_id = ? AND completed = 1", (user_id,)
        ).fetchall()
        return [r["id"] for r in rows]
    finally:
        db.close()


@router.post("/roadmap", status_code=201)
def upsert_roadmap(body: RoadmapUpsert, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        db.execute(
            """INSERT INTO learn_roadmap (user_id, id, completed)
               VALUES (?, ?, ?)
               ON CONFLICT(user_id, id) DO UPDATE SET
               completed = excluded.completed, updated_at = CURRENT_TIMESTAMP""",
            (user_id, body.id, 1 if body.completed else 0),
        )
        db.commit()
        return {"ok": True}
    finally:
        db.close()


# ── AI Reports ──────────────────────────────────────────────────────────

class AIReportCreate(BaseModel):
    content: str


@router.get("/ai-reports")
def list_ai_reports(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        rows = db.execute(
            "SELECT id, date, content, created_at FROM learn_ai_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        db.close()


@router.post("/ai-reports", status_code=201)
def create_ai_report(body: AIReportCreate, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        date = datetime.now().strftime("%Y-%m-%d")
        cursor = db.execute(
            "INSERT INTO learn_ai_reports (user_id, date, content) VALUES (?, ?, ?)",
            (user_id, date, body.content),
        )
        db.commit()
        row = db.execute("SELECT id, date, content, created_at FROM learn_ai_reports WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)
    finally:
        db.close()


@router.delete("/ai-reports")
def delete_ai_report(id: int, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        db.execute("DELETE FROM learn_ai_reports WHERE id = ? AND user_id = ?", (id, user_id))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


# ── Code Sessions ───────────────────────────────────────────────────────

class CodeSessionCreate(BaseModel):
    type: str = "explain"
    track: str = "javascript"
    input: str = ""
    output: str = ""


@router.get("/code")
def list_code_sessions(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        rows = db.execute(
            "SELECT id, type, track, input, output, created_at FROM learn_code_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 500",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        db.close()


@router.post("/code", status_code=201)
def create_code_session(body: CodeSessionCreate, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO learn_code_sessions (user_id, type, track, input, output) VALUES (?, ?, ?, ?, ?)",
            (user_id, body.type, body.track, body.input, body.output),
        )
        db.commit()
        row = db.execute("SELECT * FROM learn_code_sessions WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)
    finally:
        db.close()


@router.delete("/code")
def delete_code_session(id: int, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        db.execute("DELETE FROM learn_code_sessions WHERE id = ? AND user_id = ?", (id, user_id))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


# ── Settings (global AI config) ─────────────────────────────────────────

@router.get("/settings")
def get_settings(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        row = db.execute("SELECT * FROM learn_settings WHERE id = 1").fetchone()
        if not row:
            db.execute("INSERT INTO learn_settings (id) VALUES (1)")
            db.commit()
            return {"aiServer": "http://100.69.50.64:8080/v1", "aiHost": "100.69.50.64", "aiProvider": "local", "aiModel": "default", "aiKey": ""}
        return {"aiServer": row["ai_server"], "aiHost": row["ai_host"], "aiProvider": row["ai_provider"], "aiModel": row["ai_model"], "aiKey": row["ai_key"]}
    finally:
        db.close()


class SettingsUpdate(BaseModel):
    aiServer: str = ""
    aiHost: str = ""
    aiProvider: str = "local"
    aiModel: str = "default"
    aiKey: str = ""


@router.post("/settings")
def update_settings(body: SettingsUpdate, user_id: str = Depends(get_current_user_id)):
    from api.services.user_store import get_user_by_id
    user = get_user_by_id(user_id)
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    db = get_db()
    try:
        db.execute(
            """INSERT INTO learn_settings (id, ai_server, ai_host, ai_provider, ai_model, ai_key)
               VALUES (1, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
               ai_server = excluded.ai_server, ai_host = excluded.ai_host,
               ai_provider = excluded.ai_provider, ai_model = excluded.ai_model,
               ai_key = excluded.ai_key, updated_at = CURRENT_TIMESTAMP""",
            (body.aiServer.strip(), body.aiHost.strip(), body.aiProvider.strip().lower(),
             body.aiModel.strip(), body.aiKey.strip()),
        )
        db.commit()
        return {"ok": True}
    finally:
        db.close()
