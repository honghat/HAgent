import os
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from api.routers.auth import _get_user_id
from api.schemas import WorkspaceResponse
from api.services.run_control import is_running, is_stop_requested
from api.services.session_store import get_session
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


@router.get("/workspace/roots")
def workspace_roots(request: Request):
    _get_user_id(request)
    roots = []
    for root in WORKSPACE_ROOTS:
        if os.path.isdir(root):
            roots.append(WorkspaceRoot(name=Path(root).name or root, path=root))
    return {"roots": roots}


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
