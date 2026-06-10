"""Router for the English learning feature (/api/english)."""
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
    build_shadow_diff_note,
    evaluate_recall,
    evaluate_shadow,
    gap_notes_payload,
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

router = APIRouter(prefix="/api/english", tags=["english"])


def _ensure_strength_column(db) -> None:
    existing = {row["name"].lower() for row in db.execute('PRAGMA table_info("EnglishLesson")').fetchall()}
    if "strength" not in existing:
        db.execute('ALTER TABLE "EnglishLesson" ADD COLUMN strength INTEGER NOT NULL DEFAULT 0')
    if "gapnotes" not in existing:
        db.execute('ALTER TABLE "EnglishLesson" ADD COLUMN gapNotes TEXT NOT NULL DEFAULT \'\'')
    db.commit()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_legacy_user_id(db, user_id: str) -> int:
    row = db.execute("SELECT username FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        username = user_id
    else:
        username = row["username"] if "username" in row.keys() else row[0]
    
    user_row = db.execute('SELECT id FROM "User" WHERE name = ?', (username,)).fetchone()
    if user_row:
        return user_row["id"] if "id" in user_row.keys() else user_row[0]
    
    cursor = db.cursor()
    cursor.execute(
        'INSERT INTO "User" (name, email, password, role, status) VALUES (?, ?, \'legacy\', \'user\', \'approved\')',
        (username, f"{username}@legacy.local")
    )
    db.commit()
    return cursor.lastrowid


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

class EnglishItemCreate(BaseModel):
    type: str
    content: str = ""
    title: str = ""
    metadata: dict | None = None


class EnglishItemPatch(BaseModel):
    id: int | str
    completed: bool | None = None
    incrementLearnCount: bool = False
    quizScore: int | None = None
    quizTotal: int | None = None


class EnglishItemDelete(BaseModel):
    id: int | str


class GenBatchBody(BaseModel):
    level: str = "A2"
    mode: str = "coder"
    provider: str = ""
    model: str = ""


class EnglishRecallBody(BaseModel):
    id: int | str
    transcript: str = ""
    provider: str = ""
    model: str = ""
    strength: int | None = None  # optional manual override (0-100)


class EnglishShadowBody(BaseModel):
    id: int | str
    expected: str = ""
    transcript: str = ""
    provider: str = ""
    model: str = ""


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("")
def list_english(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        _ensure_strength_column(db)
        legacy_uid = get_legacy_user_id(db, user_id)
        rows = db.execute(
            'SELECT id, type, content, metadata, title, "order", completed, learnCount, nextReviewAt, lastReviewedAt, intervalDays, easeFactor, reviewCount, strength, gapNotes FROM "EnglishLesson" WHERE userId = ? ORDER BY createdAt ASC',
            (legacy_uid,),
        ).fetchall()
        result = []
        for r in rows:
            d = _row_to_dict(r)
            result.append(d)
        return result
    finally:
        db.close()


@router.post("", status_code=201)
def create_english_item(body: EnglishItemCreate, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        legacy_uid = get_legacy_user_id(db, user_id)
        meta_str = json.dumps(body.metadata or {})
        db.execute(
            'INSERT INTO "EnglishLesson" (type, content, title, metadata, userId, completed, learnCount) VALUES (?, ?, ?, ?, ?, 0, 0)',
            (body.type, body.content, body.title, meta_str, legacy_uid),
        )
        db.commit()
        row = db.execute('SELECT * FROM "EnglishLesson" WHERE userId = ? ORDER BY id DESC LIMIT 1', (legacy_uid,)).fetchone()
        return _row_to_dict(row)
    finally:
        db.close()


@router.patch("")
def patch_english_item(body: EnglishItemPatch, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        legacy_uid = get_legacy_user_id(db, user_id)
        try:
            item_id = int(body.id)
        except (TypeError, ValueError):
            item_id = body.id

        row = db.execute(
            'SELECT * FROM "EnglishLesson" WHERE id = ? AND userId = ?',
            (item_id, legacy_uid),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Item not found")

        updates: list[str] = []
        params: list = []

        if body.completed is not None:
            updates.append("completed = ?")
            params.append(1 if body.completed else 0)
        if body.incrementLearnCount:
            updates.append("learnCount = learnCount + 1")

        if updates:
            params.append(item_id)
            params.append(legacy_uid)
            db.execute(
                f'UPDATE "EnglishLesson" SET {", ".join(updates)} WHERE id = ? AND userId = ?',
                params,
            )
            db.commit()

        updated = db.execute('SELECT * FROM "EnglishLesson" WHERE id = ?', (item_id,)).fetchone()
        return _row_to_dict(updated)
    finally:
        db.close()


@router.delete("")
def delete_english_item(body: EnglishItemDelete, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        legacy_uid = get_legacy_user_id(db, user_id)
        try:
            item_id = int(body.id)
        except (TypeError, ValueError):
            item_id = body.id

        result = db.execute(
            'DELETE FROM "EnglishLesson" WHERE id = ? AND userId = ?',
            (item_id, legacy_uid),
        )
        db.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Item not found")
        return {"ok": True}
    finally:
        db.close()


@router.delete("/unit/{unit_id}")
def delete_unit(unit_id: int, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        legacy_uid = get_legacy_user_id(db, user_id)
        if unit_id == 0:
            cur = db.execute(
                'DELETE FROM "EnglishLesson" WHERE userId = ? AND ((metadata::jsonb->>\'unit\') IS NULL OR (metadata::jsonb->>\'unit\')::int = 0)',
                (legacy_uid,),
            )
        else:
            cur = db.execute(
                'DELETE FROM "EnglishLesson" WHERE userId = ? AND (metadata::jsonb->>\'unit\')::int = ?',
                (legacy_uid, unit_id),
            )
        db.commit()
        return {"ok": True, "deleted": cur.rowcount}
    finally:
        db.close()


@router.post("/gen-batch")
async def gen_batch(body: GenBatchBody, request: Request, user_id: str = Depends(get_current_user_id)):
    """Proxy: generate a new unit batch via the AI provider then save items."""
    import httpx

    level = body.level
    mode = body.mode
    provider = body.provider
    if not provider or provider == 'cx':
        try:
            db2 = get_db()
            try:
                row2 = db2.execute("SELECT default_provider FROM users WHERE id = ?", (user_id,)).fetchone()
                if row2 and row2["default_provider"]:
                    provider = row2["default_provider"]
            finally:
                db2.close()
        except Exception:
            pass
    model = body.model

    mode_labels = {"coder": "Lập trình", "communication": "Giao tiếp", "business": "Công việc", "ielts": "Luyện thi"}
    mode_label = mode_labels.get(mode, mode)

    # Determine next unit number
    db = get_db()
    try:
        legacy_uid = get_legacy_user_id(db, user_id)
        row = db.execute(
            """SELECT MAX((metadata::jsonb->>'unit')::int) as max_unit
               FROM "EnglishLesson" WHERE userId = ? AND metadata::jsonb->>'level' = ?""",
            (legacy_uid, level),
        ).fetchone()
        next_unit = (row["max_unit"] or 0) + 1
        unit_title = f"Bài {next_unit}"
    finally:
        db.close()

    prompt = f"""Tạo 1 bài học tiếng Anh hoàn chỉnh cho cấp {level}, chủ đề: {mode_label}.
Bài số {next_unit}. Trả về JSON ONLY:
{{
  "unitTitle": "tên bài",
  "vocab": [{{"word":"...","ipa":"...","def":"short def","ex":"example","vi":"nghĩa"}}],
  "grammar": {{"title":"...","content":"..."}},
  "listen": {{"title":"...","en":"4-6 sentences","vi":"dịch"}},
  "speak": {{"title":"...","topic":"question","hint":"Vietnamese hint"}},
  "reading": {{"title":"...","body":"short passage","questions":[{{"q":"...","options":["A","B","C","D"],"answer":0}}]}},
  "writing": {{"title":"...","prompt":"...","hint":"Vietnamese hint"}}
}}"""

    # Call AI via internal API
    try:
        base_url = str(request.base_url).rstrip("/")
        token = request.headers.get("authorization", "")
        async with httpx.AsyncClient(timeout=120) as client:
            ai_resp = await client.post(
                f"{base_url}/api/hagent-ai/chat/completions",
                headers={"Authorization": token, "Content-Type": "application/json"},
                json={
                    "provider": provider,
                    "model": model,
                    "temperature": 0.6,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
        ai_data = ai_resp.json()
        raw = ai_data.get("choices", [{}])[0].get("message", {}).get("content", "")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI call failed: {e}")

    # Parse JSON from AI response
    import re
    text = re.sub(r"```(?:json)?", "", raw).replace("```", "").strip()
    obj_start = text.find("{")
    obj_end = text.rfind("}")
    if obj_start < 0 or obj_end < obj_start:
        raise HTTPException(status_code=422, detail="AI không trả về JSON hợp lệ")
    try:
        data = json.loads(text[obj_start: obj_end + 1])
    except Exception:
        raise HTTPException(status_code=422, detail="Parse JSON thất bại")

    unit_title = data.get("unitTitle", unit_title)
    base_meta = {"level": level, "mode": mode, "unit": next_unit, "unitTitle": unit_title}

    db = get_db()
    try:
        legacy_uid = get_legacy_user_id(db, user_id)
        now = _now()

        def insert(item_type, content, extra_meta):
            if not isinstance(content, str):
                if isinstance(content, list):
                    content = "\n".join(str(c) for c in content)
                else:
                    content = str(content) if content else ""
            meta = json.dumps({**base_meta, **extra_meta})
            db.execute(
                'INSERT INTO "EnglishLesson" (type, content, title, metadata, userId, completed, learnCount) VALUES (?, ?, ?, ?, ?, 0, 0)',
                (item_type, content, extra_meta.get("title", ""), meta, legacy_uid),
            )

        # vocab
        for w in (data.get("vocab") or []):
            if not w.get("word"):
                continue
            insert("vocab", w["word"], {
                "title": w["word"], "word": w["word"],
                "ipa": w.get("ipa", ""), "def": w.get("def", ""),
                "ex": w.get("ex", ""), "vi": w.get("vi", ""),
                "topic": unit_title,
            })

        # grammar
        if g := data.get("grammar"):
            insert("grammar", g.get("content", ""), {"title": g.get("title", "Ngữ pháp"), "topic": unit_title})

        # listen
        if li := data.get("listen"):
            insert("listen", li.get("en", ""), {
                "title": li.get("title", "Bài nghe"),
                "vi": li.get("vi", ""), "topic": unit_title,
            })

        # speak
        if sp := data.get("speak"):
            insert("speak", "", {
                "title": sp.get("title", "Bài nói"),
                "topic": sp.get("topic", ""), "hint": sp.get("hint", ""),
            })

        # reading
        if rd := data.get("reading"):
            insert("reading", rd.get("body", ""), {
                "title": rd.get("title", "Bài đọc"),
                "topic": unit_title, "questions": rd.get("questions", []),
            })

        # writing
        if wr := data.get("writing"):
            insert("writing", "", {
                "title": wr.get("title", "Bài viết"),
                "prompt": wr.get("prompt", ""), "hint": wr.get("hint", ""),
            })

        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database insert failed: {e}")
    finally:
        db.close()

    return {"ok": True, "unit": next_unit, "unitTitle": unit_title}


# ---------------------------------------------------------------------------
# Recall (Feynman teach-back) + Shadowing endpoints
# ---------------------------------------------------------------------------

@router.get("/review-queue")
def review_queue(user_id: str = Depends(get_current_user_id)):
    """List English items whose nextReviewAt is due (or never reviewed)."""
    db = get_db()
    try:
        _ensure_strength_column(db)
        legacy_uid = get_legacy_user_id(db, user_id)
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        rows = db.execute(
            """SELECT id, type, title, metadata, nextReviewAt, lastReviewedAt, intervalDays, easeFactor, reviewCount, strength, gapNotes
               FROM "EnglishLesson"
               WHERE userId = ? AND (nextReviewAt IS NULL OR nextReviewAt <= ?)
               ORDER BY (nextReviewAt IS NULL) DESC, nextReviewAt ASC
               LIMIT 50""",
            (legacy_uid, now),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        db.close()


async def _apply_recall_schedule(db, legacy_uid: int, item_id, eval_result: dict, manual_strength: int | None = None):
    """Run SM-2 step and persist the schedule for the given English item."""
    if manual_strength is not None:
        try:
            eval_result["strength"] = max(0, min(100, int(manual_strength)))
            eval_result["quality"] = max(0, min(5, round(eval_result["strength"] / 20)))
        except Exception:
            pass
    row = db.execute(
        'SELECT strength, reviewCount, intervalDays, easeFactor FROM "EnglishLesson" WHERE id = ? AND userId = ?',
        (item_id, legacy_uid),
    ).fetchone()
    prev_strength = int(row["strength"] or 0) if row else 0
    sched = sm2_step(
        quality_0_5=int(eval_result.get("quality", 3)),
        review_count=int(row["reviewCount"] or 0) if row else 0,
        prev_interval_days=int(row["intervalDays"] or 0) if row else 0,
        prev_ease=float(row["easeFactor"] or 2.5) if row else 2.5,
        strength=prev_strength,
    )
    last_reviewed = datetime.now(timezone.utc).isoformat(timespec="seconds")
    db.execute(
        """UPDATE "EnglishLesson" SET
             lastReviewedAt = ?,
             nextReviewAt = ?,
             intervalDays = ?,
             easeFactor = ?,
             reviewCount = ?,
             strength = ?,
             gapNotes = ?
           WHERE id = ? AND userId = ?""",
        (last_reviewed, sched.next_review_at, sched.interval_days, sched.ease_factor,
         sched.review_count, sched.strength, gap_notes_payload(eval_result), item_id, legacy_uid),
    )
    db.commit()
    return {
        "nextReviewAt": sched.next_review_at,
        "intervalDays": sched.interval_days,
        "easeFactor": sched.ease_factor,
        "reviewCount": sched.review_count,
        "strength": sched.strength,
        "lastReviewedAt": last_reviewed,
    }


@router.post("/recall")
async def recall_english(body: EnglishRecallBody, request: Request, user_id: str = Depends(get_current_user_id)):
    """AI-evaluate teach-back transcript for an English item, then update SM-2."""
    db = get_db()
    try:
        _ensure_strength_column(db)
        legacy_uid = get_legacy_user_id(db, user_id)
        try:
            item_id = int(body.id)
        except (TypeError, ValueError):
            item_id = body.id

        row = db.execute(
            'SELECT * FROM "EnglishLesson" WHERE id = ? AND userId = ?',
            (item_id, legacy_uid),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Item not found")
        item = _row_to_dict(row)
        transcript = (body.transcript or "").strip()
        if not transcript:
            raise HTTPException(status_code=400, detail="Transcript trống — hãy nói/giảng trước khi ghi nhận.")

        provider, model = resolve_provider(user_id, db, requested=body.provider)
        if not provider:
            raise HTTPException(status_code=400, detail="Chưa cấu hình provider AI mặc định.")
        token = request.headers.get("authorization", "")
        base_url = str(request.base_url).rstrip("/")

        meta: dict = {}
        try:
            meta = json.loads(item.get("metadata") or "{}")
        except Exception:
            pass

        questions = [
            f"Giải thích '{item.get('title') or item.get('content', '')[:60]}' bằng lời của bạn.",
            "Cho một ví dụ câu sử dụng đúng ngữ pháp/từ vựng này.",
            "Dịch nghĩa sang tiếng Việt ngắn gọn.",
        ]
        try:
            eval_result = await evaluate_recall(
                base_url=base_url,
                token=token,
                provider=provider,
                model=model,
                topic=item.get("title") or f"English item {item.get('type', '')}",
                content=(item.get("content") or "")[:1500] + " " + json.dumps(meta, ensure_ascii=False)[:1500],
                transcript=transcript,
                questions=questions,
            )
        except Exception as e:
            logger.exception("AI english recall eval failed: %s", e)
            raise HTTPException(status_code=502, detail=f"AI đánh giá thất bại: {e}")

        schedule = await _apply_recall_schedule(db, legacy_uid, item_id, eval_result, body.strength)
        return {
            "ok": True,
            "itemId": item_id,
            "schedule": schedule,
            "eval": eval_result,
            "questions": questions,
        }
    finally:
        db.close()


@router.post("/shadow")
async def shadow_english(body: EnglishShadowBody, request: Request, user_id: str = Depends(get_current_user_id)):
    """AI-evaluate a shadowing attempt (transcript vs expected sentence)."""
    db = get_db()
    try:
        _ensure_strength_column(db)
        legacy_uid = get_legacy_user_id(db, user_id)
        try:
            item_id = int(body.id)
        except (TypeError, ValueError):
            item_id = body.id

        row = db.execute(
            'SELECT * FROM "EnglishLesson" WHERE id = ? AND userId = ?',
            (item_id, legacy_uid),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Item not found")
        item = _row_to_dict(row)
        expected = (body.expected or item.get("content") or "").strip()
        transcript = (body.transcript or "").strip()
        if not transcript:
            raise HTTPException(status_code=400, detail="Transcript trống — hãy nói theo trước khi ghi nhận.")
        if not expected:
            raise HTTPException(status_code=400, detail="Thiếu câu mẫu để shadow.")

        provider, model = resolve_provider(user_id, db, requested=body.provider)
        if not provider:
            raise HTTPException(status_code=400, detail="Chưa cấu hình provider AI mặc định.")
        token = request.headers.get("authorization", "")
        base_url = str(request.base_url).rstrip("/")

        try:
            eval_result = await evaluate_shadow(
                base_url=base_url,
                token=token,
                provider=provider,
                model=model,
                expected=expected,
                actual=transcript,
            )
        except Exception as e:
            logger.exception("AI shadow eval failed: %s", e)
            raise HTTPException(status_code=502, detail=f"AI đánh giá thất bại: {e}")

        # Merge into the same schedule + gapNotes (use shadow diff payload).
        merged = {
            "strength": eval_result.get("strength", 50),
            "quality": eval_result.get("quality", 3),
            "diff": eval_result.get("diff", []),
            "tip": eval_result.get("tip", ""),
        }
        try:
            # Combine shadow diff with any existing gapNotes summary for context.
            existing = json.loads(item.get("gapNotes") or "{}") if item.get("gapNotes") else {}
            if existing.get("summary"):
                merged["summary"] = existing["summary"]
        except Exception:
            pass

        schedule = await _apply_recall_schedule(db, legacy_uid, item_id, {"strength": merged["strength"], "quality": merged["quality"]})
        # Persist diff/tip into gapNotes as well.
        db.execute(
            'UPDATE "EnglishLesson" SET gapNotes = ? WHERE id = ? AND userId = ?',
            (build_shadow_diff_note(merged), item_id, legacy_uid),
        )
        db.commit()

        return {
            "ok": True,
            "itemId": item_id,
            "schedule": schedule,
            "eval": eval_result,
            "expected": expected,
        }
    finally:
        db.close()
