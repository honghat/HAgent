from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request

from api.services.db import get_db
from api.services.wiki_memory import resolve_user_id, save_wiki_entry

router = APIRouter(tags=["wiki"])


@router.get("/wiki")
def list_wiki(token: str | None = None) -> dict:
    user_id = resolve_user_id(f"Bearer {token}" if token else None)
    with get_db() as conn:
        conn.row_factory = None
        rows = conn.execute(
            "SELECT id, title, summary, content, topics, created_at, updated_at FROM wiki_entries WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()
        entries = []
        topics: dict = {}
        for row in rows:
            topics_list = json.loads(row[4]) if row[4] else ["general"]
            entry = {
                "id": row[0],
                "title": row[1],
                "summary": row[2],
                "content": row[3],
                "topics": topics_list,
                "created_at": row[5] if len(row) > 5 else None,
                "updated_at": row[6] if len(row) > 6 else None,
            }
            entries.append(entry)
            for t in topics_list:
                topics.setdefault(t, []).append(entry)
        return {"entries": entries, "topics": topics}


@router.post("/wiki")
def create_wiki_entry(request: Request, payload: dict) -> dict:
    user_id = resolve_user_id(request.headers.get("authorization"))
    entry = {
        "title": payload.get("title", ""),
        "summary": payload.get("summary", ""),
        "content": payload.get("content", ""),
        "topics": payload.get("topics", ["general"]),
    }
    result = save_wiki_entry(user_id, entry, source="manual")
    if not result:
        raise HTTPException(status_code=400, detail="Không thể lưu bài viết")
    return {"id": result["id"], "title": result["title"]}