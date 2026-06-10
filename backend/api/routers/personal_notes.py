"""Personal Notes router — CRUD ghi chú + categories."""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from api.services.db import get_db
from api.routers.auth import _get_user_id

router = APIRouter(prefix="/api/personal/notes", tags=["personal_notes"])


class NoteCreate(BaseModel):
    title: str
    content: str = ""
    category_id: Optional[int] = None


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category_id: Optional[int] = None


class CategoryCreate(BaseModel):
    name: str


# ── Categories ──────────────────────────────────────────────────────────────

@router.get("/categories")
def get_categories(request: Request):
    uid = _get_user_id(request)
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, name FROM personal_note_categories WHERE user_id = ? ORDER BY name",
            (uid,),
        ).fetchall()
    return [{"id": r["id"], "name": r["name"]} for r in rows]


@router.post("/categories")
def add_category(body: CategoryCreate, request: Request):
    uid = _get_user_id(request)
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM personal_note_categories WHERE user_id = ? AND name = ?",
            (uid, body.name),
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Tên danh mục đã tồn tại")
        cur = conn.execute(
            "INSERT INTO personal_note_categories (user_id, name) VALUES (?, ?) RETURNING id",
            (uid, body.name),
        )
        new_id = cur.fetchone()[0]
    return {"id": new_id, "name": body.name}


@router.delete("/categories/{cat_id}")
def delete_category(cat_id: int, request: Request):
    uid = _get_user_id(request)
    with get_db() as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM personal_notes WHERE category_id = ?", (cat_id,)
        ).fetchone()[0]
        if count:
            raise HTTPException(status_code=409, detail=f"Còn {count} ghi chú liên kết")
        res = conn.execute(
            "DELETE FROM personal_note_categories WHERE id = ? AND user_id = ?",
            (cat_id, uid),
        )
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Không tìm thấy danh mục")
    return {"ok": True}


# ── Notes ────────────────────────────────────────────────────────────────────

@router.get("")
def get_notes(request: Request):
    uid = _get_user_id(request)
    with get_db() as conn:
        rows = conn.execute(
            """SELECT n.id, n.title, n.content, n.category_id, n.created_at, n.updated_at,
                      c.name as category_name
               FROM personal_notes n
               LEFT JOIN personal_note_categories c ON c.id = n.category_id
               WHERE n.user_id = ?
               ORDER BY n.updated_at DESC""",
            (uid,),
        ).fetchall()
    return [
        {
            "id": r["id"], "title": r["title"], "content": r["content"],
            "category_id": r["category_id"], "category_name": r["category_name"],
            "created_at": r["created_at"], "updated_at": r["updated_at"],
        }
        for r in rows
    ]


@router.post("")
def add_note(body: NoteCreate, request: Request):
    uid = _get_user_id(request)
    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO personal_notes (user_id, title, content, category_id)
               VALUES (?, ?, ?, ?) RETURNING id""",
            (uid, body.title, body.content, body.category_id),
        )
        new_id = cur.fetchone()[0]
    return {"id": new_id, "title": body.title, "content": body.content,
            "category_id": body.category_id}


@router.put("/{note_id}")
def update_note(note_id: int, body: NoteUpdate, request: Request):
    uid = _get_user_id(request)
    fields, params = [], []
    if body.title is not None:
        fields.append("title = ?"); params.append(body.title)
    if body.content is not None:
        fields.append("content = ?"); params.append(body.content)
    if body.category_id is not None:
        fields.append("category_id = ?"); params.append(body.category_id)
    if not fields:
        raise HTTPException(status_code=400, detail="Không có gì để cập nhật")
    fields.append("updated_at = NOW()")
    params += [note_id, uid]
    with get_db() as conn:
        res = conn.execute(
            f"UPDATE personal_notes SET {', '.join(fields)} WHERE id = ? AND user_id = ?",
            params,
        )
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Không tìm thấy ghi chú")
    return {"ok": True}


@router.delete("/{note_id}")
def delete_note(note_id: int, request: Request):
    uid = _get_user_id(request)
    with get_db() as conn:
        res = conn.execute(
            "DELETE FROM personal_notes WHERE id = ? AND user_id = ?", (note_id, uid)
        )
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Không tìm thấy ghi chú")
    return {"ok": True}
