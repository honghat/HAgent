"""Browser control endpoints — chuyển chế độ background/lái/xem cho user."""
from __future__ import annotations

import asyncio
import base64
import json
import os
import subprocess
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from api.routers.auth import _get_user_id
from tools.dock_cleanup import remove_browser_apps_from_dock

router = APIRouter(prefix="/browser", tags=["browser"])

HAGENT_HOME = os.environ.get("HAGENT_HOME", os.getcwd())
PROFILE_DIR = Path(HAGENT_HOME) / "data" / "browser-profile"
STATE_FILE = Path(HAGENT_HOME) / "data" / "browser-mode.json"
SCREENCAST_FPS = 2
SCREENCAST_MAX_DURATION = 600

_PROC: dict = {}


def _read_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {"mode": "headless", "headed_pid": 0, "last_url": ""}


def _write_state(s: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(s))


def _is_headed_alive() -> bool:
    s = _read_state()
    pid = int(s.get("headed_pid") or 0)
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def _close_agent_sessions() -> None:
    try:
        from tools.browser_tool import cleanup_all_browsers
        cleanup_all_browsers()
    except Exception:
        pass


class ModeReq(BaseModel):
    mode: str = "headless"


class TakeoverReq(BaseModel):
    url: str = ""


class Result(BaseModel):
    ok: bool
    message: str = ""
    mode: str = ""


@router.get("/status")
async def status(request: Request):
    _get_user_id(request)
    s = _read_state()
    return {
        "mode": s.get("mode", "headless"),
        "headed_alive": _is_headed_alive(),
        "profile_dir": str(PROFILE_DIR),
        "last_url": s.get("last_url", ""),
    }


@router.post("/mode")
async def set_mode(req: ModeReq, request: Request):
    _get_user_id(request)
    mode = req.mode.strip().lower()
    if mode not in ("headless", "headed"):
        raise HTTPException(400, "mode must be 'headless' or 'headed'")
    s = _read_state()
    s["mode"] = mode
    _write_state(s)
    return {"mode": mode}


@router.post("/takeover", response_model=Result)
async def takeover(req: TakeoverReq, request: Request):
    _get_user_id(request)
    if _is_headed_alive():
        return Result(ok=True, message="đã có cửa sổ đang chạy", mode="headed")

    _close_agent_sessions()
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)

    url = (req.url or "").strip() or _read_state().get("last_url", "") or "about:blank"

    args = ["open", "-na", "Google Chrome", "--args",
            f"--user-data-dir={PROFILE_DIR}", "--no-first-run", "--no-default-browser-check"]
    if url and url != "about:blank":
        args.append(url)

    try:
        subprocess.run(args, check=True, timeout=10)
    except (subprocess.CalledProcessError, FileNotFoundError):
        try:
            subprocess.run(["open", url or "about:blank"], check=False)
            _write_state({"mode": "headless", "headed_pid": 0, "last_url": url})
            return Result(ok=False, message="Google Chrome chưa cài — đã mở bằng default browser, không share profile", mode="headless")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    pid = _find_chrome_pid()
    _write_state({"mode": "headed", "headed_pid": pid, "last_url": url})
    return Result(ok=True, message=f"đã mở Chrome với profile chia sẻ", mode="headed")


@router.post("/close", response_model=Result)
async def close(request: Request):
    _get_user_id(request)
    _close_agent_sessions()
    s = _read_state()
    pid = int(s.get("headed_pid") or 0)
    if pid > 0:
        try:
            os.kill(pid, 15)
        except (ProcessLookupError, PermissionError):
            pass
    remove_browser_apps_from_dock()
    _write_state({"mode": "headless", "headed_pid": 0, "last_url": s.get("last_url", "")})
    return Result(ok=True, message="đã đóng browser", mode="headless")


@router.websocket("/screencast")
async def screencast(ws: WebSocket):
    await ws.accept()
    started = time.time()
    interval = 1.0 / SCREENCAST_FPS
    try:
        while True:
            if time.time() - started > SCREENCAST_MAX_DURATION:
                await ws.send_json({"type": "end", "reason": "timeout"})
                break
            frame_path = _capture_frame()
            if not frame_path:
                await ws.send_json({"type": "error", "message": "không có session active"})
                await asyncio.sleep(interval)
                continue
            try:
                data = Path(frame_path).read_bytes()
                await ws.send_json({
                    "type": "frame",
                    "ts": int(time.time() * 1000),
                    "image": "data:image/png;base64," + base64.b64encode(data).decode(),
                })
            except (FileNotFoundError, PermissionError):
                pass
            await asyncio.sleep(interval)
    except WebSocketDisconnect:
        return
    except Exception as e:
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


def _capture_frame() -> str:
    """Take screenshot from any active agent session. Returns path or empty."""
    try:
        from tools.browser_tool import _active_sessions
        if not _active_sessions:
            return ""
        session_name = next(iter(_active_sessions.values())).get("session_name", "")
        if not session_name:
            return ""
        out = Path(HAGENT_HOME) / "data" / "screencast.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        env = {**os.environ}
        r = subprocess.run(
            ["agent-browser", "screenshot", "--session", session_name, "-o", str(out)],
            capture_output=True, timeout=8, env=env,
        )
        if r.returncode == 0 and out.exists():
            return str(out)
    except Exception:
        return ""
    return ""


def _find_chrome_pid() -> int:
    """Best-effort: latest Chrome process owned by current user."""
    try:
        r = subprocess.run(
            ["pgrep", "-n", "-x", "Google Chrome"],
            capture_output=True, text=True, timeout=5,
        )
        if r.returncode == 0 and r.stdout.strip():
            return int(r.stdout.strip().split("\n")[0])
    except Exception:
        pass
    return 0
