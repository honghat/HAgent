"""Recall service: SM-2 spaced repetition + AI evaluation for Feynman teach-back.

Shared by `/api/lessons` and `/api/english` routers.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# SM-2 constants
# ---------------------------------------------------------------------------

MIN_EASE = 1.3
DEFAULT_EASE = 2.5
FIRST_INTERVAL_DAYS = 1
SECOND_INTERVAL_DAYS = 6


@dataclass
class RecallSchedule:
    next_review_at: str
    interval_days: int
    ease_factor: float
    review_count: int
    strength: int  # 0-100


def sm2_step(
    *,
    quality_0_5: int,
    review_count: int,
    prev_interval_days: int,
    prev_ease: float,
    strength: int,
) -> RecallSchedule:
    """Pure SM-2 step. quality_0_5 is 0..5 (0 = blackout, 5 = perfect)."""
    q = max(0, min(5, int(quality_0_5)))
    ease = float(prev_ease or DEFAULT_EASE)
    rc = int(review_count or 0)
    interval = int(prev_interval_days or 0)

    if q < 3:
        rc = 0
        interval = FIRST_INTERVAL_DAYS
    else:
        rc += 1
        if rc == 1:
            interval = FIRST_INTERVAL_DAYS
        elif rc == 2:
            interval = SECOND_INTERVAL_DAYS
        else:
            interval = max(1, round(interval * ease))

    ease = max(MIN_EASE, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))

    if q <= 1:
        strength = max(0, strength - 30)
    elif q == 2:
        strength = max(0, strength - 15)
    elif q == 3:
        strength = min(100, max(strength, 40))
    elif q == 4:
        strength = min(100, max(strength, 65))
    else:
        strength = min(100, max(strength, 85))

    next_at = datetime.now(timezone.utc) + timedelta(days=interval)
    return RecallSchedule(
        next_review_at=next_at.isoformat(timespec="seconds"),
        interval_days=interval,
        ease_factor=round(ease, 3),
        review_count=rc,
        strength=strength,
    )


def quality_from_strength(strength: int) -> int:
    """Map a 0-100 strength score to SM-2 quality 0-5 for non-AI quick updates."""
    s = max(0, min(100, int(strength)))
    if s < 20:
        return 1
    if s < 40:
        return 2
    if s < 60:
        return 3
    if s < 80:
        return 4
    return 5


# ---------------------------------------------------------------------------
# AI evaluation
# ---------------------------------------------------------------------------

RECALL_EVAL_PROMPT = """Bạn là giáo viên kiểm tra mức độ hiểu bài bằng phương pháp Feynman (tự giảng lại).

Chủ đề: {topic}
Nội dung gốc (rút gọn):
\"\"\"
{content}
\"\"\"
Câu hỏi gợi mở: {questions}

Bài giảng lại của học viên (transcript):
\"\"\"
{transcript}
\"\"\"

Đánh giá transcript theo 4 tiêu chí (mỗi tiêu chí 0-25, tổng = strength 0-100):
- Đúng: có sai sót về sự kiện/khái niệm không?
- Đủ: có bỏ sót ý chính nào không?
- Ví dụ: có lấy ví dụ/code minh hoạ không?
- Liên hệ: có kết nối với khái niệm khác / ứng dụng thực tế không?

Trả về JSON ONLY (không markdown, không giải thích):
{{"strength": 0-100, "quality": 0-5, "mastered": ["điểm đã nắm vững"], "gap": ["điểm còn thiếu/sai"], "nextFocus": "gợi ý ôn tiếp theo 1 câu", "summary": "nhận xét 1-2 câu bằng tiếng Việt"}}
"""


SHADOW_EVAL_PROMPT = """So sánh transcript học viên với câu mẫu (shadowing - tập nói theo).

Câu mẫu:
\"\"\"
{expected}
\"\"\"
Transcript học viên:
\"\"\"
{actual}
\"\"\"

Đánh giá:
- pronunciation: có khác biệt rõ từ nào không? (note các từ sai)
- fluency: trôi chảy / ngập ngừng
- meaning: giữ đúng nghĩa không

Trả JSON ONLY:
{{"strength": 0-100, "quality": 0-5, "diff": ["từ/cụm khác biệt"], "tip": "gợi ý cải thiện 1 câu bằng tiếng Việt"}}
"""


def _strip_code_fence(raw: str) -> str:
    text = re.sub(r"```(?:json)?", "", raw or "").replace("```", "").strip()
    return text


def _parse_json_loose(raw: str) -> dict | None:
    text = _strip_code_fence(raw)
    obj_start = text.find("{")
    obj_end = text.rfind("}")
    if obj_start < 0 or obj_end <= obj_start:
        return None
    try:
        return json.loads(text[obj_start : obj_end + 1])
    except Exception:
        return None


async def call_hagent_ai(
    *,
    base_url: str,
    token: str,
    provider: str,
    model: str,
    prompt: str,
    temperature: float = 0.3,
    timeout: float = 90.0,
) -> str:
    """Call internal /api/hagent-ai/chat/completions. Returns raw content string."""
    url = f"{base_url.rstrip('/')}/api/hagent-ai/chat/completions"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = token
    payload = {
        "provider": provider,
        "model": model,
        "temperature": temperature,
        "messages": [{"role": "user", "content": prompt}],
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, headers=headers, json=payload)
    if resp.status_code >= 400:
        raise RuntimeError(f"AI HTTP {resp.status_code}: {resp.text[:200]}")
    data = resp.json()
    content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
    return (content or "").strip()


def resolve_provider(user_id: str, db, *, requested: str = "") -> tuple[str, str]:
    """Resolve (provider, model) from request body or user default. Returns ('', '') if not found."""
    provider = (requested or "").strip()
    if not provider or provider == "cx":
        try:
            row = db.execute("SELECT default_provider FROM users WHERE id = ?", (user_id,)).fetchone()
            if row and row["default_provider"]:
                provider = row["default_provider"]
        except Exception:
            pass
    model = ""
    return provider, model


async def evaluate_recall(
    *,
    base_url: str,
    token: str,
    provider: str,
    model: str,
    topic: str,
    content: str,
    transcript: str,
    questions: list[str] | None = None,
) -> dict[str, Any]:
    """Call AI to evaluate Feynman teach-back transcript. Returns parsed JSON dict."""
    truncated = (content or "")[:4000]
    q_text = "\n".join(f"- {q}" for q in (questions or [])[:6]) or "(không có gợi ý)"
    prompt = RECALL_EVAL_PROMPT.format(
        topic=topic or "(không rõ)",
        content=truncated,
        transcript=(transcript or "").strip()[:4000],
        questions=q_text,
    )
    raw = await call_hagent_ai(
        base_url=base_url, token=token, provider=provider, model=model, prompt=prompt, temperature=0.3
    )
    parsed = _parse_json_loose(raw)
    if not parsed:
        # Heuristic fallback: use length and basic signal to avoid silent skip.
        length = len((transcript or "").strip())
        s = 50 if length < 40 else (70 if length < 200 else 80)
        return {
            "strength": s,
            "quality": quality_from_strength(s),
            "mastered": [],
            "gap": ["AI trả lời không parse được — dùng điểm heuristic."],
            "nextFocus": "Thử giải thích dài hơn, có ví dụ.",
            "summary": "AI không trả JSON hợp lệ, dùng đánh giá tạm theo độ dài transcript.",
            "_raw": raw[:500],
        }
    try:
        parsed["strength"] = max(0, min(100, int(parsed.get("strength", 50))))
    except Exception:
        parsed["strength"] = 50
    try:
        parsed["quality"] = max(0, min(5, int(parsed.get("quality", quality_from_strength(parsed["strength"])))))
    except Exception:
        parsed["quality"] = quality_from_strength(parsed["strength"])
    for k in ("mastered", "gap"):
        v = parsed.get(k)
        if not isinstance(v, list):
            parsed[k] = []
    parsed.setdefault("nextFocus", "")
    parsed.setdefault("summary", "")
    return parsed


async def evaluate_shadow(
    *,
    base_url: str,
    token: str,
    provider: str,
    model: str,
    expected: str,
    actual: str,
) -> dict[str, Any]:
    prompt = SHADOW_EVAL_PROMPT.format(
        expected=(expected or "").strip()[:2000],
        actual=(actual or "").strip()[:2000],
    )
    raw = await call_hagent_ai(
        base_url=base_url, token=token, provider=provider, model=model, prompt=prompt, temperature=0.2
    )
    parsed = _parse_json_loose(raw)
    if not parsed:
        s = 60 if (expected or "").strip().lower() in (actual or "").strip().lower() else 40
        return {
            "strength": s,
            "quality": quality_from_strength(s),
            "diff": [],
            "tip": "AI không trả JSON, dùng so khớp chuỗi đơn giản.",
            "_raw": raw[:500],
        }
    try:
        parsed["strength"] = max(0, min(100, int(parsed.get("strength", 50))))
    except Exception:
        parsed["strength"] = 50
    try:
        parsed["quality"] = max(0, min(5, int(parsed.get("quality", quality_from_strength(parsed["strength"])))))
    except Exception:
        parsed["quality"] = quality_from_strength(parsed["strength"])
    if not isinstance(parsed.get("diff"), list):
        parsed["diff"] = []
    parsed.setdefault("tip", "")
    return parsed


def recall_questions_for_track(track: str) -> list[str]:
    """Default Feynman prompt questions per track, used when AI gen fails."""
    base = [
        "Bạn hãy giải thích khái niệm chính bằng lời của bạn (1-2 câu).",
        "Cho một ví dụ thực tế minh hoạ.",
        "Điều gì sẽ xảy ra nếu thiếu phần này? Tại sao?",
    ]
    if track in ("javascript", "typescript", "react", "nextjs", "nodejs"):
        base.append("Viết 3-5 dòng code minh hoạ và giải thích từng dòng.")
    elif track in ("python", "fastapi"):
        base.append("Viết một đoạn code ngắn và chỉ ra input/output.")
    elif track in ("dsa", "leetcode"):
        base.append("Nêu độ phức tạp thời gian/không gian và một test case biên.")
    elif track in ("system-design", "api"):
        base.append("Nếu scale lên 1M user, thay đổi gì trong thiết kế?")
    elif track in ("oop", "fullstack"):
        base.append("So sánh với cách tiếp cận khác (functional / classless), ưu/nhược.")
    elif track in ("git", "linux", "docker"):
        base.append("Khi nào dùng lệnh này? Khác các lệnh liên quan thế nào?")
    return base


def gap_notes_payload(parsed: dict[str, Any]) -> str:
    """Serialize AI eval result to a compact JSON string for DB gap_notes column."""
    keep = {k: parsed.get(k) for k in ("mastered", "gap", "nextFocus", "summary") if parsed.get(k)}
    return json.dumps(keep, ensure_ascii=False)


def build_shadow_diff_note(parsed: dict[str, Any]) -> str:
    keep = {k: parsed.get(k) for k in ("diff", "tip") if parsed.get(k)}
    return json.dumps(keep, ensure_ascii=False)
