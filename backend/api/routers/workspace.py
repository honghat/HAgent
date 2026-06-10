import asyncio
import fcntl
import json
import logging
import os
import pty
import shlex
import signal
import struct
import subprocess
import termios
import time

logger = logging.getLogger(__name__)
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from api.routers.auth import _get_user_id
from api.schemas import WorkspaceResponse
from api.services.run_control import is_running, is_stop_requested
from api.services.session_store import get_session
from api.services.user_store import resolve_user_id
from api.services.workspace_state import get_workspace_state

router = APIRouter(tags=["workspace"])

# Allowed workspace roots
WORKSPACE_ROOTS = [
    "/Users/nguyenhat/HAgent",
    "/Users/nguyenhat",
    "/Volumes/HatAI",
]


def _is_allowed(path: str) -> bool:
    """Check if path is within allowed workspace roots."""
    resolved = Path(path).resolve()
    for root in WORKSPACE_ROOTS:
        try:
            resolved.relative_to(Path(root).resolve())
            return True
        except ValueError:
            continue
    return False


class WorkspaceRoot(BaseModel):
    name: str
    path: str


class WorkspaceEntry(BaseModel):
    name: str
    path: str
    type: str  # 'file' or 'directory'
    size: int = 0
    mtime: Optional[float] = None
    readable: bool = True
    is_gitignored: bool = False


class FileContent(BaseModel):
    path: str
    name: str
    content: str
    size: int
    mtime: Optional[float] = None
    language: str = ""


class SaveFileRequest(BaseModel):
    path: str
    content: str


class SaveFileResponse(BaseModel):
    ok: bool
    size: int
    mtime: float


class TerminalRunRequest(BaseModel):
    command: str
    cwd: str
    timeout: int = 30
    password: Optional[str] = None


class TerminalRunResponse(BaseModel):
    ok: bool
    output: str
    exit_code: int
    cwd: str


@router.get("/workspace/roots")
def workspace_roots(request: Request):
    _get_user_id(request)
    roots = []
    for root in WORKSPACE_ROOTS:
        if os.path.isdir(root):
            roots.append(WorkspaceRoot(name=Path(root).name or root, path=root))
    return {"roots": roots}


def _get_git_ignored(dir_path: str, names: list[str]) -> set[str]:
    try:
        subprocess.run(
            ["git", "rev-parse", "--git-dir"],
            capture_output=True, timeout=3, cwd=dir_path,
        ).check_returncode()
        result = subprocess.run(
            ["git", "check-ignore", "--stdin"],
            input="\n".join(names),
            capture_output=True, text=True, timeout=5,
            cwd=dir_path,
        )
        if result.returncode == 0 and result.stdout.strip():
            return set(result.stdout.strip().split("\n"))
    except Exception:
        pass
    return set()


@router.get("/workspace/list")
def workspace_list(
    path: str = Query(...),
    showHidden: bool = Query(False),
    request: Request = None,
):
    if request:
        _get_user_id(request)
    if not _is_allowed(path):
        raise HTTPException(status_code=403, detail="Path not allowed")
    if not os.path.isdir(path):
        raise HTTPException(status_code=404, detail="Directory not found")

    entries: List[WorkspaceEntry] = []
    try:
        for item in sorted(os.listdir(path)):
            if not showHidden and item.startswith("."):
                continue
            item_path = os.path.join(path, item)
            try:
                stat = os.stat(item_path)
                is_dir = os.path.isdir(item_path)
                entries.append(WorkspaceEntry(
                    name=item,
                    path=item_path,
                    type="directory" if is_dir else "file",
                    size=stat.st_size if not is_dir else 0,
                    mtime=stat.st_mtime,
                    readable=os.access(item_path, os.R_OK),
                ))
            except (OSError, PermissionError):
                continue
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    known_ignored = _get_git_ignored(path, [e.name for e in entries])
    if known_ignored:
        for entry in entries:
            if entry.name in known_ignored:
                entry.is_gitignored = True

    parent = str(Path(path).parent) if path != "/" else None
    if parent and not _is_allowed(parent):
        parent = None

    return {"entries": entries, "parent": parent}


@router.get("/workspace/file")
def workspace_file(path: str = Query(...), request: Request = None):
    if request:
        _get_user_id(request)
    if not _is_allowed(path):
        raise HTTPException(status_code=403, detail="Path not allowed")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found")
    if not os.access(path, os.R_OK):
        raise HTTPException(status_code=403, detail="Cannot read file")

    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except (UnicodeDecodeError, OSError):
        raise HTTPException(status_code=400, detail="Cannot read file as text")

    stat = os.stat(path)
    ext = Path(path).suffix.lower()
    language_map = {
        ".py": "python",
        ".js": "javascript",
        ".jsx": "jsx",
        ".ts": "typescript",
        ".tsx": "tsx",
        ".json": "json",
        ".html": "html",
        ".css": "css",
        ".md": "markdown",
        ".sh": "bash",
        ".yml": "yaml",
        ".yaml": "yaml",
        ".toml": "toml",
        ".sql": "sql",
        ".go": "go",
        ".rs": "rust",
        ".c": "c",
        ".cpp": "cpp",
        ".h": "c",
        ".java": "java",
    }

    return FileContent(
        path=path,
        name=Path(path).name,
        content=content,
        size=stat.st_size,
        mtime=stat.st_mtime,
        language=language_map.get(ext, ext.lstrip(".") or "txt"),
    )


@router.put("/workspace/file")
def workspace_save_file(req: SaveFileRequest, request: Request):
    _get_user_id(request)
    if not _is_allowed(req.path):
        raise HTTPException(status_code=403, detail="Path not allowed")
    if not os.access(os.path.dirname(req.path) or ".", os.W_OK):
        raise HTTPException(status_code=403, detail="Cannot write to directory")

    try:
        with open(req.path, "w", encoding="utf-8") as f:
            f.write(req.content)
        stat = os.stat(req.path)
        return SaveFileResponse(ok=True, size=stat.st_size, mtime=stat.st_mtime)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Write failed: {e}")


@router.post("/workspace/terminal")
def workspace_terminal(req: TerminalRunRequest, request: Request):
    _get_user_id(request)
    command = req.command.strip()
    if not command:
        raise HTTPException(status_code=400, detail="Command is required")
    if not _is_allowed(req.cwd):
        raise HTTPException(status_code=403, detail="Path not allowed")
    if not os.path.isdir(req.cwd):
        raise HTTPException(status_code=404, detail="Directory not found")

    try:
        parts = shlex.split(command)
    except ValueError:
        parts = []
    if parts and parts[0] == "cd" and len(parts) <= 2:
        target = parts[1] if len(parts) == 2 else os.path.expanduser("~")
        next_cwd = str((Path(req.cwd) / target).expanduser().resolve())
        if not _is_allowed(next_cwd):
            raise HTTPException(status_code=403, detail="Path not allowed")
        if not os.path.isdir(next_cwd):
            return TerminalRunResponse(ok=False, output=f"cd: no such directory: {target}", exit_code=1, cwd=req.cwd)
        return TerminalRunResponse(ok=True, output=next_cwd, exit_code=0, cwd=next_cwd)

    timeout = max(1, min(int(req.timeout or 30), 120))

    needs_sudo = bool(parts) and parts[0] == "sudo"
    if needs_sudo and not req.password:
        return TerminalRunResponse(
            ok=False,
            output="sudo: cần mật khẩu (nhập trên dialog)",
            exit_code=401,
            cwd=req.cwd,
        )

    stdin_input: Optional[str] = None
    run_command = command
    if needs_sudo and req.password:
        rest = command[len("sudo"):].lstrip()
        run_command = f"sudo -S -p '' {rest}"
        stdin_input = req.password + "\n"

    try:
        completed = subprocess.run(
            ["/bin/zsh", "-lc", run_command],
            cwd=req.cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
            input=stdin_input,
        )
    except subprocess.TimeoutExpired as exc:
        output = "\n".join(part for part in [exc.stdout, exc.stderr, f"Command timed out after {timeout}s."] if part)
        return TerminalRunResponse(ok=False, output=output, exit_code=124, cwd=req.cwd)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Run failed: {exc}")

    stderr = completed.stderr or ""
    if needs_sudo and "incorrect password" in stderr.lower():
        return TerminalRunResponse(
            ok=False,
            output="sudo: mật khẩu sai",
            exit_code=401,
            cwd=req.cwd,
        )

    output = "\n".join(part for part in [completed.stdout, stderr] if part).rstrip()
    return TerminalRunResponse(
        ok=completed.returncode == 0,
        output=output or "(no output)",
        exit_code=completed.returncode,
        cwd=req.cwd,
    )


@router.websocket("/ws/workspace/terminal")
async def workspace_terminal_ws(ws: WebSocket):
    token = ws.query_params.get("t", "hat")
    user_id = resolve_user_id(token)
    if not user_id:
        await ws.close(code=4401)
        return
    cwd = ws.query_params.get("cwd") or "/Users/nguyenhat/HAgent"
    if not _is_allowed(cwd) or not os.path.isdir(cwd):
        await ws.close(code=4403)
        return

    cols = int(ws.query_params.get("cols") or 80)
    rows = int(ws.query_params.get("rows") or 24)
    session_name = ws.query_params.get("session") or f"hagent-{user_id}"

    await ws.accept()

    tmux_bin = None
    for candidate in ("/opt/homebrew/bin/tmux", "/usr/local/bin/tmux", "/usr/bin/tmux"):
        if os.path.exists(candidate):
            tmux_bin = candidate
            break

    pid, master_fd = pty.fork()
    if pid == 0:
        try:
            os.chdir(cwd)
        except OSError:
            pass
        env = os.environ.copy()
        env["TERM"] = "xterm-256color"
        env["LANG"] = env.get("LANG", "en_US.UTF-8")
        env["HISTSIZE"] = "1000000"
        env["SAVEHIST"] = "1000000"
        env["HISTFILE"] = os.path.expanduser("~/.zsh_history")
        if tmux_bin:
            safe_session = shlex.quote(session_name)
            safe_cwd = shlex.quote(cwd)
            tmux_script = (
                f"{shlex.quote(tmux_bin)} start-server; "
                f"{shlex.quote(tmux_bin)} set-option -g default-terminal 'screen-256color' 2>/dev/null || true; "
                f"{shlex.quote(tmux_bin)} set-option -ga terminal-overrides ',xterm-256color:Tc,screen-256color:Tc' 2>/dev/null || true; "
                f"{shlex.quote(tmux_bin)} set-option -g history-limit 10000000; "
                f"{shlex.quote(tmux_bin)} new-session -d -A -s {safe_session} -c {safe_cwd}; "
                f"{shlex.quote(tmux_bin)} set-option -t {safe_session} history-limit 10000000 2>/dev/null || true; "
                f"{shlex.quote(tmux_bin)} set-window-option -gt {safe_session} history-limit 10000000 2>/dev/null || true; "
                f"exec {shlex.quote(tmux_bin)} -2 attach-session -t {safe_session}"
            )
            os.execvpe(
                "/bin/zsh",
                ["/bin/zsh", "-lc", tmux_script],
                env,
            )
        else:
            os.execvpe("/bin/zsh", ["/bin/zsh", "-l"], env)

    try:
        fcntl.ioctl(master_fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    except OSError:
        pass
    flags = fcntl.fcntl(master_fd, fcntl.F_GETFL)
    fcntl.fcntl(master_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)

    loop = asyncio.get_event_loop()
    stop = asyncio.Event()
    _ws_open_at = time.monotonic()

    async def pump_pty_to_ws():
        while not stop.is_set():
            try:
                await loop.run_in_executor(None, _wait_readable, master_fd, 0.5)
                try:
                    data = os.read(master_fd, 8192)
                except BlockingIOError:
                    continue
                except OSError:
                    break
                if not data:
                    break
                try:
                    await ws.send_bytes(data)
                except Exception:
                    break
            except Exception:
                break
        stop.set()

    async def pump_ws_to_pty():
        try:
            while not stop.is_set():
                msg = await ws.receive()
                if msg.get("type") == "websocket.disconnect":
                    break
                text = msg.get("text")
                if text is not None:
                    try:
                        payload = json.loads(text)
                    except (json.JSONDecodeError, TypeError):
                        try:
                            os.write(master_fd, text.encode())
                        except OSError:
                            break
                        continue
                    ptype = payload.get("type")
                    if ptype == "input":
                        try:
                            os.write(master_fd, payload.get("data", "").encode())
                        except OSError:
                            break
                    elif ptype == "resize":
                        try:
                            c = int(payload.get("cols", 80))
                            r = int(payload.get("rows", 24))
                            fcntl.ioctl(master_fd, termios.TIOCSWINSZ, struct.pack("HHHH", r, c, 0, 0))
                        except (OSError, ValueError):
                            pass
                else:
                    raw = msg.get("bytes")
                    if raw:
                        try:
                            os.write(master_fd, raw)
                        except OSError:
                            break
        except WebSocketDisconnect:
            pass
        except Exception:
            pass
        stop.set()

    try:
        await asyncio.gather(pump_pty_to_ws(), pump_ws_to_pty())
    finally:
        try:
            os.kill(pid, signal.SIGHUP)
        except OSError:
            pass
        try:
            os.close(master_fd)
        except OSError:
            pass
        try:
            os.waitpid(pid, os.WNOHANG)
        except OSError:
            pass
        try:
            await ws.close()
        except Exception:
            pass
        _lifetime = time.monotonic() - _ws_open_at
        if _lifetime < 1.0:
            logger.debug("WS terminal ngắn (%.2fs) user=%s cwd=%s session=%s", _lifetime, user_id, cwd, session_name)


class WorkspaceDeleteRequest(BaseModel):
    path: str


class WorkspaceCreateFileRequest(BaseModel):
    path: str
    content: str = ""


class WorkspaceMkdirRequest(BaseModel):
    path: str


class WorkspaceRenameRequest(BaseModel):
    path: str
    new_path: str


@router.post("/workspace/delete")
def workspace_delete(req: WorkspaceDeleteRequest, request: Request):
    _get_user_id(request)
    if not _is_allowed(req.path):
        raise HTTPException(status_code=403, detail="Path not allowed")
    if not os.path.exists(req.path):
        raise HTTPException(status_code=404, detail="Path not found")
    try:
        if os.path.isdir(req.path):
            import shutil
            shutil.rmtree(req.path)
        else:
            os.remove(req.path)
        return {"ok": True, "message": f"Đã xoá {Path(req.path).name}"}
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Xoá thất bại: {e}")


@router.post("/workspace/create-file")
def workspace_create_file(req: WorkspaceCreateFileRequest, request: Request):
    _get_user_id(request)
    if not _is_allowed(req.path):
        raise HTTPException(status_code=403, detail="Path not allowed")
    if os.path.exists(req.path):
        raise HTTPException(status_code=400, detail="File đã tồn tại")
    try:
        Path(req.path).parent.mkdir(parents=True, exist_ok=True)
        with open(req.path, "w", encoding="utf-8") as f:
            f.write(req.content)
        return {"ok": True, "message": f"Đã tạo {Path(req.path).name}"}
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Tạo thất bại: {e}")


@router.post("/workspace/mkdir")
def workspace_mkdir(req: WorkspaceMkdirRequest, request: Request):
    _get_user_id(request)
    if not _is_allowed(req.path):
        raise HTTPException(status_code=403, detail="Path not allowed")
    if os.path.exists(req.path):
        raise HTTPException(status_code=400, detail="Thư mục đã tồn tại")
    try:
        Path(req.path).mkdir(parents=True, exist_ok=True)
        return {"ok": True, "message": f"Đã tạo thư mục {Path(req.path).name}"}
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Tạo thất bại: {e}")


@router.post("/workspace/rename")
def workspace_rename(req: WorkspaceRenameRequest, request: Request):
    _get_user_id(request)
    if not _is_allowed(req.path):
        raise HTTPException(status_code=403, detail="Path not allowed")
    if not _is_allowed(req.new_path):
        raise HTTPException(status_code=403, detail="New path not allowed")
    if not os.path.exists(req.path):
        raise HTTPException(status_code=404, detail="Path not found")
    if os.path.exists(req.new_path):
        raise HTTPException(status_code=400, detail="Đích đã tồn tại")
    try:
        os.rename(req.path, req.new_path)
        return {"ok": True, "message": f"Đã đổi tên thành {Path(req.new_path).name}"}
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Đổi tên thất bại: {e}")


def _wait_readable(fd: int, timeout: float) -> None:
    import select
    try:
        select.select([fd], [], [], timeout)
    except (OSError, ValueError):
        pass


@router.get("/sessions/{session_id}/workspace", response_model=WorkspaceResponse)
def workspace_route(session_id: str) -> WorkspaceResponse:
    record = get_session(session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy session")

    runtime = get_workspace_state(session_id)
    tools = runtime["tools"]
    if not tools:
        tools = _python_tool_catalog()
    todos = runtime["todos"]

    return WorkspaceResponse(
        session_id=session_id,
        tools=tools,
        todos=todos,
        summary={
            "messageCount": len(record.messages),
            "processing": is_running(session_id),
            "stopRequested": is_stop_requested(session_id),
            "status": record.status,
            "toolCount": len(tools),
            "todoCount": len(todos),
        },
    )


def _python_tool_catalog() -> list[dict]:
    try:
        import model_tools  # noqa: F401
        from tools.registry import registry
    except Exception:
        return []

    items: list[dict] = []
    for name in registry.get_all_tool_names():
        entry = registry.get_entry(name)
        if not entry:
            continue
        items.append(
            {
                "name": name,
                "desc": _compact_desc(entry.description or entry.schema.get("description", "")),
                "toolset": entry.toolset,
                "status": "available",
            }
        )
    return items


def _compact_desc(value: str, limit: int = 220) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text
    return f"{text[:limit].rstrip()}..."
