"""Image-to-Video router — async wrapper around image_to_video_wan tool.

Spawns a background task per job (each ~10-15 min on RTX 4060 Ti). Frontend
polls GET /api/i2v/jobs/{id} until status='done'.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
import urllib.parse
import uuid
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel

from hagent_constants import get_hagent_home
from tools.image_to_video_wan_tool import image_to_video_wan, COMFYUI_URL
from tools.image_to_video_animatediff_tool import image_to_video_animatediff

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/i2v", tags=["image-to-video"])

_JOBS: dict[str, dict[str, Any]] = {}
_MAX_JOBS = 50


class JobBody(BaseModel):
    image_path: str
    prompt: str = ""
    negative: str = ""
    size: str = "landscape"
    length: int = 33
    steps: int = 15
    cfg: float = 6.0
    denoise: float | None = None
    motion_lora: str | None = None
    lora_strength: float | None = None
    seed: int | None = None
    engine: str = "wan"  # "wan" | "animatediff"
    workflow: str | None = None  # Override workflow JSON filename


def _trim_jobs() -> None:
    if len(_JOBS) <= _MAX_JOBS:
        return
    olds = sorted(_JOBS.items(), key=lambda kv: kv[1]["created_at"])[: len(_JOBS) - _MAX_JOBS]
    for jid, _ in olds:
        _JOBS.pop(jid, None)


async def _run_job(job_id: str, args: dict) -> None:
    from api.services.agent_events import broadcast_agent_event
    job = _JOBS[job_id]
    job["status"] = "running"
    job["started_at"] = time.time()
    engine = (args.get("engine") or "wan").lower()
    handler = image_to_video_animatediff if engine == "animatediff" else image_to_video_wan

    def _snap(extra: dict | None = None) -> dict:
        return {"kind": "i2v", "id": job_id,
                "status": job["status"],
                "engine": engine,
                "started_at": job.get("started_at"),
                "finished_at": job.get("finished_at"),
                "result": job.get("result"),
                "error": job.get("error"),
                **(extra or {})}

    broadcast_agent_event("agent.status", {"status": "running"})
    broadcast_agent_event("agent.job", _snap({"progress": 5}))
    broadcast_agent_event("agent.progress", {"tab": "animate", "percent": 5})
    try:
        result = await asyncio.to_thread(handler, args)
        if isinstance(result, str):
            import json
            try:
                result = json.loads(result)
            except Exception:
                result = {"raw": result}
        if result.get("error"):
            job["status"] = "error"
            job["error"] = result["error"]
            broadcast_agent_event("agent.job", _snap())
            broadcast_agent_event("agent.notification", {"message": f"Video {engine} lỗi: {result['error'][:60]}"})
            broadcast_agent_event("agent.status", {"status": "error"})
        else:
            data = result.get("data") or result
            job["status"] = "done"
            job["result"] = data
            broadcast_agent_event("agent.job", _snap({"progress": 100}))
            broadcast_agent_event("agent.progress", {"tab": "animate", "percent": 100})
            broadcast_agent_event("agent.notification", {"message": f"Video {engine} xong (job {job_id})"})
            broadcast_agent_event("agent.status", {"status": "idle"})
    except Exception as e:
        logger.exception("i2v job %s failed", job_id)
        job["status"] = "error"
        job["error"] = str(e)
        broadcast_agent_event("agent.job", _snap())
        broadcast_agent_event("agent.notification", {"message": f"Video job lỗi: {e}"[:80]})
        broadcast_agent_event("agent.status", {"status": "error"})
    finally:
        job["finished_at"] = time.time()


@router.post("/jobs")
async def create_job(body: JobBody):
    if not body.image_path.strip():
        raise HTTPException(400, "image_path is required")
    job_id = uuid.uuid4().hex[:12]
    args = body.model_dump(exclude_none=True)
    _JOBS[job_id] = {
        "id": job_id,
        "status": "queued",
        "created_at": time.time(),
        "args": args,
    }
    _trim_jobs()
    asyncio.create_task(_run_job(job_id, args))
    return {"id": job_id, "status": "queued"}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    job = _JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.get("/jobs")
async def list_jobs(limit: int = 20):
    items = sorted(_JOBS.values(), key=lambda j: j["created_at"], reverse=True)[:limit]
    return {"jobs": items}


@router.post("/attach")
async def attach_running():
    """Quét ComfyUI queue + history để khôi phục các job đang chạy / vừa xong."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            qr = await client.get(f"{COMFYUI_URL}/queue")
            qr.raise_for_status()
            queue = qr.json()
    except Exception as e:
        raise HTTPException(502, f"Không gọi được ComfyUI: {e}")

    attached = []
    for entry in (queue.get("queue_running") or []) + (queue.get("queue_pending") or []):
        try:
            prompt_id = entry[1]
        except (IndexError, TypeError):
            continue
        if any(j.get("comfy_prompt_id") == prompt_id for j in _JOBS.values()):
            continue
        job_id = uuid.uuid4().hex[:12]
        _JOBS[job_id] = {
            "id": job_id,
            "status": "running",
            "comfy_prompt_id": prompt_id,
            "created_at": time.time(),
            "started_at": time.time(),
            "args": {"attached": True},
        }
        asyncio.create_task(_watch_attached(job_id, prompt_id))
        attached.append(job_id)

    _trim_jobs()
    return {"attached": attached, "running": list(_JOBS.keys())}


async def _watch_attached(job_id: str, prompt_id: str) -> None:
    """Poll ComfyUI history cho job đã attach, tải MP4 khi xong."""
    job = _JOBS.get(job_id)
    if not job:
        return
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10.0, read=120.0,
                                                            write=120.0, pool=10.0)) as client:
            for _ in range(720):  # ~60 phút (5s * 720)
                try:
                    r = await client.get(f"{COMFYUI_URL}/history/{prompt_id}", timeout=15)
                    if r.status_code == 200 and r.json():
                        history = r.json()[prompt_id]
                        outputs = history.get("outputs", {})
                        video_meta = None
                        for _nid, node_out in outputs.items():
                            vids = node_out.get("gifs") or node_out.get("videos") or []
                            if vids:
                                video_meta = vids[0]
                                break
                        if not video_meta:
                            job["status"] = "error"
                            job["error"] = "Không tìm thấy video output"
                            return

                        params = urllib.parse.urlencode({
                            "filename": video_meta.get("filename", ""),
                            "subfolder": video_meta.get("subfolder", ""),
                            "type": video_meta.get("type", "output"),
                        })
                        r2 = await client.get(f"{COMFYUI_URL}/view?{params}", timeout=120)
                        r2.raise_for_status()

                        out_dir = get_hagent_home() / "cache" / "videos"
                        out_dir.mkdir(parents=True, exist_ok=True)
                        local_name = f"wan_i2v_{int(time.time())}_{uuid.uuid4().hex[:6]}.mp4"
                        local_path = out_dir / local_name
                        local_path.write_bytes(r2.content)

                        job["status"] = "done"
                        job["finished_at"] = time.time()
                        job["result"] = {
                            "video_path": str(local_path),
                            "video_name": local_path.name,
                            "video_url": f"/api/i2v/file/{local_path.name}",
                            "comfyui_url": COMFYUI_URL,
                            "prompt_id": prompt_id,
                        }
                        return
                except Exception:
                    pass
                await asyncio.sleep(5)

            job["status"] = "error"
            job["error"] = "Timeout chờ ComfyUI hoàn tất"
    except Exception as e:
        logger.exception("watch_attached %s failed", job_id)
        job["status"] = "error"
        job["error"] = str(e)


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    _JOBS.pop(job_id, None)
    return {"ok": True}


@router.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    """Save user-uploaded image to cache/i2v_inputs and return a URL."""
    suffix = (file.filename or "input.jpg").split(".")[-1].lower()
    if suffix not in ("jpg", "jpeg", "png", "webp"):
        suffix = "jpg"
    name = f"upload_{int(time.time())}_{uuid.uuid4().hex[:6]}.{suffix}"
    target_dir = get_hagent_home() / "cache" / "i2v_inputs"
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / name
    target_path.write_bytes(await file.read())
    return {
        "name": name,
        "path": str(target_path),
        "url": f"/cache-i2v-inputs/{name}",
    }


@router.get("/history")
async def list_history(limit: int = 60):
    out_dir = get_hagent_home() / "cache" / "videos"
    out_dir.mkdir(parents=True, exist_ok=True)
    files = list(out_dir.glob("wan_i2v_*.mp4")) + list(out_dir.glob("ad_i2v_*.mp4"))
    items = []
    for p in sorted(files, key=lambda x: x.stat().st_mtime, reverse=True)[:limit]:
        st = p.stat()
        items.append({
            "name": p.name,
            "url": f"/api/i2v/file/{p.name}",
            "size": st.st_size,
            "created_at": st.st_mtime,
            "engine": "animatediff" if p.name.startswith("ad_i2v_") else "wan",
        })
    return {"items": items}


@router.get("/file/{name}")
async def get_video_file(name: str):
    safe = name.split("/")[-1].split("\\")[-1]
    out_dir = get_hagent_home() / "cache" / "videos"
    target = out_dir / safe
    if not target.exists() or not target.is_file():
        raise HTTPException(404, "Not found")
    return FileResponse(str(target), media_type="video/mp4", filename=safe)


COMFYUI_HOST = os.environ.get("COMFYUI_SSH_HOST", "100.69.50.64")
COMFYUI_DIR = os.environ.get("COMFYUI_REMOTE_DIR", "/home/hatnguyen/ComfyUI")


async def _ssh(cmd: str, timeout: float = 15.0) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        "ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5",
        COMFYUI_HOST, cmd,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return proc.returncode or 0, stdout.decode().strip(), stderr.decode().strip()
    except asyncio.TimeoutError:
        proc.kill()
        return -1, "", "ssh timeout"


@router.get("/comfyui/status")
async def comfyui_status():
    """Trả về trạng thái ComfyUI: alive (HTTP 200), pid, vram."""
    alive = False
    vram = None
    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get(f"{COMFYUI_URL}/system_stats")
            if r.status_code == 200:
                alive = True
                data = r.json()
                devices = data.get("devices") or []
                if devices:
                    vram = {
                        "total_mb": round((devices[0].get("vram_total") or 0) / 1024 / 1024),
                        "free_mb": round((devices[0].get("vram_free") or 0) / 1024 / 1024),
                    }
    except Exception:
        pass

    pid = None
    if alive:
        rc, out, _ = await _ssh("pgrep -f 'main.py.*--port 8188' | head -1", timeout=8)
        if rc == 0 and out.strip().isdigit():
            pid = int(out.strip())

    return {"alive": alive, "url": COMFYUI_URL, "host": COMFYUI_HOST, "pid": pid, "vram": vram}


@router.post("/comfyui/start")
async def comfyui_start():
    from api.services.agent_events import broadcast_agent_event
    rc_check, out, _ = await _ssh("pgrep -f 'main.py.*--port 8188' | head -1", timeout=8)
    if rc_check == 0 and out.strip().isdigit():
        return {"ok": True, "message": "Đã chạy", "pid": int(out.strip())}

    cmd = (
        f"cd {COMFYUI_DIR} && "
        "nohup .venv/bin/python main.py --listen 0.0.0.0 --port 8188 "
        "> /tmp/comfyui.log 2>&1 & disown; sleep 0.5; "
        "pgrep -f 'main.py.*--port 8188' | head -1"
    )
    rc, out, err = await _ssh(cmd, timeout=15)
    if rc != 0:
        raise HTTPException(502, f"SSH start failed: {err or 'unknown'}")
    pid = int(out.strip()) if out.strip().isdigit() else None
    broadcast_agent_event("agent.notification", {"message": "ComfyUI đang khởi động (~10s load model)"})
    return {"ok": True, "message": "Đang khởi động (chờ ~10s để load model)", "pid": pid}


@router.post("/comfyui/stop")
async def comfyui_stop():
    from api.services.agent_events import broadcast_agent_event
    rc, out, err = await _ssh("pkill -f 'main.py.*--port 8188'; echo done", timeout=10)
    if rc != 0:
        raise HTTPException(502, f"SSH stop failed: {err or 'unknown'}")
    broadcast_agent_event("agent.notification", {"message": "ComfyUI đã tắt"})
    return {"ok": True, "message": "Đã gửi tín hiệu tắt"}


@router.delete("/history/{name}")
async def delete_history_item(name: str):
    safe = name.split("/")[-1].split("\\")[-1]
    out_dir = get_hagent_home() / "cache" / "videos"
    target = out_dir / safe
    if not target.exists() or not target.is_file():
        raise HTTPException(404, "Not found")
    try:
        target.unlink()
    except OSError as e:
        raise HTTPException(500, str(e))
    return {"ok": True}
