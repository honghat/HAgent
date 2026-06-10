from __future__ import annotations

import json
import re
import sqlite3
from collections import Counter
from datetime import datetime
from urllib import error, request
from uuid import uuid4

from api.services.db import get_connection
from api.services.provider_config import get_provider_config


EVENT_TYPES = {
    "user_preference",
    "project_memory",
    "knowledge_fact",
    "successful_workflow",
    "agent_failure",
    "tool_issue",
    "new_skill_candidate",
    "daily_review",
    "context_compaction",
}

REFLECTION_PROMPT = """Bạn là bộ phận tự học của HAgent. Phân tích một lượt hội thoại và trích xuất các bài học giúp agent hỗ trợ người dùng tốt hơn.

Trả về duy nhất JSON hợp lệ:
{
  "events": [
    {
      "event_type": "user_preference|project_memory|knowledge_fact|successful_workflow|agent_failure|tool_issue|new_skill_candidate",
      "title": "tiêu đề ngắn",
      "evidence": "bằng chứng từ hội thoại",
      "lesson": "bài học có thể dùng lại",
      "action": "nên làm gì với bài học này",
      "confidence": 0.0
    }
  ]
}

Quy tắc:
- Chỉ trích xuất bài học bền vững, có ích cho các phiên sau.
- Nếu agent có dấu hiệu nói quá, báo lỗi, mô phỏng kết quả, không dùng tool khi cần, hoặc bị người dùng sửa, ghi agent_failure/tool_issue.
- Nếu người dùng nêu sở thích/cách làm việc/quy tắc an toàn, ghi user_preference.
- Nếu phát hiện quy trình có thể tái sử dụng, ghi successful_workflow hoặc new_skill_candidate.
- Nếu không có gì đáng học, trả về {"events": []}.
- Không lưu bí mật, token, cookie, API key."""


def _now_sql() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _parse_json(raw: str) -> dict | None:
    try:
        return json.loads(raw)
    except Exception:
        pass
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw or "")
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except Exception:
        return None


def _clip(text: str, limit: int) -> str:
    text = " ".join((text or "").split())
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def _safe_event_type(value: str | None) -> str:
    event_type = (value or "").strip()
    return event_type if event_type in EVENT_TYPES else "knowledge_fact"


def _normalize_event(event: dict) -> dict | None:
    title = _clip(str(event.get("title") or ""), 180)
    lesson = _clip(str(event.get("lesson") or event.get("content") or ""), 2000)
    evidence = _clip(str(event.get("evidence") or ""), 2000)
    if not title or not lesson:
        return None
    try:
        confidence = float(event.get("confidence", 0.5))
    except Exception:
        confidence = 0.5
    confidence = max(0.0, min(confidence, 1.0))
    return {
        "event_type": _safe_event_type(event.get("event_type")),
        "title": title,
        "evidence": evidence,
        "lesson": lesson,
        "action": _clip(str(event.get("action") or ""), 1000),
        "confidence": confidence,
    }


def _call_reflection_llm(
    user_content: str,
    assistant_content: str,
    provider: str | None,
    model: str | None,
) -> list[dict]:
    try:
        cfg = get_provider_config(provider, model)
    except Exception:
        return []
    if cfg.type != "openai" or not cfg.base_url or not cfg.api_key:
        return []
    payload = {
        "model": cfg.model,
        "messages": [
            {"role": "system", "content": REFLECTION_PROMPT},
            {"role": "user", "content": f"USER:\n{user_content}\n\nASSISTANT:\n{assistant_content}"},
        ],
        "temperature": 0.1,
    }
    req = request.Request(
        f"{cfg.base_url.rstrip('/')}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {cfg.api_key}"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=45) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (error.HTTPError, OSError, TimeoutError, ValueError):
        return []
    raw = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    parsed = _parse_json(raw) or {}
    events = parsed.get("events")
    if not isinstance(events, list):
        return []
    return [event for event in events if isinstance(event, dict)]


def _heuristic_events(user_content: str, assistant_content: str) -> list[dict]:
    user = user_content or ""
    assistant = assistant_content or ""
    combined = f"{user}\n{assistant}".lower()
    events: list[dict] = []

    if re.search(r"\b(luôn|không được|đừng|hãy nhớ|ghi nhớ|tôi thích|user muốn|anh muốn)\b", user, re.I):
        events.append({
            "event_type": "user_preference",
            "title": "Quy tắc hoặc sở thích mới của người dùng",
            "evidence": _clip(user, 500),
            "lesson": _clip(user, 700),
            "action": "Xem xét lưu vào USER.md nếu đây là sở thích bền vững.",
            "confidence": 0.65,
        })

    failure_patterns = [
        "agent nguồn chưa chạy được",
        "token_invalidated",
        "http 401",
        "lỗi provider",
        "không gọi được provider",
        "yêu cầu thất bại",
        "không tìm thấy session",
    ]
    if any(pattern in combined for pattern in failure_patterns):
        events.append({
            "event_type": "agent_failure",
            "title": "Lỗi thực thi hoặc provider trong lượt chat",
            "evidence": _clip(assistant, 700),
            "lesson": "Khi gặp lỗi provider/tool, agent cần báo rõ nguyên nhân, không suy diễn kết quả, và ghi nhận để sửa cấu hình hoặc tool.",
            "action": "Kiểm tra log/provider/tool liên quan và thêm regression test nếu lỗi lặp lại.",
            "confidence": 0.8,
        })

    if re.search(r"\b(ngu|sai|không đúng|bịa|fake|ảo|không chạy|chưa làm|nói mà không làm)\b", user, re.I):
        events.append({
            "event_type": "agent_failure",
            "title": "Người dùng báo agent làm sai hoặc không thực thi thật",
            "evidence": _clip(user, 500),
            "lesson": "Agent phải dùng tool thật trước khi khẳng định kết quả thực thi. Không mô phỏng output lệnh, git, file, API hoặc hệ thống.",
            "action": "Củng cố prompt/skill và thêm test chống mô phỏng output.",
            "confidence": 0.9,
        })

    if re.search(r"\b(skill|quy trình|workflow|lần sau|tái sử dụng|cách làm)\b", combined, re.I):
        events.append({
            "event_type": "new_skill_candidate",
            "title": "Ứng viên skill/quy trình tái sử dụng",
            "evidence": _clip(combined, 600),
            "lesson": "Có dấu hiệu một quy trình nên được chuẩn hóa thành skill hoặc checklist để dùng lại.",
            "action": "Tổng hợp thành skill nếu quy trình này xuất hiện lại hoặc có trên 5 bước/tool.",
            "confidence": 0.55,
        })

    return events


def record_event(
    user_id: str,
    event_type: str,
    title: str,
    evidence: str = "",
    lesson: str = "",
    action: str = "",
    confidence: float = 0.5,
    source: str = "reflection",
    source_session_id: str | None = None,
    source_message_id: str | None = None,
    related_message_id: str | None = None,
    status: str = "pending",
    metadata: dict | None = None,
    auto_apply: bool = True,
) -> dict | None:
    normalized = _normalize_event({
        "event_type": event_type,
        "title": title,
        "evidence": evidence,
        "lesson": lesson,
        "action": action,
        "confidence": confidence,
    })
    if not normalized:
        return None

    event_id = str(uuid4())
    metadata_json = json.dumps(metadata or {}, ensure_ascii=False)
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        duplicate = conn.execute(
            """
            SELECT id FROM self_evolution_events
            WHERE user_id = ? AND event_type = ? AND lower(title) = lower(?)
              AND status IN ('pending', 'approved', 'applied')
            ORDER BY created_at DESC LIMIT 1
            """,
            (user_id, normalized["event_type"], normalized["title"]),
        ).fetchone()
        if duplicate:
            conn.execute(
                """
                UPDATE self_evolution_events
                SET evidence = ?, lesson = ?, action = ?, confidence = GREATEST(confidence, ?),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (normalized["evidence"], normalized["lesson"], normalized["action"], normalized["confidence"], duplicate["id"]),
            )
            event = get_event(str(duplicate["id"]), user_id)
            if auto_apply and event and event.get("status") in {"pending", "approved"}:
                result = apply_event(event["id"], user_id)
                return result.get("event") or event
            return event

        conn.execute(
            """
            INSERT INTO self_evolution_events
              (id, user_id, event_type, source, source_session_id, source_message_id,
               related_message_id, title, evidence, lesson, action, confidence, status, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                user_id,
                normalized["event_type"],
                source,
                source_session_id,
                source_message_id,
                related_message_id,
                normalized["title"],
                normalized["evidence"],
                normalized["lesson"],
                normalized["action"],
                normalized["confidence"],
                status,
                metadata_json,
            ),
        )
        conn.execute(
            "INSERT OR REPLACE INTO self_evolution (key, content, metadata_json, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
            (
                normalized["event_type"],
                normalized["lesson"],
                json.dumps({"event_id": event_id, "title": normalized["title"], **(metadata or {})}, ensure_ascii=False),
            ),
        )
    if auto_apply and status in {"pending", "approved"}:
        result = apply_event(event_id, user_id)
        if result.get("ok") and result.get("event"):
            return result["event"]
    return get_event(event_id, user_id)


def reflect_interaction(
    user_id: str,
    session_id: str,
    user_message_id: str | None,
    assistant_message_id: str | None,
    user_content: str,
    assistant_content: str,
    provider: str | None,
    model: str | None = None,
) -> list[dict]:
    events = _call_reflection_llm(user_content, assistant_content, provider, model)
    if not events:
        events = _heuristic_events(user_content, assistant_content)
    saved: list[dict] = []
    for event in events[:6]:
        normalized = _normalize_event(event)
        if not normalized:
            continue
        saved_event = record_event(
            user_id=user_id,
            source="reflection",
            source_session_id=session_id,
            source_message_id=user_message_id,
            related_message_id=assistant_message_id,
            metadata={"provider": provider, "model": model},
            **normalized,
        )
        if saved_event:
            saved.append(saved_event)
    return saved


def get_event(event_id: str, user_id: str) -> dict | None:
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM self_evolution_events WHERE id = ? AND user_id = ?",
            (event_id, user_id),
        ).fetchone()
    return _row_to_event(row) if row else None


def _row_to_event(row: sqlite3.Row) -> dict:
    item = dict(row)
    try:
        item["metadata"] = json.loads(item.pop("metadata_json") or "{}")
    except Exception:
        item["metadata"] = {}
    return item


def list_events(
    user_id: str,
    status: str | None = None,
    event_type: str | None = None,
    limit: int = 100,
) -> list[dict]:
    auto_apply_pending_events(user_id)
    clauses = ["user_id = ?"]
    params: list = [user_id]
    if status:
        clauses.append("status = ?")
        params.append(status)
    if event_type:
        clauses.append("event_type = ?")
        params.append(event_type)
    params.append(max(1, min(int(limit or 100), 300)))
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            f"""
            SELECT * FROM self_evolution_events
            WHERE {' AND '.join(clauses)}
            ORDER BY created_at DESC
            LIMIT ?
            """,
            params,
        ).fetchall()
    return [_row_to_event(row) for row in rows]


def summary(user_id: str) -> dict:
    auto_apply_pending_events(user_id)
    events = list_events(user_id, limit=300)
    by_type = Counter(event["event_type"] for event in events)
    by_status = Counter(event["status"] for event in events)
    return {
        "total": len(events),
        "pending": by_status.get("pending", 0),
        "approved": by_status.get("approved", 0),
        "applied": by_status.get("applied", 0),
        "rejected": by_status.get("rejected", 0),
        "by_type": dict(by_type),
        "recent": events[:8],
    }


def update_event_status(event_id: str, user_id: str, status: str) -> dict | None:
    if status not in {"pending", "approved", "applied", "rejected"}:
        raise ValueError("Invalid status")
    with get_connection() as conn:
        conn.execute(
            "UPDATE self_evolution_events SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
            (status, event_id, user_id),
        )
    return get_event(event_id, user_id)


def auto_apply_pending_events(user_id: str, limit: int = 100) -> dict:
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT id FROM self_evolution_events
            WHERE user_id = ? AND status IN ('pending', 'approved')
            ORDER BY created_at ASC
            LIMIT ?
            """,
            (user_id, max(1, min(int(limit or 100), 300))),
        ).fetchall()
    applied = 0
    failed = 0
    for row in rows:
        result = apply_event(str(row["id"]), user_id)
        if result.get("ok"):
            applied += 1
        else:
            failed += 1
    return {"ok": True, "applied": applied, "failed": failed}


def apply_event(event_id: str, user_id: str) -> dict:
    event = get_event(event_id, user_id)
    if not event:
        return {"ok": False, "error": "Event not found"}
    event_type = event["event_type"]
    applied_to = "queue"
    if event_type in {"user_preference", "project_memory", "successful_workflow", "tool_issue"}:
        from tools.memory_tool import MemoryStore

        store = MemoryStore()
        store.load_from_disk()
        target = "user" if event_type == "user_preference" else "memory"
        result = store.add(target, event["lesson"])
        if not result.get("success"):
            return {"ok": False, "error": result.get("error") or "Memory apply failed", "event": event}
        applied_to = f"{target}_memory"
    elif event_type == "knowledge_fact":
        from api.services.wiki_memory import save_wiki_entry

        save_wiki_entry(
            user_id,
            {
                "title": event["title"],
                "summary": event["lesson"][:500],
                "content": event["lesson"],
                "topics": ["self-evolution"],
            },
            source="self_evolution",
        )
        applied_to = "wiki"
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE self_evolution_events
            SET status = 'applied', applied_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
            """,
            (event_id, user_id),
        )
    return {"ok": True, "applied_to": applied_to, "event": get_event(event_id, user_id)}


def run_daily_review(user_id: str = "hat") -> dict:
    today = datetime.now().strftime("%Y-%m-%d")
    state_key = f"self_evolution_daily_review:{user_id}"
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        conn.execute("CREATE TABLE IF NOT EXISTS state_meta (key TEXT PRIMARY KEY, value TEXT)")
        state = conn.execute("SELECT value FROM state_meta WHERE key = ?", (state_key,)).fetchone()
        if state and state["value"] == today:
            return {"ok": True, "skipped": True, "reason": "already_ran_today"}
        rows = conn.execute(
            """
            SELECT * FROM self_evolution_events
            WHERE user_id = ? AND created_at >= datetime('now', '-1 day')
            ORDER BY created_at DESC
            """,
            (user_id,),
        ).fetchall()
        conn.execute(
            "INSERT OR REPLACE INTO state_meta (key, value) VALUES (?, ?)",
            (state_key, today),
        )
    events = [_row_to_event(row) for row in rows]
    if not events:
        return {"ok": True, "skipped": True, "reason": "no_events"}
    failures = [event for event in events if event["event_type"] in {"agent_failure", "tool_issue"}]
    preferences = [event for event in events if event["event_type"] == "user_preference"]
    candidates = [event for event in events if event["event_type"] == "new_skill_candidate"]
    lesson = "\n".join([
        f"Tổng kết tự học ngày {today}: {len(events)} sự kiện mới.",
        f"- Lỗi/tool issue: {len(failures)}",
        f"- Sở thích/quy tắc user: {len(preferences)}",
        f"- Ứng viên skill: {len(candidates)}",
        "Các bài học mới được tự động áp dụng; ưu tiên xem lại lỗi lặp lại nếu cần chỉnh code/skill.",
    ])
    review = record_event(
        user_id=user_id,
        event_type="daily_review",
        title=f"Tổng kết tự học {today}",
        evidence=json.dumps(
            [{"id": e["id"], "type": e["event_type"], "title": e["title"]} for e in events[:20]],
            ensure_ascii=False,
        ),
        lesson=lesson,
        action="Theo dõi bài học đã tự áp dụng và sửa code/skill nếu lỗi lặp lại.",
        confidence=0.8,
        source="daily_review",
    )
    return {"ok": True, "review": review, "counts": {"events": len(events), "failures": len(failures)}}
