"""Router for the Learn (/api/lessons) feature."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from fastapi import Header
from api.services.user_store import resolve_user_id
from api.services.recall_service import (
    evaluate_recall,
    gap_notes_payload,
    recall_questions_for_track,
    resolve_provider,
    sm2_step,
)

logger = logging.getLogger(__name__)

def get_current_user_id(authorization: str = Header(None)) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Unauthorized: No token provided")
    token = authorization.replace("Bearer ", "").strip()
    uid = resolve_user_id(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid token")
    return uid

from api.services.db import get_db

router = APIRouter(prefix="/api/lessons", tags=["lessons"])


def _ensure_gap_column(db) -> None:
    existing = {row["name"].lower() for row in db.execute('PRAGMA table_info("lesson")').fetchall()}
    if "gapnotes" not in existing:
        db.execute('ALTER TABLE lesson ADD COLUMN gapNotes TEXT NOT NULL DEFAULT \'\'')
    if "strength" not in existing:
        db.execute('ALTER TABLE lesson ADD COLUMN strength INTEGER NOT NULL DEFAULT 0')
    db.commit()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------




def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_dict(row) -> dict:
    if not row:
        return {}
    d = dict(row)
    if "completed" in d:
        d["completed"] = bool(d["completed"])
    return d


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class LessonCreate(BaseModel):
    track: str
    topic: str
    content: str
    order: int | None = None


class LessonPatch(BaseModel):
    id: int | str
    completed: bool | None = None
    incrementLearnCount: bool = False


class LessonDelete(BaseModel):
    id: int | str


class LessonRecallBody(BaseModel):
    id: int | str
    transcript: str = ""
    provider: str = ""
    model: str = ""
    strength: int | None = None  # optional manual override (0-100)


class LessonQuestionsBody(BaseModel):
    track: str = ""
    topic: str = ""


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("")
def list_lessons(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        _ensure_gap_column(db)
        legacy_uid = user_id
        rows = db.execute(
            'SELECT id, track, topic, content, "order", completed, learnCount, createdAt, nextReviewAt, lastReviewedAt, intervalDays, easeFactor, reviewCount, strength, gapNotes FROM lesson WHERE userId = ? ORDER BY "order" ASC, createdAt ASC',
            (legacy_uid,),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        db.close()


@router.post("", status_code=201)
def create_lesson(body: LessonCreate, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        legacy_uid = user_id
        dup = db.execute(
            'SELECT id, topic, content, track, "order", completed, createdAt FROM lesson WHERE userId = ? AND track = ? AND topic = ?',
            (legacy_uid, body.track, body.topic),
        ).fetchone()
        if dup:
            d = _row_to_dict(dup)
            d["duplicate"] = True
            return d

        db.execute(
            'INSERT INTO lesson (topic, content, track, userId, "order", completed, learnCount) VALUES (?, ?, ?, ?, ?, 0, 0)',
            (body.topic, body.content, body.track, legacy_uid, body.order or 0),
        )
        db.commit()
        row = db.execute('SELECT * FROM lesson WHERE userId = ? AND track = ? AND topic = ? ORDER BY id DESC LIMIT 1', (legacy_uid, body.track, body.topic)).fetchone()
        return _row_to_dict(row)
    finally:
        db.close()


@router.patch("")
def patch_lesson(body: LessonPatch, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        legacy_uid = user_id
        try:
            lesson_id = int(body.id)
        except (TypeError, ValueError):
            lesson_id = body.id

        row = db.execute(
            'SELECT * FROM lesson WHERE id = ? AND userId = ?',
            (lesson_id, legacy_uid),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Lesson not found")

        updates = []
        params: list = []
        if body.completed is not None:
            updates.append("completed = ?")
            params.append(1 if body.completed else 0)
        if body.incrementLearnCount:
            updates.append("learnCount = learnCount + 1")

        if updates:
            params.append(lesson_id)
            params.append(legacy_uid)
            db.execute(
                f'UPDATE lesson SET {", ".join(updates)} WHERE id = ? AND userId = ?',
                params,
            )
            db.commit()

        updated = db.execute('SELECT * FROM lesson WHERE id = ?', (lesson_id,)).fetchone()
        return _row_to_dict(updated)
    finally:
        db.close()


@router.delete("")
def delete_lesson(body: LessonDelete, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        legacy_uid = user_id
        try:
            lesson_id = int(body.id)
        except (TypeError, ValueError):
            lesson_id = body.id

        result = db.execute(
            'DELETE FROM lesson WHERE id = ? AND userId = ?',
            (lesson_id, legacy_uid),
        )
        db.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Lesson not found")
        return {"ok": True}
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Recall (Feynman teach-back) endpoints
# ---------------------------------------------------------------------------

@router.get("/recall-questions")
def recall_questions(body: LessonQuestionsBody, user_id: str = Depends(get_current_user_id)):
    """Return default Feynman prompt questions for a track/topic. AI-free, fast."""
    return {"questions": recall_questions_for_track(body.track or "")}


@router.get("/review-queue")
def review_queue(user_id: str = Depends(get_current_user_id)):
    """List lessons whose nextReviewAt is due (or never reviewed). Newest due first."""
    db = get_db()
    try:
        _ensure_gap_column(db)
        legacy_uid = user_id
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        rows = db.execute(
            """SELECT id, track, topic, nextReviewAt, lastReviewedAt, intervalDays, easeFactor, reviewCount, gapNotes
               FROM lesson
               WHERE userId = ? AND (nextReviewAt IS NULL OR nextReviewAt <= ?)
               ORDER BY (nextReviewAt IS NULL) DESC, nextReviewAt ASC
               LIMIT 50""",
            (legacy_uid, now),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        db.close()


@router.post("/recall")
async def recall_lesson(body: LessonRecallBody, request: Request, user_id: str = Depends(get_current_user_id)):
    """AI-evaluate a Feynman teach-back transcript and update SM-2 schedule."""
    db = get_db()
    try:
        _ensure_gap_column(db)
        legacy_uid = user_id

        lesson_id_raw = body.id
        if lesson_id_raw is None:
            raise HTTPException(status_code=400, detail="Missing lesson id")
        try:
            lesson_id = int(lesson_id_raw)
        except (TypeError, ValueError):
            lesson_id = lesson_id_raw

        row = db.execute(
            'SELECT * FROM lesson WHERE id = ? AND userId = ?',
            (lesson_id, legacy_uid),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Lesson not found")
        lesson = _row_to_dict(row)

        transcript = (body.transcript or "").strip()
        if not transcript:
            raise HTTPException(status_code=400, detail="Transcript trống — hãy giảng lại trước khi ghi nhận.")

        provider, model = resolve_provider(user_id, db, requested=body.provider)
        if not provider:
            raise HTTPException(status_code=400, detail="Chưa cấu hình provider AI mặc định.")
        token = request.headers.get("authorization", "")
        base_url = str(request.base_url).rstrip("/")

        questions = recall_questions_for_track(lesson.get("track", ""))
        try:
            eval_result = await evaluate_recall(
                base_url=base_url,
                token=token,
                provider=provider,
                model=model,
                topic=lesson.get("topic", ""),
                content=lesson.get("content", ""),
                transcript=transcript,
                questions=questions,
            )
        except Exception as e:
            logger.exception("AI recall eval failed: %s", e)
            raise HTTPException(status_code=502, detail=f"AI đánh giá thất bại: {e}")

        if body.strength is not None:
            try:
                eval_result["strength"] = max(0, min(100, int(body.strength)))
                eval_result["quality"] = max(0, min(5, round(eval_result["strength"] / 20)))
            except Exception:
                pass

        prev_strength = int(lesson.get("strength") or 0)
        sched = sm2_step(
            quality_0_5=int(eval_result.get("quality", 3)),
            review_count=int(lesson.get("reviewCount") or 0),
            prev_interval_days=int(lesson.get("intervalDays") or 0),
            prev_ease=float(lesson.get("easeFactor") or 2.5),
            strength=prev_strength,
        )
        gap = gap_notes_payload(eval_result)
        last_reviewed = datetime.now(timezone.utc).isoformat(timespec="seconds")

        db.execute(
            """UPDATE lesson SET
                 lastReviewedAt = ?,
                 nextReviewAt = ?,
                 intervalDays = ?,
                 easeFactor = ?,
                 reviewCount = ?,
                 strength = ?,
                 gapNotes = ?
               WHERE id = ? AND userId = ?""",
            (last_reviewed, sched.next_review_at, sched.interval_days, sched.ease_factor,
             sched.review_count, sched.strength, gap, lesson_id, legacy_uid),
        )
        db.commit()

        return {
            "ok": True,
            "lessonId": lesson_id,
            "schedule": {
                "nextReviewAt": sched.next_review_at,
                "intervalDays": sched.interval_days,
                "easeFactor": sched.ease_factor,
                "reviewCount": sched.review_count,
                "strength": sched.strength,
                "lastReviewedAt": last_reviewed,
            },
            "eval": eval_result,
            "questions": questions,
        }
    finally:
        db.close()
