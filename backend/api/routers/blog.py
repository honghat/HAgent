from __future__ import annotations

import logging
from typing import Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.services.db import get_connection

router = APIRouter(tags=["blog"])
logger = logging.getLogger(__name__)

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

@router.get("/api/blog/posts")
def get_posts() -> list[dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.execute(
            """SELECT p.id, p.title, p.description, p.category, p.read_time, p.date, p.image, p.likes, p.comments, 
                      u.display_name AS author_name, u.avatar AS author_avatar, p.author_title, p.content, p.pinned 
               FROM blog_posts p
               JOIN hagent_users u ON p.user_id = u.id
               ORDER BY p.pinned DESC, p.date DESC"""
        )
        rows = cursor.fetchall()
        return [_row_to_dict(row) for row in rows]

@router.get("/api/blog/posts/{post_id}")
def get_post(post_id: int) -> dict[str, Any]:
    with get_connection() as conn:
        cursor = conn.execute(
            """SELECT p.id, p.title, p.description, p.category, p.read_time, p.date, p.image, p.likes, p.comments, 
                      u.display_name AS author_name, u.avatar AS author_avatar, p.author_title, p.content, p.pinned 
               FROM blog_posts p
               JOIN hagent_users u ON p.user_id = u.id
               WHERE p.id = ?""",
            (post_id,)
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy bài viết")
        return _row_to_dict(row)

@router.post("/api/blog/posts/{post_id}/like")
def like_post(post_id: int) -> dict[str, Any]:
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT likes FROM blog_posts WHERE id = ?", (post_id,)
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy bài viết")
        
        new_likes = row["likes"] + 1
        conn.execute(
            "UPDATE blog_posts SET likes = ? WHERE id = ?",
            (new_likes, post_id)
        )
        conn.commit()
        return {"id": post_id, "likes": new_likes}
