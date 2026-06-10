"""Coach router — study + job-hunt reminder feed for the frontend.

The hourly cron job (`study-job-coach` skill) produces a Markdown nudge.
That nudge is logged to `coach_reminders` so the frontend can show a feed
of recent reminders, and so we don't re-spam the user across channels.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel

from api.services.db import get_connection
from api.services.user_store import resolve_user_id


router = APIRouter(prefix="/api/coach", tags=["Coach"])
UNSUITABLE_JOB_TERMS = (
    "lào",
    "laos",
    "campuchia",
    "cambodia",
    "cambodian",
    "phnom penh",
    "vientiane",
    "myanmar",
    "yangon",
    "relocate",
    "relocation",
    "oversea",
    "overseas",
)


def _looks_unsuitable_match(item: dict) -> bool:
    text = " ".join(str(item.get(key) or "") for key in ("title", "company", "location", "verdict")).lower()
    return any(term in text for term in UNSUITABLE_JOB_TERMS)


def _current_user(authorization: Optional[str] = Header(None), t: Optional[str] = Query(None)) -> str:
    token = (authorization or "").replace("Bearer ", "").strip() or (t or "hat")
    uid = resolve_user_id(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token")
    return uid


class ReminderBody(BaseModel):
    message: str
    kind: str = "hourly"
    meta: dict | None = None
    delivered_channels: list[str] | None = None


@router.post("/reminders")
def create_reminder(body: ReminderBody, user_id: str = Depends(_current_user)):
    """Persist a coach reminder (called by the cron job or the skill)."""
    msg = (body.message or "").strip()
    if not msg:
        raise HTTPException(status_code=400, detail="message rỗng")
    delivered = ",".join((body.delivered_channels or [])[:8])
    with get_connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO coach_reminders (user_id, kind, message, meta_json, delivered_channels)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                user_id,
                (body.kind or "hourly")[:32],
                msg[:4000],
                json.dumps(body.meta or {}, ensure_ascii=False),
                delivered,
            ),
        )
        new_id = cur.lastrowid
    return {"id": new_id, "status": "ok"}


@router.get("/reminders")
def list_reminders(
    user_id: str = Depends(_current_user),
    limit: int = Query(20, ge=1, le=100),
    only_unread: bool = Query(False),
):
    """Latest reminders for this user, newest first."""
    where = "WHERE user_id = ?"
    params: list = [user_id]
    if only_unread:
        where += " AND read_at IS NULL"
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT id, kind, message, meta_json, delivered_channels, read_at, created_at
            FROM coach_reminders
            {where}
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (*params, limit),
        ).fetchall()
    out = []
    for row in rows:
        item = dict(row)
        try:
            item["meta"] = json.loads(item.pop("meta_json") or "{}")
        except Exception:
            item["meta"] = {}
        out.append(item)
    return {"items": out, "count": len(out)}


@router.post("/reminders/{reminder_id}/read")
def mark_read(reminder_id: int, user_id: str = Depends(_current_user)):
    with get_connection() as conn:
        cur = conn.execute(
            "UPDATE coach_reminders SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
            (reminder_id, user_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Không tìm thấy reminder")
    return {"status": "ok"}


@router.get("/dashboard")
def dashboard(user_id: str = Depends(_current_user)):
    """Aggregated view: top CV matches + lesson backlog + recent reminders."""
    now = datetime.now()
    week_ago = (now - timedelta(days=7)).isoformat()

    with get_connection() as conn:
        # Top CV matches (latest week)
        try:
            match_rows = conn.execute(
                """
                SELECT m.rowid AS id, j.rowid AS job_id, m.job_url, m.match_score, m.verdict, m.matched_json, m.missing_json,
                       j.title, j.company, j.location, j.salary, j.salary_min, j.salary_max,
                       j.source, j.posted_date
                FROM cv_match_scores m
                JOIN cached_jobs j ON j.url = m.job_url
                WHERE m.user_id = ? AND m.updated_at >= ?
                ORDER BY m.match_score DESC, m.updated_at DESC
                LIMIT 15
                """,
                (user_id, week_ago),
            ).fetchall()
        except Exception:
            match_rows = []

        # Lesson backlog: incomplete + stalled
        try:
            lesson_rows = conn.execute(
                """
                SELECT id, track, topic, learn_count, completed, updated_at
                FROM learn_lessons
                WHERE user_id = ? AND completed = 0
                ORDER BY updated_at ASC LIMIT 5
                """,
                (user_id,),
            ).fetchall()
        except Exception:
            lesson_rows = []

        try:
            english_row = conn.execute(
                """
                SELECT COUNT(*) AS pending FROM english_items
                WHERE user_id = ? AND completed = 0
                """,
                (user_id,),
            ).fetchone()
        except Exception:
            english_row = None

        try:
            reminder_rows = conn.execute(
                """
                SELECT id, kind, message, created_at, read_at
                FROM coach_reminders
                WHERE user_id = ?
                ORDER BY created_at DESC LIMIT 5
                """,
                (user_id,),
            ).fetchall()
        except Exception:
            reminder_rows = []

    matches = []
    for row in match_rows:
        item = dict(row)
        try:
            item["matched"] = json.loads(item.pop("matched_json") or "[]")
        except Exception:
            item["matched"] = []
        try:
            item["missing"] = json.loads(item.pop("missing_json") or "[]")
        except Exception:
            item["missing"] = []
        if _looks_unsuitable_match(item):
            continue
        matches.append(item)

    english_pending = 0
    if english_row is not None:
        try:
            english_pending = int(english_row["pending"] or 0)
        except (KeyError, IndexError, TypeError):
            english_pending = 0

    return {
        "matches_top": matches,
        "lessons_backlog": [dict(r) for r in lesson_rows],
        "english_pending": english_pending,
        "recent_reminders": [dict(r) for r in reminder_rows],
        "generated_at": now.isoformat(),
    }
