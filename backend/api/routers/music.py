"""
Music Library Router
====================
Quản lý thư viện nhạc nền dùng chung giữa các dự án.
Files lưu tại data/audio-library/tracks/
Metadata lưu trong hagent.db (bảng music_tracks)

GET    /api/music/library          — danh sách tracks
POST   /api/music/upload           — upload file âm thanh
PATCH  /api/music/{id}             — đổi tên
DELETE /api/music/{id}             — xoá
"""

from __future__ import annotations

import uuid
import os
import logging
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from api.services.db import get_db, DB_PATH

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/music", tags=["music"])

DATA_DIR = DB_PATH.parent
MUSIC_DIR = DATA_DIR / "audio-library" / "tracks"
MUSIC_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXT = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"}
MAX_SIZE_MB = 50


def _init_table():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS music_tracks (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                title TEXT NOT NULL,
                duration REAL DEFAULT 0,
                size INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()


_init_table()


def _row_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "filename": row["filename"],
        "title": row["title"],
        "duration": row["duration"],
        "size": row["size"],
        "url": f"/data/audio-library/tracks/{row['filename']}",
        "created_at": row["created_at"],
    }


@router.get("/library")
def list_tracks():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM music_tracks ORDER BY created_at DESC"
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


@router.post("/upload")
async def upload_track(
    file: UploadFile = File(...),
    title: str = Form(""),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Định dạng không hỗ trợ: {ext}. Dùng {', '.join(ALLOWED_EXT)}")

    content = await file.read()
    if len(content) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"File vượt quá {MAX_SIZE_MB}MB")

    track_id = str(uuid.uuid4())
    safe_name = f"{track_id}{ext}"
    dest = MUSIC_DIR / safe_name
    dest.write_bytes(content)

    display_title = title.strip() or Path(file.filename or "").stem or safe_name

    with get_db() as conn:
        conn.execute(
            "INSERT INTO music_tracks (id, filename, title, size) VALUES (?, ?, ?, ?)",
            (track_id, safe_name, display_title, len(content)),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM music_tracks WHERE id=?", (track_id,)).fetchone()

    return _row_to_dict(row)


@router.patch("/{track_id}")
def rename_track(track_id: str, payload: dict):
    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(400, "Title không được trống")
    with get_db() as conn:
        row = conn.execute("SELECT id FROM music_tracks WHERE id=?", (track_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Không tìm thấy track")
        conn.execute("UPDATE music_tracks SET title=? WHERE id=?", (title, track_id))
        conn.commit()
        updated = conn.execute("SELECT * FROM music_tracks WHERE id=?", (track_id,)).fetchone()
    return _row_to_dict(updated)


@router.delete("/{track_id}")
def delete_track(track_id: str):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM music_tracks WHERE id=?", (track_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Không tìm thấy track")
        filepath = MUSIC_DIR / row["filename"]
        if filepath.exists():
            filepath.unlink()
        conn.execute("DELETE FROM music_tracks WHERE id=?", (track_id,))
        conn.commit()
    return {"ok": True}
