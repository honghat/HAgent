from __future__ import annotations

import logging
import re
from datetime import date as _date
from typing import Any
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from api.services.db import get_connection
from api.services import rbac

router = APIRouter(tags=["blog"])
logger = logging.getLogger(__name__)

_SELECT = """SELECT p.id, p.title, p.description, p.category, p.read_time, p.date, p.image, p.likes, p.comments,
                    u.display_name AS author_name, u.avatar AS author_avatar, p.author_title, p.content, p.pinned
             FROM blog_posts p
             JOIN hagent_users u ON p.user_id = u.id"""

class BlogPostResponse(BaseModel):
    id: int
    title: str
    description: str | None = None
    category: str | None = None
    read_time: str | None = None
    date: str | None = None
    image: str | None = None
    likes: int = 0
    comments: int = 0
    author_name: str | None = None
    author_avatar: str | None = None
    author_title: str | None = None
    content: str | None = None
    pinned: bool = False

class BlogPostBody(BaseModel):
    title: str
    description: str | None = None
    category: str | None = None
    read_time: str | None = None
    date: str | None = None
    image: str | None = None
    author_title: str | None = None
    content: str | None = None
    pinned: bool = False

def _row_to_dict(row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "category": row["category"],
        "read_time": row["read_time"],
        "date": row["date"],
        "image": row["image"],
        "likes": row["likes"],
        "comments": row["comments"],
        "author_name": row["author_name"],
        "author_avatar": row["author_avatar"],
        "author_title": row["author_title"],
        "content": row["content"],
        "pinned": bool(row["pinned"])
    }

def _estimate_read_time(content: str | None) -> str:
    words = len(re.sub(r"<[^>]+>", " ", content or "").split())
    return f"{max(1, round(words / 200))} phút đọc"

def _fetch_post(conn, post_id: int) -> dict[str, Any]:
    row = conn.execute(_SELECT + " WHERE p.id = ?", (post_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài viết")
    return _row_to_dict(row)

@router.get("/api/blog/posts")
def get_posts() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(_SELECT + " ORDER BY p.pinned DESC, p.date DESC").fetchall()
        return [_row_to_dict(row) for row in rows]

@router.get("/api/blog/posts/{post_id}")
def get_post(post_id: int) -> dict[str, Any]:
    with get_connection() as conn:
        return _fetch_post(conn, post_id)

@router.post("/api/blog/posts")
def create_post(body: BlogPostBody, request: Request) -> dict[str, Any]:
    uid, _ = rbac.require_admin(request)
    if not (body.title or "").strip():
        raise HTTPException(status_code=400, detail="Tiêu đề không được để trống")
    post_date = (body.date or "").strip() or _date.today().isoformat()
    read_time = (body.read_time or "").strip() or _estimate_read_time(body.content)
    with get_connection() as conn:
        cur = conn.execute(
            """INSERT INTO blog_posts
                   (user_id, title, description, category, read_time, date, image, author_title, content, pinned)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id""",
            (uid, body.title.strip(), body.description, body.category, read_time, post_date,
             body.image, (body.author_title or "Vibe Coder"), body.content, body.pinned),
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        return _fetch_post(conn, new_id)

@router.put("/api/blog/posts/{post_id}")
def update_post(post_id: int, body: BlogPostBody, request: Request) -> dict[str, Any]:
    rbac.require_admin(request)
    if not (body.title or "").strip():
        raise HTTPException(status_code=400, detail="Tiêu đề không được để trống")
    post_date = (body.date or "").strip() or _date.today().isoformat()
    read_time = (body.read_time or "").strip() or _estimate_read_time(body.content)
    with get_connection() as conn:
        if not conn.execute("SELECT id FROM blog_posts WHERE id = ?", (post_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy bài viết")
        conn.execute(
            """UPDATE blog_posts
               SET title=?, description=?, category=?, read_time=?, date=?, image=?, author_title=?, content=?, pinned=?
               WHERE id=?""",
            (body.title.strip(), body.description, body.category, read_time, post_date,
             body.image, (body.author_title or "Vibe Coder"), body.content, body.pinned, post_id),
        )
        conn.commit()
        return _fetch_post(conn, post_id)

@router.delete("/api/blog/posts/{post_id}")
def delete_post(post_id: int, request: Request) -> dict[str, Any]:
    rbac.require_admin(request)
    with get_connection() as conn:
        if not conn.execute("SELECT id FROM blog_posts WHERE id = ?", (post_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy bài viết")
        conn.execute("DELETE FROM blog_posts WHERE id = ?", (post_id,))
        conn.commit()
        return {"ok": True, "id": post_id}

@router.post("/api/blog/posts/{post_id}/like")
def like_post(post_id: int) -> dict[str, Any]:
    with get_connection() as conn:
        row = conn.execute("SELECT likes FROM blog_posts WHERE id = ?", (post_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy bài viết")
        new_likes = row["likes"] + 1
        conn.execute("UPDATE blog_posts SET likes = ? WHERE id = ?", (new_likes, post_id))
        conn.commit()
        return {"id": post_id, "likes": new_likes}
