import asyncio
import os
import shutil
import subprocess
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.error import URLError
from urllib.request import Request as UrlRequest, urlopen

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from api.routers.auth import _get_user_id


router = APIRouter(prefix="/api/camera", tags=["camera"])

ROOT_DIR = Path(__file__).resolve().parents[3]
CAMERA_DIR = ROOT_DIR / "data" / "camera"
CAMERA_DIR.mkdir(parents=True, exist_ok=True)

STREAM_URL = os.environ.get("HAGENT_CAMERA_STREAM_URL", "http://100.69.50.64:8080/video")
SNAPSHOT_URL = os.environ.get("HAGENT_CAMERA_SNAPSHOT_URL", "http://100.69.50.64:8080/snapshot.jpg")
HEALTH_URL = os.environ.get("HAGENT_CAMERA_HEALTH_URL", "http://100.69.50.64:8080/health")

_recording_lock = threading.Lock()
_recording: dict[str, object] = {}


class RecordStartBody(BaseModel):
    durationSeconds: Optional[int] = Field(default=None, ge=1, le=3600)


def _timestamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def _relative(path: Path) -> str:
    return str(path.relative_to(ROOT_DIR))


def _fetch_bytes(url: str, timeout: float = 10.0) -> bytes:
    req = UrlRequest(url, headers={"User-Agent": "HAgent-Camera/1.0"})
    try:
      with urlopen(req, timeout=timeout) as response:
          return response.read()
    except URLError as exc:
        raise HTTPException(status_code=502, detail=f"Camera không phản hồi: {exc}") from exc


def _recording_status() -> dict:
    with _recording_lock:
        process = _recording.get("process")
        if isinstance(process, subprocess.Popen):
            code = process.poll()
            if code is None:
                path = Path(str(_recording["path"]))
                return {
                    "recording": True,
                    "path": _relative(path),
                    "filename": path.name,
                    "startedAt": _recording.get("startedAt"),
                }
            log_handle = _recording.get("logHandle")
            if log_handle:
                log_handle.close()
            path = Path(str(_recording.get("path", "")))
            _recording.clear()
            return {
                "recording": False,
                "lastPath": _relative(path) if path.exists() else "",
                "lastFilename": path.name if path.exists() else "",
                "exitCode": code,
            }
    return {"recording": False}


@router.get("/status")
async def status(request: Request):
    _get_user_id(request)
    health = "unknown"
    try:
        health = (await asyncio.to_thread(_fetch_bytes, HEALTH_URL, 3.0)).decode("utf-8", "replace").strip()
    except HTTPException as exc:
        health = str(exc.detail)
    return {
        "ok": True,
        "streamUrl": STREAM_URL,
        "snapshotUrl": SNAPSHOT_URL,
        "storageDir": str(CAMERA_DIR),
        "health": health,
        **_recording_status(),
    }


@router.post("/snapshot")
async def snapshot(request: Request):
    _get_user_id(request)
    data = await asyncio.to_thread(_fetch_bytes, SNAPSHOT_URL, 10.0)
    if not data.startswith(b"\xff\xd8"):
        raise HTTPException(status_code=502, detail="Camera không trả về JPEG hợp lệ")
    path = CAMERA_DIR / f"camera-{_timestamp()}.jpg"
    path.write_bytes(data)
    return {"ok": True, "path": _relative(path), "filename": path.name, "bytes": len(data)}


@router.post("/record/start")
async def record_start(body: RecordStartBody, request: Request):
    _get_user_id(request)
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise HTTPException(status_code=500, detail="Không tìm thấy ffmpeg trên máy HAgent")
    with _recording_lock:
        process = _recording.get("process")
        if isinstance(process, subprocess.Popen) and process.poll() is None:
            raise HTTPException(status_code=409, detail="Camera đang quay video")
        path = CAMERA_DIR / f"camera-{_timestamp()}.mp4"
        log_path = path.with_suffix(".log")
        log_handle = log_path.open("w", encoding="utf-8")
        cmd = [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            STREAM_URL,
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-vf",
            "scale=-2:720",
        ]
        if body.durationSeconds:
            cmd.extend(["-t", str(body.durationSeconds)])
        cmd.append(str(path))
        process = subprocess.Popen(cmd, stdout=log_handle, stderr=log_handle)
        _recording.clear()
        _recording.update({
            "process": process,
            "path": str(path),
            "startedAt": datetime.now().isoformat(),
            "logHandle": log_handle,
        })
    return {"ok": True, "recording": True, "path": _relative(path), "filename": path.name}


@router.post("/record/stop")
async def record_stop(request: Request):
    _get_user_id(request)
    with _recording_lock:
        process = _recording.get("process")
        if not isinstance(process, subprocess.Popen) or process.poll() is not None:
            return {"ok": True, "recording": False}
        path = Path(str(_recording["path"]))
        process.terminate()
    try:
        await asyncio.to_thread(process.wait, 8)
    except subprocess.TimeoutExpired:
        process.kill()
        await asyncio.to_thread(process.wait, 3)
    with _recording_lock:
        log_handle = _recording.get("logHandle")
        if log_handle:
            log_handle.close()
        _recording.clear()
    return {"ok": True, "recording": False, "path": _relative(path), "filename": path.name}


@router.get("/files")
async def files(request: Request):
    _get_user_id(request)
    items = []
    for path in sorted(CAMERA_DIR.glob("camera-*"), key=lambda item: item.stat().st_mtime, reverse=True):
        if path.suffix.lower() not in {".jpg", ".mp4"}:
            continue
        stat = path.stat()
        items.append({
            "filename": path.name,
            "path": _relative(path),
            "bytes": stat.st_size,
            "modifiedAt": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "type": "video" if path.suffix.lower() == ".mp4" else "image",
        })
    return {"ok": True, "items": items[:50]}


@router.get("/files/{filename}")
async def file(filename: str, request: Request):
    _get_user_id(request)
    path = CAMERA_DIR / Path(filename).name
    if not path.exists() or path.parent != CAMERA_DIR:
        raise HTTPException(status_code=404, detail="File không tồn tại")
    media_type = "video/mp4" if path.suffix.lower() == ".mp4" else "image/jpeg"
    return FileResponse(path, media_type=media_type, filename=path.name)


@router.delete("/files/{filename}")
async def delete_file(filename: str, request: Request):
    _get_user_id(request)
    path = CAMERA_DIR / Path(filename).name
    if not path.exists() or path.parent != CAMERA_DIR:
        raise HTTPException(status_code=404, detail="File không tồn tại")
    if path.suffix.lower() not in {".jpg", ".mp4"}:
        raise HTTPException(status_code=400, detail="File không hợp lệ")
    path.unlink()
    log_path = path.with_suffix(".log")
    if log_path.exists():
        log_path.unlink()
    return {"ok": True, "filename": path.name}
