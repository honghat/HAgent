"""Video editor router — CRUD project, asset, render job (ffmpeg subprocess)."""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from api.routers.auth import _get_user_id
from api.services.db import get_connection

router = APIRouter(prefix="/api/editor", tags=["video-editor"])

DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "editor"
ASSET_DIR = DATA_DIR / "assets"
OUTPUT_DIR = DATA_DIR / "output"
AUDIO_LIB_DIR = Path(__file__).resolve().parents[3] / "data" / "audio-library"
ASSET_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
AUDIO_LIB_DIR.mkdir(parents=True, exist_ok=True)


def _now() -> int:
    return int(time.time() * 1000)


# ----- schemas -----
class ProjectIn(BaseModel):
    title: str = "Untitled"
    width: int = 1920
    height: int = 1080
    fps: int = 30


class TimelineIn(BaseModel):
    timeline: dict | None = None
    duration: float | None = None
    width: int | None = None
    height: int | None = None
    fps: int | None = None
    title: str | None = None
    watermark: dict | None = None  # {enabled, asset_id, position, opacity, scale}


# ----- projects -----
@router.get("/projects")
def list_projects(request: Request):
    uid = _get_user_id(request)
    conn = get_connection()
    rows = conn.execute(
        "SELECT id,title,width,height,fps,duration,updated_at FROM editor_projects "
        "WHERE user_id=? ORDER BY updated_at DESC LIMIT 100",
        (uid,),
    ).fetchall()
    conn.close()
    return {"projects": [dict(r) for r in rows]}


@router.post("/projects")
def create_project(body: ProjectIn, request: Request):
    uid = _get_user_id(request)
    now = _now()
    conn = get_connection()
    cur = conn.execute(
        "INSERT INTO editor_projects(user_id,title,width,height,fps,duration,timeline_json,created_at,updated_at)"
        " VALUES(?,?,?,?,?,0,?,?,?)",
        (uid, body.title, body.width, body.height, body.fps,
         '{"tracks":[{"id":"v1","kind":"video","name":"Video 1","items":[]},{"id":"t1","kind":"text","name":"Text 1","items":[]},{"id":"a1","kind":"audio","name":"Audio 1","items":[]}]}',
         now, now),
    )
    pid = cur.lastrowid
    conn.commit()
    conn.close()
    return {"id": pid}


@router.get("/projects/{pid}")
def get_project(pid: int, request: Request):
    uid = _get_user_id(request)
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM editor_projects WHERE id=? AND user_id=?", (pid, uid)
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Project not found")
    assets = conn.execute(
        "SELECT id,kind,path,name,duration,width,height FROM editor_assets WHERE project_id=? ORDER BY id",
        (pid,),
    ).fetchall()
    conn.close()
    p = dict(row)
    try:
        tl = json.loads(p.pop("timeline_json") or "{}")
    except json.JSONDecodeError:
        tl = {"tracks": []}

    # Lọc orphan items: clip có asset_path nhưng file đã bị xoá
    project_root = Path(__file__).resolve().parents[3]
    cleaned = False
    for tr in tl.get("tracks", []):
        if tr.get("kind") == "text":
            continue
        kept = []
        for it in tr.get("items", []):
            ap = it.get("asset_path") or ""
            if ap.startswith("/data/editor/assets/"):
                full = project_root / "data" / "editor" / "assets" / Path(ap).name
                if not full.exists():
                    cleaned = True
                    continue
            kept.append(it)
        tr["items"] = kept
    if cleaned:
        conn = get_connection()
        conn.execute(
            "UPDATE editor_projects SET timeline_json=?,updated_at=? WHERE id=?",
            (json.dumps(tl), _now(), pid),
        )
        conn.commit()
        conn.close()

    p["timeline"] = tl
    p["assets"] = [dict(a) for a in assets]
    try:
        p["watermark"] = json.loads(p.pop("watermark_json") or "null") or {}
    except Exception:
        p["watermark"] = {}
    return p


@router.put("/projects/{pid}")
def update_project(pid: int, body: TimelineIn, request: Request):
    uid = _get_user_id(request)
    conn = get_connection()
    row = conn.execute(
        "SELECT id FROM editor_projects WHERE id=? AND user_id=?", (pid, uid)
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Project not found")

    sets, vals = [], []
    if body.timeline is not None:
        sets.append("timeline_json=?")
        vals.append(json.dumps(body.timeline))
    if body.duration is not None:
        sets.append("duration=?")
        vals.append(body.duration)
    if body.width is not None:
        sets.append("width=?")
        vals.append(body.width)
    if body.height is not None:
        sets.append("height=?")
        vals.append(body.height)
    if body.fps is not None:
        sets.append("fps=?")
        vals.append(body.fps)
    if body.title is not None:
        sets.append("title=?")
        vals.append(body.title)
    if body.watermark is not None:
        sets.append("watermark_json=?")
        vals.append(json.dumps(body.watermark))
    if not sets:
        conn.close()
        return {"ok": True}
    sets.append("updated_at=?")
    vals.extend([_now(), pid])
    conn.execute(
        f"UPDATE editor_projects SET {','.join(sets)} WHERE id=?", vals
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@router.delete("/projects/{pid}")
def delete_project(pid: int, request: Request):
    uid = _get_user_id(request)
    conn = get_connection()
    conn.execute("DELETE FROM editor_projects WHERE id=? AND user_id=?", (pid, uid))
    conn.commit()
    conn.close()
    return {"ok": True}


# ----- assets -----
@router.post("/projects/{pid}/assets")
async def upload_asset(pid: int, request: Request, file: UploadFile = File(...)):
    uid = _get_user_id(request)
    conn = get_connection()
    row = conn.execute(
        "SELECT id FROM editor_projects WHERE id=? AND user_id=?", (pid, uid)
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Project not found")

    ext = Path(file.filename or "").suffix.lower()
    name = file.filename or f"asset{ext}"
    kind = "video" if ext in {".mp4", ".mov", ".mkv", ".webm", ".avi"} \
        else "audio" if ext in {".mp3", ".wav", ".m4a", ".aac", ".ogg"} \
        else "image" if ext in {".jpg", ".jpeg", ".png", ".webp", ".bmp"} \
        else "other"
    fname = f"{pid}_{uuid.uuid4().hex[:8]}{ext}"
    fpath = ASSET_DIR / fname
    content = await file.read()
    fpath.write_bytes(content)

    duration, width, height = _probe_media(fpath)
    cur = conn.execute(
        "INSERT INTO editor_assets(project_id,kind,path,name,duration,width,height,created_at)"
        " VALUES(?,?,?,?,?,?,?,?)",
        (pid, kind, f"/data/editor/assets/{fname}", name, duration, width, height, _now()),
    )
    aid = cur.lastrowid
    conn.commit()
    conn.close()
    return {
        "id": aid, "kind": kind, "path": f"/data/editor/assets/{fname}",
        "name": name, "duration": duration, "width": width, "height": height,
    }


def _probe_media(path: Path):
    """Probe duration/dims via ffprobe — fast, optional."""
    try:
        import subprocess
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-print_format", "json",
             "-show_streams", "-show_format", str(path)],
            capture_output=True, text=True, timeout=8,
        )
        data = json.loads(out.stdout or "{}")
        dur = float((data.get("format") or {}).get("duration") or 0)
        w = h = 0
        for s in data.get("streams", []):
            if s.get("codec_type") == "video":
                w = int(s.get("width") or 0)
                h = int(s.get("height") or 0)
                break
        return dur, w, h
    except Exception:
        return 0.0, 0, 0


class ImportAssetIn(BaseModel):
    source: str  # 'photo' or 'video'
    name: str    # filename in source store


@router.post("/projects/{pid}/assets/import")
def import_asset(pid: int, body: ImportAssetIn, request: Request):
    """Import an existing photo (cache/images) or video (cache/videos) into the project."""
    uid = _get_user_id(request)
    conn = get_connection()
    row = conn.execute(
        "SELECT id FROM editor_projects WHERE id=? AND user_id=?", (pid, uid)
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Project not found")

    project_root = Path(__file__).resolve().parents[2]
    if body.source == "photo":
        src = project_root / "cache" / "images" / body.name
        kind = "image"
    elif body.source == "video":
        src = project_root / "cache" / "videos" / body.name
        kind = "video"
    else:
        conn.close()
        raise HTTPException(400, "source must be 'photo' or 'video'")
    if not src.exists():
        conn.close()
        raise HTTPException(404, f"source file not found: {src}")

    ext = src.suffix.lower()
    fname = f"{pid}_{uuid.uuid4().hex[:8]}{ext}"
    dst = ASSET_DIR / fname
    dst.write_bytes(src.read_bytes())
    duration, w, h = _probe_media(dst)
    cur = conn.execute(
        "INSERT INTO editor_assets(project_id,kind,path,name,duration,width,height,created_at)"
        " VALUES(?,?,?,?,?,?,?,?)",
        (pid, kind, f"/data/editor/assets/{fname}", body.name, duration, w, h, _now()),
    )
    aid = cur.lastrowid
    conn.commit()
    conn.close()
    return {
        "id": aid, "kind": kind, "path": f"/data/editor/assets/{fname}",
        "name": body.name, "duration": duration, "width": w, "height": h,
    }


@router.delete("/assets/{aid}")
def delete_asset(aid: int, request: Request):
    _get_user_id(request)
    conn = get_connection()
    row = conn.execute("SELECT path FROM editor_assets WHERE id=?", (aid,)).fetchone()
    if row:
        try:
            p = ASSET_DIR / Path(row["path"]).name
            if p.exists():
                p.unlink()
        except OSError:
            pass
    conn.execute("DELETE FROM editor_assets WHERE id=?", (aid,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ----- render output management -----
@router.get("/outputs")
def list_outputs(request: Request):
    """List tất cả file render của user (qua editor_render_jobs)."""
    uid = _get_user_id(request)
    conn = get_connection()
    rows = conn.execute(
        "SELECT j.id,j.project_id,j.status,j.progress,j.output_path,j.error,j.created_at,j.updated_at,p.title "
        "FROM editor_render_jobs j JOIN editor_projects p ON p.id=j.project_id "
        "WHERE p.user_id=? ORDER BY j.id DESC LIMIT 200",
        (uid,),
    ).fetchall()
    conn.close()
    items = []
    for r in rows:
        d = dict(r)
        if d.get("output_path"):
            fp = OUTPUT_DIR / Path(d["output_path"]).name
            d["size"] = fp.stat().st_size if fp.exists() else 0
            d["exists"] = fp.exists()
        else:
            d["size"] = 0
            d["exists"] = False
        items.append(d)
    return {"items": items}


@router.delete("/outputs/{jid}")
def delete_output(jid: int, request: Request):
    uid = _get_user_id(request)
    conn = get_connection()
    row = conn.execute(
        "SELECT j.id,j.output_path FROM editor_render_jobs j "
        "JOIN editor_projects p ON p.id=j.project_id "
        "WHERE j.id=? AND p.user_id=?", (jid, uid),
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Job not found")
    if row["output_path"]:
        fp = OUTPUT_DIR / Path(row["output_path"]).name
        try:
            if fp.exists():
                fp.unlink()
        except OSError:
            pass
    conn.execute("DELETE FROM editor_render_jobs WHERE id=?", (jid,))
    conn.commit()
    conn.close()
    return {"ok": True}


class YouTubeUploadIn(BaseModel):
    title: str
    description: str = ""
    privacy: str = "private"


@router.post("/outputs/{jid}/youtube")
async def upload_output_to_youtube(jid: int, body: YouTubeUploadIn, request: Request):
    """Upload 1 file render lên YouTube."""
    uid = _get_user_id(request)
    conn = get_connection()
    row = conn.execute(
        "SELECT j.output_path FROM editor_render_jobs j "
        "JOIN editor_projects p ON p.id=j.project_id "
        "WHERE j.id=? AND p.user_id=?", (jid, uid),
    ).fetchone()
    conn.close()
    if not row or not row["output_path"]:
        raise HTTPException(404, "Job not found or no output")
    video_path = OUTPUT_DIR / Path(row["output_path"]).name
    if not video_path.exists():
        raise HTTPException(404, "Video file not found on disk")
    try:
        from api.routers.video import _youtube_headers
        import httpx
        headers = _youtube_headers()
        if not headers:
            return {"ok": False, "error": "YouTube chưa được kết nối. Đăng nhập qua /api/video/auth/youtube/login"}
        metadata = {
            "snippet": {"title": body.title, "description": body.description},
            "status": {"privacyStatus": body.privacy},
        }
        import json as _json
        async with httpx.AsyncClient(timeout=300) as client:
            r = await client.post(
                "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
                headers={**headers, "X-Upload-Content-Type": "video/mp4",
                          "X-Upload-Content-Length": str(video_path.stat().st_size),
                          "Content-Type": "application/json"},
                content=_json.dumps(metadata).encode(),
            )
            if r.status_code not in (200, 201):
                return {"ok": False, "error": f"YouTube init failed: {r.status_code} {r.text[:200]}"}
            upload_url = r.headers.get("location")
            with open(video_path, "rb") as f:
                r2 = await client.put(upload_url, content=f.read(),
                    headers={"Content-Type": "video/mp4"})
            if r2.status_code in (200, 201):
                vid_id = r2.json().get("id", "")
                return {"ok": True, "url": f"https://youtu.be/{vid_id}" if vid_id else ""}
            return {"ok": False, "error": f"Upload failed: {r2.status_code} {r2.text[:200]}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ----- audio library (shared across projects) -----
AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}


@router.get("/audio-library")
def list_audio_library(request: Request):
    uid = _get_user_id(request)
    user_dir = AUDIO_LIB_DIR / str(uid)
    user_dir.mkdir(parents=True, exist_ok=True)
    items = []
    for f in sorted(user_dir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if f.suffix.lower() not in AUDIO_EXTS:
            continue
        dur, _, _ = _probe_media(f)
        items.append({
            "name": f.name,
            "path": f"/data/audio-library/{uid}/{f.name}",
            "duration": dur,
            "size": f.stat().st_size,
        })
    return {"items": items}


@router.post("/audio-library/upload")
async def upload_audio_library(request: Request, file: UploadFile = File(...)):
    uid = _get_user_id(request)
    user_dir = AUDIO_LIB_DIR / str(uid)
    user_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "").suffix.lower()
    if ext not in AUDIO_EXTS:
        raise HTTPException(400, f"Audio extension not supported: {ext}")
    safe = Path(file.filename or f"audio{ext}").name
    fp = user_dir / safe
    if fp.exists():
        fp = user_dir / f"{fp.stem}_{uuid.uuid4().hex[:6]}{ext}"
    fp.write_bytes(await file.read())
    dur, _, _ = _probe_media(fp)
    return {
        "name": fp.name,
        "path": f"/data/audio-library/{uid}/{fp.name}",
        "duration": dur,
        "size": fp.stat().st_size,
    }


@router.delete("/audio-library/{name}")
def delete_audio_library(name: str, request: Request):
    uid = _get_user_id(request)
    fp = AUDIO_LIB_DIR / str(uid) / Path(name).name
    if fp.exists():
        fp.unlink()
    return {"ok": True}


class ImportAudioIn(BaseModel):
    name: str


@router.post("/projects/{pid}/audio-library/import")
def import_audio_from_library(pid: int, body: ImportAudioIn, request: Request):
    """Copy 1 file từ audio-library của user vào project assets."""
    uid = _get_user_id(request)
    conn = get_connection()
    row = conn.execute(
        "SELECT id FROM editor_projects WHERE id=? AND user_id=?", (pid, uid)
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Project not found")
    src = AUDIO_LIB_DIR / str(uid) / Path(body.name).name
    if not src.exists():
        conn.close()
        raise HTTPException(404, f"Audio not found: {body.name}")
    ext = src.suffix.lower()
    fname = f"{pid}_{uuid.uuid4().hex[:8]}{ext}"
    dst = ASSET_DIR / fname
    dst.write_bytes(src.read_bytes())
    duration, _, _ = _probe_media(dst)
    cur = conn.execute(
        "INSERT INTO editor_assets(project_id,kind,path,name,duration,width,height,created_at)"
        " VALUES(?,?,?,?,?,?,?,?)",
        (pid, "audio", f"/data/editor/assets/{fname}", body.name, duration, 0, 0, _now()),
    )
    aid = cur.lastrowid
    conn.commit()
    conn.close()
    return {
        "id": aid, "kind": "audio", "path": f"/data/editor/assets/{fname}",
        "name": body.name, "duration": duration, "width": 0, "height": 0,
    }


MUSIC_TRACKS_DIR = Path(__file__).resolve().parents[3] / "data" / "audio-library" / "tracks"


class MusicImportIn(BaseModel):
    track_id: str
    filename: str
    title: str


@router.post("/projects/{pid}/music-import")
def import_music_track(pid: int, body: MusicImportIn, request: Request):
    """Copy 1 track từ music library toàn cục vào project assets."""
    uid = _get_user_id(request)
    conn = get_connection()
    row = conn.execute(
        "SELECT id FROM editor_projects WHERE id=? AND user_id=?", (pid, uid)
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Project not found")
    src = MUSIC_TRACKS_DIR / Path(body.filename).name
    if not src.exists():
        conn.close()
        raise HTTPException(404, f"Track file not found: {body.filename}")
    ext = src.suffix.lower()
    fname = f"{pid}_{uuid.uuid4().hex[:8]}{ext}"
    dst = ASSET_DIR / fname
    dst.write_bytes(src.read_bytes())
    duration, _, _ = _probe_media(dst)
    cur = conn.execute(
        "INSERT INTO editor_assets(project_id,kind,path,name,duration,width,height,created_at)"
        " VALUES(?,?,?,?,?,?,?,?)",
        (pid, "music", f"/data/editor/assets/{fname}", body.title, duration, 0, 0, _now()),
    )
    aid = cur.lastrowid
    conn.commit()
    conn.close()
    return {
        "id": aid, "kind": "music", "path": f"/data/editor/assets/{fname}",
        "name": body.title, "duration": duration, "width": 0, "height": 0,
    }


class RenderIn(BaseModel):
    width: int | None = None
    height: int | None = None
    fps: int | None = None
    crf: int | None = None  # quality 0-51, default 20


# ----- render -----
@router.post("/projects/{pid}/render")
def start_render(pid: int, request: Request, body: RenderIn | None = None):
    uid = _get_user_id(request)
    conn = get_connection()
    proj = conn.execute(
        "SELECT id FROM editor_projects WHERE id=? AND user_id=?", (pid, uid)
    ).fetchone()
    if not proj:
        conn.close()
        raise HTTPException(404, "Project not found")
    now = _now()
    overrides = {}
    if body:
        for k in ("width", "height", "fps", "crf"):
            v = getattr(body, k, None)
            if v is not None:
                overrides[k] = v
    cur = conn.execute(
        "INSERT INTO editor_render_jobs(project_id,status,progress,error,created_at,updated_at)"
        " VALUES(?,?,?,?,?,?)",
        (pid, "queued", 0, json.dumps(overrides) if overrides else None, now, now),
    )
    jid = cur.lastrowid
    conn.commit()
    conn.close()

    try:
        from api.services.video_editor_render import enqueue
        enqueue(jid)
    except Exception as e:
        _set_job_error(jid, str(e))
    return {"job_id": jid}


def _set_job_error(jid: int, err: str):
    conn = get_connection()
    conn.execute(
        "UPDATE editor_render_jobs SET status='error',error=?,updated_at=? WHERE id=?",
        (err, _now(), jid),
    )
    conn.commit()
    conn.close()


@router.get("/jobs/{jid}")
def get_job(jid: int, request: Request):
    _get_user_id(request)
    conn = get_connection()
    row = conn.execute("SELECT * FROM editor_render_jobs WHERE id=?", (jid,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Job not found")
    return dict(row)


@router.get("/jobs/{jid}/stream")
async def stream_job(jid: int, request: Request):
    _get_user_id(request)

    async def gen():
        last = None
        for _ in range(600):
            conn = get_connection()
            row = conn.execute(
                "SELECT status,progress,output_path,error FROM editor_render_jobs WHERE id=?",
                (jid,),
            ).fetchone()
            conn.close()
            if not row:
                yield {"data": json.dumps({"status": "missing"})}
                return
            d = dict(row)
            if d != last:
                yield {"data": json.dumps(d)}
                last = d
            if d["status"] in ("done", "error"):
                return
            await asyncio.sleep(1)

    return EventSourceResponse(gen())


# ----- reup -----
REUP_DIR = DATA_DIR / "reup"
REUP_IN_DIR = REUP_DIR / "input"
REUP_OUT_DIR = REUP_DIR / "output"
REUP_IN_DIR.mkdir(parents=True, exist_ok=True)
REUP_OUT_DIR.mkdir(parents=True, exist_ok=True)


class ReupOptionsIn(BaseModel):
    source_path: str
    flip: bool = False
    speed: float = 1.0
    crop: float = 0.0
    brightness: float = 0.0
    contrast: float = 1.0
    saturation: float = 1.0
    border: int = 0
    trim_start: float = 0.0
    trim_end: float = 0.0


class ReupImportIn(BaseModel):
    source_path: str  # e.g. /uploads/filename.mp4


@router.post("/reup/import")
def reup_import(body: ReupImportIn, request: Request):
    """Copy a video from uploads (Video AI output) into the reup input dir."""
    _get_user_id(request)
    project_root = Path(__file__).resolve().parents[3]
    # Normalise: strip leading slash, only allow uploads/
    rel = body.source_path.lstrip("/")
    if not rel.startswith("uploads/"):
        raise HTTPException(400, "Only /uploads/ paths supported")
    src = project_root / "data" / rel
    if not src.exists():
        raise HTTPException(404, "Source file not found")
    fname = f"{uuid.uuid4().hex[:12]}{src.suffix.lower()}"
    dst = REUP_IN_DIR / fname
    dst.write_bytes(src.read_bytes())
    dur, w, h = _probe_media(dst)
    return {"path": f"/data/editor/reup/input/{fname}", "duration": dur, "width": w, "height": h}


@router.post("/reup/upload")
async def reup_upload(request: Request, file: UploadFile = File(...)):
    _get_user_id(request)
    ext = Path(file.filename or "").suffix.lower()
    if ext not in {".mp4", ".mov", ".mkv", ".webm", ".avi"}:
        raise HTTPException(400, "Only video files supported")
    fname = f"{uuid.uuid4().hex[:12]}{ext}"
    fpath = REUP_IN_DIR / fname
    fpath.write_bytes(await file.read())
    dur, w, h = _probe_media(fpath)
    return {"path": f"/data/editor/reup/input/{fname}", "duration": dur, "width": w, "height": h}


@router.post("/reup/process")
def reup_process(body: ReupOptionsIn, request: Request):
    uid = _get_user_id(request)
    src_name = Path(body.source_path).name
    src = REUP_IN_DIR / src_name
    if not src.exists():
        raise HTTPException(404, "Source not found")
    out_name = f"reup_{uuid.uuid4().hex[:10]}.mp4"
    out = REUP_OUT_DIR / out_name
    now = _now()
    conn = get_connection()
    cur = conn.execute(
        "INSERT INTO reup_jobs(user_id,source_path,output_path,status,progress,created_at,updated_at)"
        " VALUES(?,?,?,?,?,?,?)",
        (uid, str(src), str(out), "queued", 0, now, now),
    )
    jid = cur.lastrowid
    conn.commit()
    conn.close()
    threading.Thread(target=_run_reup, args=(jid, str(src), str(out), body.model_dump()), daemon=True).start()
    return {"job_id": jid}


def _run_reup(jid: int, src: str, out: str, opts: dict):
    def upd(**kw):
        conn = get_connection()
        cols = ",".join(f"{k}=?" for k in kw)
        vals = list(kw.values()) + [_now(), jid]
        conn.execute(f"UPDATE reup_jobs SET {cols},updated_at=? WHERE id=?", vals)
        conn.commit()
        conn.close()

    try:
        upd(status="running")
        vf, af = [], []
        if opts.get("flip"):
            vf.append("hflip")
        spd = float(opts.get("speed", 1.0))
        if spd != 1.0:
            vf.append(f"setpts=PTS/{spd:.3f}")
            af.append(f"atempo={min(max(spd, 0.5), 2.0):.3f}")
        b = float(opts.get("brightness", 0))
        c = float(opts.get("contrast", 1.0))
        sat = float(opts.get("saturation", 1.0))
        if b != 0 or c != 1.0 or sat != 1.0:
            vf.append(f"eq=brightness={b:.3f}:contrast={c:.3f}:saturation={sat:.3f}")
        crop_pct = float(opts.get("crop", 0))
        if crop_pct > 0:
            f = 1 - crop_pct / 100
            vf.append(f"crop=iw*{f:.4f}:ih*{f:.4f}:(iw*(1-{f:.4f}))/2:(ih*(1-{f:.4f}))/2")
        brd = int(opts.get("border", 0))
        if brd > 0:
            vf.append(f"pad=iw+{brd * 2}:ih+{brd * 2}:{brd}:{brd}:black")

        cmd = ["ffmpeg", "-y"]
        ts = float(opts.get("trim_start", 0))
        if ts > 0:
            cmd += ["-ss", str(ts)]
        cmd += ["-i", src]
        te = float(opts.get("trim_end", 0))
        if te > 0:
            dur, _, _ = _probe_media(Path(src))
            cmd += ["-t", str(max(0.5, dur - ts - te))]
        if vf:
            cmd += ["-vf", ",".join(vf)]
        if af:
            cmd += ["-af", ",".join(af)]
        cmd += ["-c:v", "libx264", "-crf", "20", "-preset", "fast", "-movflags", "+faststart", out]
        subprocess.run(cmd, capture_output=True, timeout=600, check=True)
        upd(status="done", progress=100)
    except subprocess.CalledProcessError as e:
        err = (e.stderr or b"").decode(errors="replace")[-500:]
        upd(status="error", error=err or "ffmpeg failed")
    except Exception as e:
        upd(status="error", error=str(e)[:500])


@router.get("/reup/jobs")
def list_reup_jobs(request: Request):
    uid = _get_user_id(request)
    conn = get_connection()
    rows = conn.execute(
        "SELECT id,status,progress,source_path,output_path,error,created_at FROM reup_jobs "
        "WHERE user_id=? ORDER BY id DESC LIMIT 50",
        (uid,),
    ).fetchall()
    conn.close()
    items = []
    for r in rows:
        d = dict(r)
        op = Path(d.get("output_path") or "")
        d["exists"] = op.exists()
        d["size"] = op.stat().st_size if d["exists"] else 0
        d["out_name"] = op.name
        items.append(d)
    return {"items": items}


@router.get("/reup/jobs/{jid}")
def get_reup_job(jid: int, request: Request):
    _get_user_id(request)
    conn = get_connection()
    row = conn.execute("SELECT * FROM reup_jobs WHERE id=?", (jid,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Job not found")
    return dict(row)


@router.delete("/reup/jobs/{jid}")
def delete_reup_job(jid: int, request: Request):
    uid = _get_user_id(request)
    conn = get_connection()
    row = conn.execute(
        "SELECT output_path FROM reup_jobs WHERE id=? AND user_id=?", (jid, uid)
    ).fetchone()
    if row and row["output_path"]:
        try:
            Path(row["output_path"]).unlink(missing_ok=True)
        except OSError:
            pass
    conn.execute("DELETE FROM reup_jobs WHERE id=? AND user_id=?", (jid, uid))
    conn.commit()
    conn.close()
    return {"ok": True}
