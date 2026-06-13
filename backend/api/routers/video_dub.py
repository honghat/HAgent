"""Router: Video đàn tranh (lồng tiếng Trung→Việt). Prefix /api/video-dub.

Auth native HAgent (resolve_user_id) + gate quyền 'video:dub'. Lịch sử lưu Postgres.
"""

from __future__ import annotations

import json
import shutil

import requests

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from api.services import rbac
from api.services.user_store import resolve_user_id, get_user_by_id
from api.services import video_dub_pipeline as vd

# Khởi tạo bảng + khôi phục task dở dang khi import (theo convention auth.py/admin.py).
vd.init_video_dub_tables()
vd.requeue_stuck()

router = APIRouter(prefix="/api/video-dub", tags=["video-dub"])


def _token(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    return (auth.replace("Bearer ", "").strip()
            or request.query_params.get("t", "")
            or request.cookies.get("hagent_token", ""))


def require_video(request: Request) -> str:
    uid = resolve_user_id(_token(request))
    if not uid:
        raise HTTPException(status_code=401, detail="Phiên không hợp lệ")
    user = get_user_by_id(uid)
    if not user or not rbac.can_role(user.get("role", "user"), "video:dub"):
        raise HTTPException(status_code=403, detail="Bạn không có quyền dùng chức năng này")
    return uid


def _safe_voice(v: str | None) -> str:
    return "namminh" if v == "namminh" else "hoaimy"


class YoutubeBody(BaseModel):
    url: str
    title: str | None = None
    voice: str | None = "hoaimy"
    sourceLang: str | None = "zh"


@router.post("/upload")
async def upload(
    request: Request,
    video: UploadFile = File(...),
    title: str = Form(""),
    voice: str = Form("hoaimy"),
    sourceLang: str = Form("zh"),
    uid: str = Depends(require_video),
):
    safe_name = (video.filename or "video.mp4").replace("/", "_").replace(" ", "_")
    fname = f"{vd._now_ms()}-{safe_name}"
    dest = vd.UPLOAD_DIR / fname
    with open(dest, "wb") as f:
        shutil.copyfileobj(video.file, f)
    task_id = vd.create_task(uid, (title or safe_name), "upload", fname,
                             sourceLang or "zh", _safe_voice(voice))
    vd.enqueue(task_id)
    return {"id": task_id}


@router.post("/youtube")
def youtube(body: YoutubeBody, uid: str = Depends(require_video)):
    if not body.url:
        raise HTTPException(status_code=400, detail="Thiếu URL")
    title = body.title or vd.youtube_title(body.url)
    task_id = vd.create_task(uid, title, "youtube", body.url,
                             body.sourceLang or "zh", _safe_voice(body.voice))
    vd.enqueue(task_id)
    return {"id": task_id}


@router.get("/yt-info")
def yt_info(url: str = Query(...), uid: str = Depends(require_video)):
    try:
        return {"title": vd.youtube_title(url)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)[:200])


@router.get("/tasks")
def tasks(uid: str = Depends(require_video)):
    return {"tasks": vd.list_tasks(uid), "queue": {"pending": vd._task_queue.qsize()}}


@router.get("/tasks/{task_id}")
def task_detail(task_id: int, uid: str = Depends(require_video)):
    task = vd.get_task(task_id, uid)
    if not task:
        raise HTTPException(status_code=404, detail="not found")
    try:
        logs = json.loads(task.get("progress") or "[]")
        if not isinstance(logs, list):
            logs = []
    except Exception:
        logs = []
    task["logs"] = logs
    return task


@router.delete("/tasks/{task_id}")
def task_delete(task_id: int, uid: str = Depends(require_video)):
    if not vd.delete_task(task_id, uid):
        raise HTTPException(status_code=404, detail="not found")
    return {"ok": True}


@router.post("/tasks/{task_id}/retry")
def task_retry(task_id: int, uid: str = Depends(require_video)):
    task = vd.get_task(task_id, uid)
    if not task:
        raise HTTPException(status_code=404, detail="not found")
    vd._update(task_id, status="queued", error=None, progress=None)
    vd.enqueue(task_id)
    return {"ok": True}


@router.get("/file/{name}")
def file_download(name: str, request: Request, uid: str = Depends(require_video)):
    # chỉ owner: name phải là video_file/srt_file của 1 task thuộc user
    with vd.get_connection() as conn:
        row = conn.execute(
            "SELECT id, video_file, srt_file FROM video_dub_tasks WHERE user_id=? AND (video_file=? OR srt_file=?)",
            (uid, name, name),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="not found")
    # Nếu file đã upload lên Drive thì proxy từ Drive API
    col = "video_file" if row["video_file"] == name else "srt_file"
    stored = row[col]
    if stored and str(stored).startswith("drive:"):
        fid = str(stored)[6:]
        mime = "video/mp4" if col == "video_file" else "text/plain; charset=utf-8"
        token = vd._drive_access_token()
        if not token:
            raise HTTPException(status_code=502, detail="drive token failed")
        resp = requests.get(
            f"https://www.googleapis.com/drive/v3/files/{fid}?alt=media",
            headers={"Authorization": f"Bearer {token}"},
            stream=True, timeout=600,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="drive fetch failed")
        return StreamingResponse(
            resp.iter_content(chunk_size=65536),
            media_type=mime,
            headers={
                "Content-Disposition": f'inline; filename="{name}"',
                "Content-Length": resp.headers.get("Content-Length", ""),
            },
        )
    path = vd.OUTPUT_DIR / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="file missing")
    return FileResponse(str(path))


@router.get("/health")
def health(uid: str = Depends(require_video)):
    return vd.health()
