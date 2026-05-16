"""Video task router — stub implementation for frontend compatibility."""
import asyncio
import json
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
        if t["id"] == task_id:
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


@router.post("/tasks/url")
def create_url_task(body: UrlTaskBody, request: Request):
    _get_user_id(request)
    task = {
        "id": uuid.uuid4().hex[:12],
        "title": body.title or body.url,
        "url": body.url,
        "source_type": "youtube" if "youtube.com" in body.url or "youtu.be" in body.url else "url",
        "voice": body.voice,
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
    return task


@router.get("/tasks/yt/info")
async def yt_info(url: str = Query(...), request: Request = None):
    if request:
        _get_user_id(request)
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
    tasks = _load_tasks()
    tasks = [t for t in tasks if t["id"] != task_id]
    _save_tasks(tasks)
    return {"ok": True}


@router.post("/tasks/{task_id}/retry")
def retry_task(task_id: str, request: Request):
    _get_user_id(request)
    tasks = _load_tasks()
    for t in tasks:
        if t["id"] == task_id:
            t["status"] = "queued"
            t["error"] = None
            t["updated_at"] = datetime.now().isoformat()
            _save_tasks(tasks)
            return {"ok": True}
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
