from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path
from urllib import error, request
from uuid import uuid4

from api.services.provider_config import get_provider_config

from api.services.db import DB_PATH, get_connection

PROJECT_ROOT = Path(__file__).resolve().parents[3]
HAGENT_DB_PATH = DB_PATH
DEFAULT_SESSION_TOKEN = "398f6a8a-8954-4315-8240-df769e664b54"
DEFAULT_USERNAME = "hat"

EXTRACT_PROMPT = """Trích xuất kiến thức hữu ích từ lượt hội thoại giữa Người dùng và Trợ lý.
Kiến thức cần trích xuất phải là các sự kiện khách quan, thông tin thực tế, hoặc kiến thức chuyên môn.

Trả về duy nhất JSON hợp lệ, không bọc markdown:
{
  "title": "tiêu đề ngắn gọn",
  "summary": "tóm tắt 1-2 câu",
  "topics": ["danh-muc-slug"],
  "content": "nội dung markdown sạch sẽ"
}

Quy tắc:
- Title ngắn gọn bằng tiếng Việt.
- Topics gồm 1-3 danh mục slug.
- Content là nội dung thực tế, giữ số liệu, ngày tháng, liên kết quan trọng.
- Nếu chỉ là chào hỏi, lỗi provider, câu hỏi chưa có lời giải, hoặc tán gẫu không có kiến thức thực tế thì trả về {"skip": true}.
- Chỉ lấy facts, không lấy ý kiến cá nhân của trợ lý."""


def resolve_user_id(authorization: str | None) -> str:
    token = (authorization or "").replace("Bearer ", "").strip() or DEFAULT_SESSION_TOKEN
    try:
        from api.services.db import get_connection
        with get_connection() as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT user_id FROM sessions WHERE id = ?", (token,)).fetchone()
            if row and row["user_id"]:
                return str(row["user_id"])
            user = conn.execute("SELECT id FROM users WHERE username = ?", (DEFAULT_USERNAME,)).fetchone()
            return str(user["id"]) if user else DEFAULT_USERNAME
    except Exception:
        return DEFAULT_USERNAME


def _parse_json(raw: str) -> dict | None:
    try:
        return json.loads(raw)
    except Exception:
        pass
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw or "")
    if match:
        try:
            return json.loads(match.group(1))
        except Exception:
            return None
    return None


def _call_extractor(user_content: str, assistant_content: str, provider: str | None, model: str | None) -> dict | None:
    if "token_invalidated" in (assistant_content or "") or "HTTP 401" in (assistant_content or ""):
        return None
    cfg = get_provider_config(provider, model)
    if cfg.type != "openai" or not cfg.base_url or not cfg.api_key:
        return None
    payload = {
        "model": cfg.model,
        "messages": [
            {"role": "system", "content": EXTRACT_PROMPT},
            {"role": "user", "content": f"USER: {user_content}\n\nASSISTANT: {assistant_content}"},
        ],
        "temperature": 0.1,
    }
    req = request.Request(
        f"{cfg.base_url.rstrip('/')}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cfg.api_key}",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=45) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (error.HTTPError, OSError, TimeoutError, ValueError):
        return None
    raw = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    parsed = _parse_json(raw)
    if not parsed or parsed.get("skip"):
        return None
    return parsed


def _normalize_entry(entry: dict) -> dict | None:
    title = " ".join(str(entry.get("title") or "").split()).strip()[:160]
    content = str(entry.get("content") or "").strip()
    if not title or not content:
        return None
    topics = entry.get("topics")
    if not isinstance(topics, list):
        topics = ["general"]
    topics = [re.sub(r"[^a-z0-9_-]+", "-", str(t).lower()).strip("-") for t in topics[:3]]
    topics = [t for t in topics if t] or ["general"]
    # Loại bỏ topic trùng lặp
    seen = set()
    topics = [t for t in topics if not (t in seen or seen.add(t))]
    return {
        "title": title,
        "summary": str(entry.get("summary") or "").strip()[:500] or _auto_summary(content),
        "topics": topics,
        "content": content,
    }


def _auto_summary(content: str) -> str:
    """Lấy 1-2 câu đầu làm summary nếu LLM không cung cấp."""
    s = content.strip()
    # Tìm câu đầu tiên kết thúc bằng dấu câu
    for sep in (". ", ".\n", ".\r", "! ", "? "):
        if sep in s:
            idx = s.index(sep) + 1
            rest = s[idx:].strip()
            # Thêm câu thứ 2 nếu có
            for sep2 in (". ", ".\n", ".\r", "! ", "? "):
                if sep2 in rest:
                    idx2 = rest.index(sep2) + 1
                    s = s[:idx] + rest[:idx2]
                    break
            else:
                s = s[:idx]
            break
    return s[:500]


def _tokens(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[\wÀ-ỹ]+", (text or "").lower())
        if len(token) >= 2
    }


def _similarity(a: str, b: str) -> float:
    left = _tokens(a)
    right = _tokens(b)
    if not left or not right:
        return 0.0
    return len(left & right) / max(1, len(left | right))


def save_wiki_entry(user_id: str, entry: dict, source: str = "chat") -> dict | None:
    normalized = _normalize_entry(entry)
    if not normalized:
        return None
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        existing = conn.execute(
            "SELECT id, content FROM wiki_entries WHERE user_id = ? AND lower(title) = lower(?) ORDER BY updated_at DESC LIMIT 1",
            (user_id, normalized["title"]),
        ).fetchone()
        if not existing:
            candidates = conn.execute(
                """
                SELECT id, title, content FROM wiki_entries
                WHERE user_id = ?
                ORDER BY updated_at DESC
                LIMIT 80
                """,
                (user_id,),
            ).fetchall()
            for candidate in candidates:
                title_score = _similarity(normalized["title"], candidate["title"])
                content_score = _similarity(normalized["content"], candidate["content"])
                if title_score >= 0.72 or content_score >= 0.82:
                    existing = candidate
                    break
        if existing:
            merged = existing["content"]
            if normalized["content"] not in merged:
                merged = f"{merged}\n\n---\n\n{normalized['content']}"
            conn.execute(
                "UPDATE wiki_entries SET summary = ?, content = ?, topics = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
                (normalized["summary"], merged, json.dumps(normalized["topics"]), existing["id"]),
            )
            return {"id": existing["id"], "title": normalized["title"], "existing": True}
        entry_id = str(uuid4())
        conn.execute(
            """
            INSERT INTO wiki_entries (id, user_id, title, summary, content, topics, source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
            """,
            (
                entry_id,
                user_id,
                normalized["title"],
                normalized["summary"],
                normalized["content"],
                json.dumps(normalized["topics"]),
                source,
            ),
        )
        return {"id": entry_id, "title": normalized["title"], "existing": False}


def extract_and_save_wiki(
    user_id: str,
    user_content: str,
    assistant_content: str,
    provider: str | None,
    model: str | None = None,
) -> dict | None:
    entry = _call_extractor(user_content, assistant_content, provider, model)
    if not entry:
        return None
    return save_wiki_entry(user_id, entry, source="chat")


def search_wiki(user_id: str, query: str, limit: int = 5) -> list[dict]:
    if not HAGENT_DB_PATH.exists():
        return []
    query = (query or "").strip()
    if not query:
        return []
    query_tokens = _tokens(query)
    q = f"%{query}%"
    with sqlite3.connect(HAGENT_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT id, title, summary, content, topics, updated_at
            FROM wiki_entries
            WHERE user_id = ? AND (title LIKE ? OR summary LIKE ? OR content LIKE ?)
            ORDER BY updated_at DESC LIMIT ?
            """,
            (user_id, q, q, q, max(limit * 8, 30)),
        ).fetchall()
        if not rows and query_tokens:
            clauses = " OR ".join(["title LIKE ? OR summary LIKE ? OR content LIKE ?" for _ in query_tokens])
            params: list = [user_id]
            for token in query_tokens:
                like = f"%{token}%"
                params.extend([like, like, like])
            params.append(max(limit * 8, 30))
            rows = conn.execute(
                f"""
                SELECT id, title, summary, content, topics, updated_at
                FROM wiki_entries
                WHERE user_id = ? AND ({clauses})
                ORDER BY updated_at DESC LIMIT ?
                """,
                params,
            ).fetchall()

        ranked = []
        for row in rows:
            item = dict(row)
            haystack = f"{item.get('title', '')} {item.get('summary', '')} {item.get('content', '')}"
            title_score = 3.0 * _similarity(query, item.get("title", ""))
            body_score = _similarity(query, haystack)
            exact_bonus = 2.0 if query.lower() in haystack.lower() else 0.0
            token_bonus = sum(1 for token in query_tokens if token in _tokens(haystack)) / max(1, len(query_tokens))
            item["_score"] = round(title_score + body_score + exact_bonus + token_bonus, 4)
            ranked.append(item)
        ranked.sort(key=lambda item: (item["_score"], item.get("updated_at") or ""), reverse=True)
        return ranked[:limit]


def list_wiki_entries(user_id: str, limit: int = 20) -> list[dict]:
    if not HAGENT_DB_PATH.exists():
        return []
    with sqlite3.connect(HAGENT_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT id, title, summary, topics, updated_at
            FROM wiki_entries
            WHERE user_id = ?
            ORDER BY updated_at DESC LIMIT ?
            """,
            (user_id, limit),
        ).fetchall()
        return [dict(row) for row in rows]
