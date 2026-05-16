"""Video task router — stub implementation for frontend compatibility."""
import asyncio
import json
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from api.routers.auth import _get_user_id

router = APIRouter(prefix="/api/video", tags=["video"])

DATA_DIR = Path(__file__).resolve().parents[5] / "data" / "video"
DATA_DIR.mkdir(parents=True, exist_ok=True)
TASKS_FILE = DATA_DIR / "tasks.json"


def _load_tasks():
    """Load tasks from SQLite database (shared with video pipeline)."""
    try:
        from api.services.db import get_connection
        conn = get_connection()
        rows = conn.execute(
            "SELECT * FROM video_tasks ORDER BY id DESC LIMIT 50"
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception:
        pass
    if TASKS_FILE.exists():
        try:
            return json.loads(TASKS_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            return []
    return []


def _save_tasks(tasks):
    TASKS_FILE.write_text(json.dumps(tasks, ensure_ascii=False, indent=2))


def _get_task(task_id: str):
    tasks = _load_tasks()
    for t in tasks:
        if str(t["id"]) == task_id:
            # Parse progress JSON into logs
            try:
                raw = t.get("progress") or ""
                import json as _json
                parsed = _json.loads(raw) if isinstance(raw, str) and raw.strip() else []
                if isinstance(parsed, list):
                    t["logs"] = parsed
            except (json.JSONDecodeError, TypeError):
                pass
            return t
    return None


class UrlTaskBody(BaseModel):
    url: str
    title: str = ""
    voice: str = "namminh"


@router.get("/tasks")
def list_tasks(request: Request):
    _get_user_id(request)
    tasks = _load_tasks()
    return {"tasks": tasks}


def _enqueue_task(task_id: int):
    """Enqueue a video task for pipeline processing using the event loop."""
    try:
        from api.services.video_pipeline import VideoQueue
        try:
            loop = asyncio.get_running_loop()
            loop.call_soon_threadsafe(VideoQueue.enqueue, task_id)
        except RuntimeError:
            VideoQueue.enqueue(task_id)
    except Exception:
        pass


def _create_task_in_db(
    title: str,
    source_type: str,
    source_ref: str,
    voice: str = "namminh",
    source_lang: str = "zh",
) -> int:
    """Create a task in SQLite and enqueue for pipeline processing. Returns task ID."""
    try:
        from api.services.db import get_connection
        conn = get_connection()
        now = int(time.time() * 1000)
        cur = conn.execute(
            """INSERT INTO video_tasks
               (user_id, title, source_type, source_ref, source_lang, status, voice, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?)""",
            ("user", title, source_type, source_ref, source_lang, voice, now, now),
        )
        task_id = cur.lastrowid
        conn.commit()
        conn.close()
        _enqueue_task(task_id)
        return task_id
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tasks/url")
async def create_url_task(body: UrlTaskBody, request: Request):
    _get_user_id(request)
    source_type = "youtube" if "youtube.com" in body.url or "youtu.be" in body.url \
        else "bilibili" if "bilibili.com" in body.url else "url"
    task_id = _create_task_in_db(
        title=body.title or body.url,
        source_type=source_type,
        source_ref=body.url,
        voice=body.voice,
    )
    return {"id": task_id}


@router.get("/tasks/yt/info")
async def yt_info(url: str = Query(...), request: Request = None):
    if request:
        _get_user_id(request)
    # Try yt-dlp first (supports YouTube, Bilibili, and many others)
    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "yt_dlp", "--skip-download", "--print", "title", url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=15)
        title = stdout.decode("utf-8", errors="replace").strip()
        if title:
            return {"title": title}
    except Exception:
        pass
    # Fallback: YouTube oembed
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"https://www.youtube.com/oembed?url={url}&format=json")
            if r.status_code == 200:
                data = r.json()
                return {"title": data.get("title", "")}
    except Exception:
        pass
    return {"title": ""}


@router.get("/tasks/{task_id}")
def get_task(task_id: str, request: Request):
    _get_user_id(request)
    task = _get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.delete("/tasks/{task_id}")
def delete_task(task_id: str, request: Request):
    _get_user_id(request)
    try:
        from api.services.db import get_connection
        conn = get_connection()
        conn.execute("DELETE FROM video_tasks WHERE id=?", (int(task_id),))
        conn.commit()
        conn.close()
    except Exception:
        pass
    return {"ok": True}


@router.post("/tasks/{task_id}/retry")
async def retry_task(task_id: str, request: Request):
    _get_user_id(request)
    try:
        from api.services.db import get_connection
        conn = get_connection()
        conn.execute(
            "UPDATE video_tasks SET status='queued', error=NULL, progress=NULL, updated_at=? WHERE id=?",
            (int(time.time() * 1000), int(task_id)),
        )
        conn.commit()
        conn.close()
        _enqueue_task(int(task_id))
        return {"ok": True}
    except Exception:
        pass
    raise HTTPException(status_code=404, detail="Task not found")


@router.post("/tasks/upload")
async def upload_video(
    request: Request,
    video: UploadFile = None,
    voice: str = "namminh",
):
    _get_user_id(request)
    task_id = uuid.uuid4().hex[:12]
    filename = video.filename if video else "unknown.mp4"
    upload_path = DATA_DIR / f"{task_id}_{filename}"
    if video:
        content = await video.read()
        upload_path.write_bytes(content)
    task = {
        "id": task_id,
        "title": filename,
        "source_type": "upload",
        "voice": voice,
        "status": "queued",
        "progress": 0,
        "segments_count": 0,
        "duration": 0,
        "error": None,
        "output_url": None,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }
    tasks = _load_tasks()
    tasks.insert(0, task)
    _save_tasks(tasks)
    return {"id": task_id}


@router.get("/tasks/{task_id}/progress")
async def task_progress(task_id: str, request: Request):
    _get_user_id(request)

    async def event_generator():
        yield {"data": json.dumps({"message": "connected"})}
        i = 0
        while i < 24:
            task = _get_task(task_id)
            if task and task.get("status") in ("done", "error"):
                if task["status"] == "done":
                    yield {"data": json.dumps({"message": "Hoàn tất!", "done": True})}
                else:
                    yield {"data": json.dumps({"message": task.get("error", "Lỗi")})}
                return
            await asyncio.sleep(4)
            i += 1
        task = _get_task(task_id)
        if task:
            task["status"] = "error"
            task["error"] = "Hết thời gian chờ"
            _save_tasks(_load_tasks())

    return EventSourceResponse(event_generator())


@router.get("/auth/youtube/login")
def youtube_login(token: str = Query(...)):
    """Stub: YouTube OAuth redirect."""
    return {"ok": False, "error": "YouTube auth not implemented yet"}
