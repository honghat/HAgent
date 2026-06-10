"""Cron job management API — wraps cron/jobs.py for the FastAPI backend."""

from __future__ import annotations

import logging
import hashlib
import subprocess

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

from api.services.user_store import resolve_user_id

CRON_RUN_CHAT_PROMPT_MAX_LENGTH = 200_000


def _user_id(request: Request) -> str:
    token = request.headers.get("authorization", "").replace("Bearer ", "").strip()
    user_id = resolve_user_id(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user_id


router = APIRouter(prefix="/api/cron", tags=["cron"])


class CronJobCreateBody(BaseModel):
    name: str = Field(default="", max_length=120)
    prompt: str = Field(default="", max_length=4000)
    schedule: str = Field(min_length=1, max_length=100)
    skills: list[str] | None = None
    model: str | None = None
    provider: str | None = None
    deliver: str = "local"


class CronJobUpdateBody(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    prompt: str | None = Field(default=None, max_length=4000)
    schedule: str | None = Field(default=None, max_length=100)
    skills: list[str] | None = None
    model: str | None = None
    provider: str | None = None
    enabled: bool | None = None


# ---------------------------------------------------------------------------
# Helpers — import cron/jobs.py directly from the repo root
# ---------------------------------------------------------------------------
import sys
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))


def _cj():
    """Lazy-import cron.jobs so the module can be reloaded during dev."""
    import cron.jobs  # noqa: F811
    return cron.jobs


def _command_name(command: str) -> str:
    first = command.strip().split(maxsplit=1)[0] if command.strip() else ""
    if not first:
        return "System cron"
    return first.rstrip("/").split("/")[-1] or first


def _parse_system_crontab(text: str) -> list[dict]:
    jobs: list[dict] = []
    pending_comments: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("#"):
            comment = line.lstrip("#").strip()
            if comment:
                pending_comments.append(comment)
            continue
        if "=" in line and not line.split("=", 1)[0].strip().count(" "):
            pending_comments.clear()
            continue
        parts = line.split()
        if len(parts) < 6:
            pending_comments.clear()
            continue

        schedule_parts = parts[:5]
        command_parts = parts[5:]
        # Some existing user crontabs were written with a six-field schedule.
        if len(parts) >= 7 and parts[5] == "*" and parts[6].startswith(("/", "~")):
            schedule_parts = parts[:6]
            command_parts = parts[6:]

        command = " ".join(command_parts)
        comment = pending_comments[-1] if pending_comments else ""
        pending_comments.clear()
        digest = hashlib.sha1(line.encode("utf-8")).hexdigest()[:12]
        jobs.append(
            {
                "id": digest,
                "source": "system",
                "name": comment or _command_name(command),
                "schedule": " ".join(schedule_parts),
                "schedule_display": " ".join(schedule_parts),
                "command": command,
                "enabled": True,
                "state": "active",
                "read_only": False,
            }
        )
    return jobs


def _list_system_crontab() -> list[dict]:
    try:
        result = subprocess.run(
            ["crontab", "-l"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except Exception as exc:
        logger.warning("Could not read system crontab: %s", exc)
        return []
    if result.returncode != 0 and not result.stdout:
        return []
    jobs = _parse_system_crontab(result.stdout)
    for job in jobs:
        job["read_only"] = False
    return jobs


def _read_system_crontab() -> str:
    try:
        result = subprocess.run(
            ["crontab", "-l"], capture_output=True, text=True, timeout=5, check=False
        )
    except Exception:
        return ""
    if result.returncode != 0 and not result.stdout:
        return ""
    return result.stdout


def _write_system_crontab(text: str) -> None:
    if not text.endswith("\n"):
        text += "\n"
    proc = subprocess.run(
        ["crontab", "-"], input=text, text=True, capture_output=True, timeout=5
    )
    if proc.returncode != 0:
        raise HTTPException(
            status_code=500, detail=f"crontab write failed: {proc.stderr.strip() or proc.stdout.strip()}"
        )


def _digest_for_line(line: str) -> str:
    return hashlib.sha1(line.encode("utf-8")).hexdigest()[:12]


def _find_system_job_line(lines: list[str], digest: str) -> int:
    for idx, raw in enumerate(lines):
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if _digest_for_line(stripped) == digest:
            return idx
    return -1


class SystemCronUpdateBody(BaseModel):
    schedule: str | None = Field(default=None, max_length=120)
    command: str | None = Field(default=None, max_length=2000)
    name: str | None = Field(default=None, max_length=200)


@router.put("/system-jobs/{job_id}")
def update_system_cron_job(job_id: str, body: SystemCronUpdateBody, request: Request):
    _user_id(request)
    text = _read_system_crontab()
    lines = text.splitlines()
    idx = _find_system_job_line(lines, job_id)
    if idx < 0:
        raise HTTPException(404, "System cron job not found")

    original_line = lines[idx].strip()
    parts = original_line.split()
    if len(parts) < 6:
        raise HTTPException(400, "Existing cron line malformed")

    # Detect schedule field count (5 or 6) — same logic as parser
    schedule_field_count = 5
    if len(parts) >= 7 and parts[5] == "*" and parts[6].startswith(("/", "~")):
        schedule_field_count = 6
    old_schedule = " ".join(parts[:schedule_field_count])
    old_command = " ".join(parts[schedule_field_count:])

    new_schedule = (body.schedule or old_schedule).strip()
    new_command = (body.command or old_command).strip()
    new_line = f"{new_schedule} {new_command}"

    # Update comment line above if name provided
    if body.name is not None:
        comment_idx = idx - 1
        while comment_idx >= 0 and not lines[comment_idx].strip():
            comment_idx -= 1
        if comment_idx >= 0 and lines[comment_idx].lstrip().startswith("#"):
            lines[comment_idx] = f"# {body.name.strip()}"
        else:
            lines.insert(idx, f"# {body.name.strip()}")
            idx += 1

    lines[idx] = new_line
    _write_system_crontab("\n".join(lines))
    return {"ok": True, "id": _digest_for_line(new_line)}


@router.delete("/system-jobs/{job_id}")
def delete_system_cron_job(job_id: str, request: Request):
    _user_id(request)
    text = _read_system_crontab()
    lines = text.splitlines()
    idx = _find_system_job_line(lines, job_id)
    if idx < 0:
        raise HTTPException(404, "System cron job not found")
    # Remove the cron line and the comment directly above if it's a comment
    to_remove = {idx}
    above = idx - 1
    while above >= 0 and not lines[above].strip():
        above -= 1
    if above >= 0 and lines[above].lstrip().startswith("#"):
        to_remove.add(above)
    new_lines = [line for i, line in enumerate(lines) if i not in to_remove]
    _write_system_crontab("\n".join(new_lines))
    return {"ok": True}


@router.post("/system-jobs/{job_id}/trigger")
def trigger_system_cron_job(job_id: str, request: Request):
    _user_id(request)
    text = _read_system_crontab()
    lines = text.splitlines()
    idx = _find_system_job_line(lines, job_id)
    if idx < 0:
        raise HTTPException(404, "System cron job not found")
    parts = lines[idx].strip().split()
    schedule_field_count = 5
    if len(parts) >= 7 and parts[5] == "*" and parts[6].startswith(("/", "~")):
        schedule_field_count = 6
    command = " ".join(parts[schedule_field_count:])
    try:
        subprocess.Popen(
            ["/bin/zsh", "-lc", command],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except Exception as exc:
        raise HTTPException(500, f"Run failed: {exc}") from exc
    return {"ok": True}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/jobs")
def list_cron_jobs(request: Request):
    """List all cron jobs (including disabled)."""
    _user_id(request)
    return _cj().list_jobs(include_disabled=True)


@router.get("/system-jobs")
def list_system_cron_jobs(request: Request):
    """List OS crontab entries for visibility in the Cron UI."""
    _user_id(request)
    return _list_system_crontab()


@router.get("/jobs/{job_id}")
def get_cron_job(job_id: str, request: Request):
    """Get a single cron job by ID."""
    _user_id(request)
    job = _cj().get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/jobs")
def create_cron_job(body: CronJobCreateBody, request: Request):
    """Create a new cron job."""
    _user_id(request)
    try:
        job = _cj().create_job(
            prompt=body.prompt,
            schedule=body.schedule,
            name=body.name,
            skills=body.skills,
            model=body.model,
            provider=body.provider,
            deliver=body.deliver,
        )
        return job
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/jobs/{job_id}")
def update_cron_job(job_id: str, body: CronJobUpdateBody, request: Request):
    """Update an existing cron job (partial)."""
    _user_id(request)
    updates = body.model_dump(exclude_unset=True, exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    job = _cj().update_job(job_id, updates)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.delete("/jobs/{job_id}")
def delete_cron_job(job_id: str, request: Request):
    """Delete a cron job."""
    _user_id(request)
    from cron.jobs import remove_job

    if not remove_job(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    return {"ok": True}


@router.post("/jobs/{job_id}/pause")
def pause_cron_job(job_id: str, request: Request):
    """Pause a cron job."""
    _user_id(request)
    from cron.jobs import pause_job

    job = pause_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/jobs/{job_id}/resume")
def resume_cron_job(job_id: str, request: Request):
    """Resume a paused cron job."""
    _user_id(request)
    from cron.jobs import resume_job

    job = resume_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/jobs/{job_id}/trigger")
def trigger_cron_job(job_id: str, request: Request):
    """Manually trigger a cron job to run immediately (synchronously)."""
    uid = _user_id(request)
    from cron.jobs import run_job_now, get_job, update_job, trigger_job

    # Lấy provider+model từ user trong DB (giống Chat.jsx)
    from api.services.user_store import get_user_by_id, get_providers
    user = get_user_by_id(uid)
    provider_name = (user or {}).get("default_provider", "") or ""
    fe_model = ""
    if provider_name:
        providers = get_providers(uid)
        for p in providers:
            if p.get("name") == provider_name:
                fe_model = str(p.get("model", "") or "").strip()
                break

    # Gắn provider/model tạm thời vào job trước khi chạy
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.get("provider") and provider_name:
        job["provider"] = provider_name
    if not job.get("model") and fe_model:
        job["model"] = fe_model

    result = run_job_now(job)
    if result.get("error") and "not found" in str(result.get("error", "")).lower():
        raise HTTPException(status_code=404, detail="Job not found")

    # Also update next_run_at for scheduled recurrence
    trigger_job(job_id)

    if result["success"]:
        return {
            "ok": True,
            "success": True,
            "output": result["output"],
            "message": "Job ran successfully",
        }
    else:
        raise HTTPException(status_code=500, detail=result.get("error", "Unknown error"))


# ---------------------------------------------------------------------------
# Cron Chat endpoint — runs a prompt through the Chat.jsx agent path.
# Used by the cron scheduler instead of creating AIAgent directly.
# ---------------------------------------------------------------------------


class CronRunChatBody(BaseModel):
    prompt: str = Field(..., max_length=CRON_RUN_CHAT_PROMPT_MAX_LENGTH)
    provider: str | None = None
    model: str | None = None


@router.post("/run-chat")
def run_cron_chat(body: CronRunChatBody):
    """Run a cron prompt through the Chat.jsx agent path (run_source_agent).

    Creates a temporary session, delegates to run_source_agent — the same
    function used by the web chat frontend.

    Provider/model resolution:
    1. Always reads the default user's provider from DB first (same as Chat.jsx).
    2. Falls back to body.provider / body.model if DB lookup fails.
    3. This ensures the cron job auto-follows the frontend setting regardless
       of what the scheduler's old resolve_runtime_provider returns.

    Returns ``{"reply": str, "usage": dict}``.
    """
    from api.services.source_core_agent import run_source_agent
    from api.services.session_store import create_session

    # Always prefer the frontend's DB provider (same as Chat.jsx)
    provider = body.provider
    model = body.model
    try:
        from api.services.user_store import get_user_by_id, get_providers
        _default_user_id = "398f6a8a-8954-4315-8240-df769e664b54"
        user = get_user_by_id(_default_user_id)
        pname = (user or {}).get("default_provider", "") or ""
        if pname:
            provider = pname
            providers = get_providers(_default_user_id)
            for p in providers:
                if p.get("name") == pname:
                    model = str(p.get("model", "") or "").strip() or model
                    break
    except Exception as exc:
        logger.warning("Cron run-chat: DB provider lookup failed, falling back to request body — %s", exc)

    # Create a temporary session so run_source_agent can read/write messages.
    session = create_session(title="Cron: " + (body.prompt or "")[:60])
    session_id = session.session_id
    try:
        reply, usage = run_source_agent(
            session_id,
            body.prompt or "",
            provider_name=provider,
            model_override=model,
        )
    except Exception as exc:
        reply = f"❌ Lỗi: {exc}"
        usage = {}
    return {"reply": reply, "usage": usage}
