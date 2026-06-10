"""
Photo Generation Router
=======================

Provides the backend API for the Photo tab in AutomationHub.
Uses the registered image_gen provider chain — ComfyUI (SDXL-Lightning GGUF)
on Hat-Linux via SSH tunnel.

Endpoints
---------
- POST /api/photo/generate  — generate a photo from a prompt
- GET  /api/photo/models    — list available models for the active provider
- GET  /api/photo/history   — list recently generated photos
- DELETE /api/photo/delete/{filename} — delete a photo from cache
- DELETE /api/photo/remote/{filename} — delete a photo from remote ComfyUI output
"""

from __future__ import annotations

import logging
import os
import re
import subprocess
from typing import Any, Dict, List, Optional

import asyncio
import time
import uuid

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from hagent_constants import get_hagent_home

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/photo", tags=["photo"])

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="Image description")
    negative: str = Field("", description="Negative prompt (loại bỏ chi tiết không muốn)")
    model: Optional[str] = Field(None, description="Provider-specific model id")
    aspect_ratio: str = Field("landscape", pattern="^(landscape|square|portrait)$")
    count: int = Field(1, ge=1, le=10, description="Number of images to generate (1-10)")
    workflow: Optional[str] = Field(None, description="Override workflow JSON filename (vd 'flux_schnell_q4.json')")


class GenerateResponse(BaseModel):
    success: bool
    image: Optional[str] = None  # URL or file path (single, for backward compat)
    images: List[str] = Field(default_factory=list)  # All generated image paths/URLs
    model: str = ""
    prompt: str = ""
    aspect_ratio: str = "landscape"
    provider: str = ""
    error: Optional[str] = None
    error_type: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_active_provider():
    """Resolve the active ImageGenProvider from the registry."""
    from agent.image_gen_registry import get_active_provider

    provider = get_active_provider()
    if provider is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "No image generation provider is configured. "
                "Run `hagent tools` → Image Generation to set one up, "
                "or set `image_gen.provider` in config.yaml."
            ),
        )
    return provider


_GPT_MODEL_PREFIXES = ("gpt-", "codex-", "auto")


def _pick_provider(model: Optional[str]):
    """Route theo model: GPT/Codex/auto → chatgpt2api; còn lại → provider active.

    Nhờ vậy ComfyUI vẫn là default, dropdown chỉ thêm các model GPT.
    """
    from agent.image_gen_registry import get_provider

    if model:
        m = str(model).strip().lower()
        if any(m.startswith(p) for p in _GPT_MODEL_PREFIXES):
            chatgpt = get_provider("chatgpt2api")
            if chatgpt is not None:
                return chatgpt
    return _get_active_provider()


def _merged_models() -> List[Dict[str, Any]]:
    """ComfyUI (active) trước, các model GPT thêm sau. Khử trùng theo id."""
    from agent.image_gen_registry import get_provider

    seen: set[str] = set()
    out: List[Dict[str, Any]] = []
    active = _get_active_provider()
    for m in (active.list_models() or []):
        mid = m.get("id")
        if mid and mid not in seen:
            seen.add(mid)
            out.append(m)
    chatgpt = get_provider("chatgpt2api")
    if chatgpt is not None and chatgpt is not active:
        for m in (chatgpt.list_models() or []):
            mid = m.get("id")
            if mid and mid not in seen:
                seen.add(mid)
                out.append(m)
    return out


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/models", response_model=List[Dict[str, Any]])
async def list_models():
    """List models hỗ trợ — ComfyUI (mặc định) + các model GPT từ chatgpt2api."""
    return _merged_models()


@router.post("/generate", response_model=GenerateResponse)
async def generate_photo(req: GenerateRequest):
    """Generate photo(s). Route GPT models → chatgpt2api, còn lại → ComfyUI."""
    provider = _pick_provider(req.model)
    kwargs: Dict[str, Any] = {}
    if req.model:
        kwargs["model"] = req.model
    if req.negative:
        kwargs["negative"] = req.negative
    if req.workflow:
        kwargs["workflow"] = req.workflow

    images: List[str] = []
    last_error: Optional[str] = None

    for i in range(req.count):
        result = provider.generate(
            prompt=req.prompt,
            aspect_ratio=req.aspect_ratio,
            **kwargs,
        )
        if result.get("success") and result.get("image"):
            images.append(result["image"])
        elif result.get("error"):
            last_error = result["error"]

    if images:
        return GenerateResponse(
            success=True,
            image=images[0],  # first image for backward compat
            images=images,
            model=result.get("model", ""),
            prompt=req.prompt,
            aspect_ratio=req.aspect_ratio,
            provider=result.get("provider", ""),
        )
    else:
        return GenerateResponse(
            success=False,
            error=last_error or "Failed to generate any images",
            model="",
            prompt=req.prompt,
            aspect_ratio=req.aspect_ratio,
        )


# ---------------------------------------------------------------------------
# Async jobs — sống sót F5/mất mạng
# ---------------------------------------------------------------------------

_JOBS: Dict[str, Dict[str, Any]] = {}
_MAX_JOBS = 50


def _trim_jobs() -> None:
    if len(_JOBS) <= _MAX_JOBS:
        return
    olds = sorted(_JOBS.items(), key=lambda kv: kv[1]["created_at"])[: len(_JOBS) - _MAX_JOBS]
    for jid, _ in olds:
        _JOBS.pop(jid, None)


async def _run_generate_job(job_id: str, req: GenerateRequest) -> None:
    from api.services.agent_events import broadcast_agent_event
    job = _JOBS[job_id]
    job["status"] = "running"
    job["started_at"] = time.time()
    job["progress"] = {"done": 0, "total": req.count}

    def _snap(extra: dict | None = None) -> dict:
        return {"kind": "photo", "id": job_id,
                "status": job["status"],
                "progress": job.get("progress"),
                "partial_images": job.get("partial_images", []),
                "started_at": job.get("started_at"),
                "finished_at": job.get("finished_at"),
                "result": job.get("result"),
                "error": job.get("error"),
                **(extra or {})}

    broadcast_agent_event("agent.status", {"status": "running"})
    broadcast_agent_event("agent.job", _snap())
    broadcast_agent_event("agent.progress", {"tab": "photo", "percent": 0})

    provider = _pick_provider(req.model)
    kwargs: Dict[str, Any] = {}
    if req.model:
        kwargs["model"] = req.model
    if req.negative:
        kwargs["negative"] = req.negative
    if req.workflow:
        kwargs["workflow"] = req.workflow

    images: List[str] = []
    last_error: Optional[str] = None
    last_result: Dict[str, Any] = {}

    for i in range(req.count):
        try:
            result = await asyncio.to_thread(
                provider.generate,
                prompt=req.prompt,
                aspect_ratio=req.aspect_ratio,
                **kwargs,
            )
        except Exception as e:
            last_error = f"{type(e).__name__}: {e}"
            continue
        last_result = result
        if result.get("success") and result.get("image"):
            images.append(result["image"])
        elif result.get("error"):
            last_error = result["error"]
        job["progress"] = {"done": i + 1, "total": req.count}
        job["partial_images"] = list(images)
        broadcast_agent_event("agent.job", _snap())
        broadcast_agent_event("agent.progress", {
            "tab": "photo", "percent": int((i + 1) * 100 / max(req.count, 1)),
        })

    job["finished_at"] = time.time()
    if images:
        job["status"] = "done"
        job["result"] = {
            "images": images,
            "image": images[0],
            "model": last_result.get("model", "") if isinstance(last_result, dict) else "",
            "provider": last_result.get("provider", "") if isinstance(last_result, dict) else "",
            "prompt": req.prompt,
            "aspect_ratio": req.aspect_ratio,
        }
        broadcast_agent_event("agent.job", _snap())
        broadcast_agent_event("agent.notification", {
            "message": f"Photo xong ({len(images)}/{req.count} ảnh, model {req.model or 'auto'})",
        })
        broadcast_agent_event("agent.status", {"status": "idle"})
    else:
        job["status"] = "error"
        job["error"] = last_error or "Failed to generate any images"
        broadcast_agent_event("agent.job", _snap())
        broadcast_agent_event("agent.notification", {
            "message": f"Photo lỗi: {(last_error or 'unknown')[:60]}",
        })
        broadcast_agent_event("agent.status", {"status": "error"})


@router.post("/jobs")
async def create_photo_job(req: GenerateRequest):
    job_id = uuid.uuid4().hex[:12]
    _JOBS[job_id] = {
        "id": job_id,
        "status": "queued",
        "created_at": time.time(),
        "args": req.model_dump(),
        "progress": {"done": 0, "total": req.count},
        "partial_images": [],
    }
    _trim_jobs()
    asyncio.create_task(_run_generate_job(job_id, req))
    return {"id": job_id, "status": "queued"}


@router.get("/jobs/{job_id}")
async def get_photo_job(job_id: str):
    job = _JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.get("/jobs")
async def list_photo_jobs(limit: int = 20):
    items = sorted(_JOBS.values(), key=lambda j: j["created_at"], reverse=True)[:limit]
    return {"jobs": items}


@router.delete("/jobs/{job_id}")
async def delete_photo_job(job_id: str):
    _JOBS.pop(job_id, None)
    return {"ok": True}


@router.get("/history", response_model=List[Dict[str, Any]])
async def list_history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List recently generated photos from the image cache.

    Scans ``$HAGENT_HOME/cache/images/`` for recent image files.
    """
    cache_dir = get_hagent_home() / "cache" / "images"
    if not cache_dir.is_dir():
        return []

    images: List[Dict[str, Any]] = []
    for f in sorted(cache_dir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if f.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
            images.append(
                {
                    "path": str(f),
                    "name": f.name,
                    "size_bytes": f.stat().st_size,
                    "created_at": f.stat().st_mtime,
                }
            )

    return images[offset : offset + limit]


@router.get("/file/{filename}")
async def serve_photo(filename: str):
    """Serve a cached photo file directly."""
    from fastapi.responses import FileResponse

    cache_dir = get_hagent_home() / "cache" / "images"
    if not re.fullmatch(r"[a-zA-Z0-9_\-.]+\.[a-zA-Z0-9]+", filename):
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = cache_dir / filename
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")

    resolved = file_path.resolve()
    cache_resolved = cache_dir.resolve()
    if not str(resolved).startswith(str(cache_resolved)):
        raise HTTPException(status_code=403, detail="Access denied")

    return FileResponse(str(file_path))


@router.delete("/delete/{filename}", status_code=200)
async def delete_photo(filename: str):
    """Delete a photo from the image cache by filename."""
    cache_dir = get_hagent_home() / "cache" / "images"

    # Sanitize: only allow safe characters
    if not re.fullmatch(r"[a-zA-Z0-9_\-.]+.[a-zA-Z0-9]+", filename):
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = cache_dir / filename
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")

    # Security: ensure resolved path is still under cache_dir
    resolved = file_path.resolve()
    cache_resolved = cache_dir.resolve()
    if not str(resolved).startswith(str(cache_resolved)):
        raise HTTPException(status_code=403, detail="Access denied")

    file_path.unlink()
    return {"success": True, "deleted": filename}


@router.delete("/remote/{filename}", status_code=200)
async def delete_remote_photo(filename: str):
    """Delete a generated photo from the remote ComfyUI output directory (Hat-Linux).

    SSHes into Hat-Linux and removes the file from ``~/ComfyUI/output/``.
    Also removes the local cache copy if it exists.
    """
    # Sanitize filename
    if not re.fullmatch(r"[a-zA-Z0-9_\-]+\.[a-zA-Z0-9]+", filename):
        raise HTTPException(status_code=400, detail="Invalid filename")

    remote_host = os.environ.get("SSH_REMOTE_HOST", "100.69.50.64")
    remote_user = os.environ.get("SSH_REMOTE_USER", "hatnguyen")
    remote_port = os.environ.get("SSH_REMOTE_PORT", "22")
    ssh_password = os.environ.get("SSH_PASSWORD", "")

    if not ssh_password:
        raise HTTPException(status_code=500, detail="SSH_PASSWORD not configured in .env")

    remote_path = f"/home/{remote_user}/ComfyUI/output/{filename}"

    ssh_cmd = [
        "sshpass", "-p", ssh_password,
        "ssh", "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=5",
        "-p", remote_port,
        f"{remote_user}@{remote_host}",
        f"rm -f {remote_path}",
    ]

    try:
        result = subprocess.run(ssh_cmd, capture_output=True, text=True, timeout=15)
        if result.returncode != 0:
            err = result.stderr.strip() or f"exit code {result.returncode}"
            raise HTTPException(status_code=502, detail=f"SSH remote delete failed: {err}")

        # Also remove local cache if it exists
        cache_dir = get_hagent_home() / "cache" / "images"
        local_path = cache_dir / filename
        if local_path.is_file():
            resolved = local_path.resolve()
            cache_resolved = cache_dir.resolve()
            if str(resolved).startswith(str(cache_resolved)):
                local_path.unlink()

        return {"success": True, "deleted": filename}
    except HTTPException:
        raise
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="SSH connection timed out")
    except Exception as exc:
        logger.warning("Failed to delete remote photo: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/remote/clear-all", status_code=200)
async def clear_all_remote_photos():
    """Delete ALL images from the remote ComfyUI output directory (Hat-Linux).

    Uses SSH to run ``find ~/ComfyUI/output/ -type f \\( -iname '*.png' -o
    -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \\) -delete`` on the
    remote machine. Skips hidden/placeholder files.
    """
    remote_host = os.environ.get("SSH_REMOTE_HOST", "100.69.50.64")
    remote_user = os.environ.get("SSH_REMOTE_USER", "hatnguyen")
    remote_port = os.environ.get("SSH_REMOTE_PORT", "22")
    ssh_password = os.environ.get("SSH_PASSWORD", "")

    if not ssh_password:
        raise HTTPException(status_code=500, detail="SSH_PASSWORD not configured in .env")

    remote_output_dir = f"/home/{remote_user}/ComfyUI/output"

    # Find and delete all image files, skip hidden/placeholder
    ssh_cmd = [
        "sshpass", "-p", ssh_password,
        "ssh", "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=5",
        "-p", remote_port,
        f"{remote_user}@{remote_host}",
        (
            f'find {remote_output_dir} -maxdepth 1 -type f \\('
            f' -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.webp"'
            f' \\) -print -delete'
        ),
    ]

    try:
        result = subprocess.run(ssh_cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            err = result.stderr.strip() or f"exit code {result.returncode}"
            raise HTTPException(status_code=502, detail=f"SSH remote clear failed: {err}")

        deleted_files = [f.strip() for f in result.stdout.splitlines() if f.strip()]
        count = len(deleted_files)

        logger.info("Cleared %d remote images from %s", count, remote_output_dir)

        return {"success": True, "deleted_count": count, "deleted_files": deleted_files}
    except HTTPException:
        raise
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="SSH connection timed out")
    except Exception as exc:
        logger.warning("Failed to clear remote photos: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))


# ---------------------------------------------------------------------------
# ChatGPT2API account pool (independent from ComfyUI provider)
# ---------------------------------------------------------------------------


class ImportAccountRequest(BaseModel):
    access_token: str = Field(..., min_length=8)
    refresh_token: str = ""
    email_hint: str = ""


class ImportBatchRequest(BaseModel):
    tokens: List[Dict[str, Any]] = Field(default_factory=list)


@router.get("/accounts", response_model=List[Dict[str, Any]])
async def list_chatgpt_accounts():
    try:
        from plugins.chatgpt2api_bridge import bridge as _b
        items = _b.list_accounts()
    except Exception as exc:
        logger.warning("Bridge list_accounts failed: %s", exc)
        return []
    return [
        {
            "email_hint": a.get("email", ""),
            "token_prefix": a.get("token_prefix", ""),
            "status": "active" if a.get("status") in ("正常", "active") else (
                "rate_limited" if a.get("status") in ("限流", "rate_limited") else "invalid"
            ),
            "quota_remaining": a.get("quota"),
            "type": a.get("type", "free"),
            "is_active": a.get("status") in ("正常", "active"),
            "restore_at": a.get("restore_at"),
            "last_used_at": a.get("last_used_at"),
        }
        for a in items
    ]


@router.post("/import-chatgpt-account")
async def import_chatgpt_account(req: ImportAccountRequest):
    from plugins.chatgpt2api_bridge import bridge as _b
    return _b.import_account(req.access_token, req.refresh_token or "", req.email_hint or "")


@router.post("/import-batch")
async def import_chatgpt_batch(req: ImportBatchRequest):
    """Import nhiều token cùng lúc. Mỗi item: {access_token, refresh_token?, email_hint?}."""
    from plugins.chatgpt2api_bridge import bridge as _b
    imported = 0
    errors: List[str] = []
    for idx, item in enumerate(req.tokens or []):
        try:
            tok = str(item.get("access_token") or "").strip()
            if not tok:
                errors.append(f"#{idx}: missing access_token")
                continue
            res = _b.import_account(
                tok,
                str(item.get("refresh_token") or ""),
                str(item.get("email_hint") or ""),
            )
            if res.get("success"):
                imported += 1
            else:
                errors.append(f"#{idx}: {res.get('message','invalid')}")
        except Exception as exc:
            errors.append(f"#{idx}: {exc}")
    return {"success": True, "imported": imported, "errors": errors}


@router.delete("/accounts/{token_prefix}")
async def remove_chatgpt_account(token_prefix: str):
    from plugins.chatgpt2api_bridge import bridge as _b
    ok = _b.pool.remove(token_prefix)
    if not ok:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"success": True}


# ---------------------------------------------------------------------------
# OpenAI-compatible image endpoints (for 3rd-party clients)
# ---------------------------------------------------------------------------


class OAIImagesRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    model: Optional[str] = None
    n: int = Field(1, ge=1, le=4)
    size: Optional[str] = None
    response_format: str = Field("b64_json", pattern="^(b64_json|url)$")


def _size_to_aspect(size: Optional[str]) -> str:
    if not size:
        return "square"
    s = size.lower().replace(" ", "")
    if s in ("1536x1024", "16:9", "landscape"):
        return "landscape"
    if s in ("1024x1536", "9:16", "portrait"):
        return "portrait"
    return "square"


@router.get("/v1/models")
async def oai_list_models():
    provider = _get_active_provider()
    items = provider.list_models() or []
    return {
        "object": "list",
        "data": [
            {"id": m.get("id"), "object": "model", "owned_by": provider.name}
            for m in items if m.get("id")
        ],
    }


@router.post("/v1/images/generations")
async def oai_images_generations(req: OAIImagesRequest):
    provider = _get_active_provider()
    aspect = _size_to_aspect(req.size)
    images: List[Dict[str, Any]] = []
    last_error: Optional[str] = None

    for _ in range(req.n):
        kwargs: Dict[str, Any] = {"aspect_ratio": aspect}
        if req.model:
            kwargs["model"] = req.model
        result = provider.generate(prompt=req.prompt, **kwargs)
        if result.get("success") and result.get("image"):
            ref = result["image"]
            entry: Dict[str, Any] = {}
            if str(ref).startswith(("http://", "https://")):
                entry["url"] = ref
            else:
                entry["url"] = f"file://{ref}"
            images.append(entry)
        elif result.get("error"):
            last_error = result["error"]

    if not images:
        raise HTTPException(status_code=502, detail=last_error or "image generation failed")

    import time as _t
    return {"created": int(_t.time()), "data": images}


@router.post("/v1/images/edits")
async def oai_images_edits():
    raise HTTPException(status_code=501, detail="image edits not implemented yet")

