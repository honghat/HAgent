import os
import platform
import re
import shutil
import subprocess
import mimetypes
import urllib.parse
import json
import threading
import time
import uuid
from pathlib import Path
from typing import List, Optional, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, StreamingResponse
from dotenv import load_dotenv
from pydantic import BaseModel

from api.routers.auth import _get_user_id
from api.services.user_store import get_user_by_id, update_user

router = APIRouter(prefix="/api/files", tags=["files"])
PROJECT_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(PROJECT_ROOT / ".env")

# ── Path Safety ──

SYSTEM_PATHS = [
    "/System",
    "/dev",
    "/proc",
    "/cores",
    "/sbin",
    "/usr/lib",
    "/usr/bin",
    "/usr/sbin",
    "/private/var/db",
    "/private/var/run",
    "/var/db",
    "/var/run",
    "/Network",
    "/Volumes/Recovery",
]


def _is_safe_path(path: str) -> bool:
    """Check that the resolved path is not a system path."""
    resolved = str(Path(path).resolve())
    if ".." in path.split("/"):
        return False
    for sp in SYSTEM_PATHS:
        norm = sp.rstrip("/")
        if resolved == norm or resolved.startswith(norm + "/"):
            return False
    trash_dir = str(Path.home() / ".Trash")
    if resolved.startswith(trash_dir):
        return False
    return True


LANGUAGE_MAP = {
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
    ".hpp": "cpp",
    ".java": "java",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin",
    ".dart": "dart",
    ".lua": "lua",
    ".r": "r",
    ".m": "objectivec",
    ".mm": "objectivec",
    ".xml": "xml",
    ".svg": "xml",
    ".plist": "xml",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".ini": "ini",
    ".cfg": "ini",
    ".env": "dotenv",
    ".gitignore": "ignore",
    ".dockerignore": "ignore",
    ".conf": "conf",
    ".tex": "latex",
    ".rst": "rst",
    ".csv": "csv",
    ".tsv": "csv",
    ".log": "log",
    ".txt": "text",
}

BINARY_EXTS = frozenset(
    {
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".bmp",
        ".ico",
        ".webp",
        ".heic",
        ".heif",
        ".tiff",
        ".tif",
        ".svg",
        ".mp3",
        ".mp4",
        ".avi",
        ".mov",
        ".mkv",
        ".wmv",
        ".flv",
        ".webm",
        ".m4a",
        ".wav",
        ".flac",
        ".aac",
        ".ogg",
        ".pdf",
        ".zip",
        ".gz",
        ".tar",
        ".bz2",
        ".xz",
        ".7z",
        ".rar",
        ".exe",
        ".dmg",
        ".app",
        ".bin",
        ".dat",
        ".o",
        ".so",
        ".dylib",
        ".a",
        ".lib",
        ".dll",
        ".pdb",
        ".class",
        ".jar",
        ".war",
        ".pyc",
        ".pyo",
        ".lock",
        ".woff",
        ".woff2",
        ".ttf",
        ".otf",
        ".eot",
        ".psd",
        ".ai",
        ".eps",
        ".sketch",
        ".fig",
        ".icns",
        ".ico",
        ".iso",
        ".img",
        ".vmdk",
        ".db",
        ".sqlite",
        ".sqlite3",
        ".rdb",
        ".ds_store",
    }
)


# ── Pydantic Models ──


class VolumeInfo(BaseModel):
    name: str
    path: str
    type: str  # "internal" | "external" | "home" | "remote"
    total_gb: Optional[float] = None
    free_gb: Optional[float] = None
    remote_info: Optional[dict] = None  # {"host": ..., "share": ..., "fstype": ...}


class FileEntry(BaseModel):
    name: str
    path: str
    type: str  # "file" | "directory" | "symlink"
    size: int = 0
    mtime: Optional[float] = None
    readable: bool = True
    extension: str = ""


class FileContent(BaseModel):
    path: str
    name: str
    content: str
    size: int
    mtime: Optional[float] = None
    language: str = ""
    is_binary: bool = False


class FileWriteRequest(BaseModel):
    path: str
    content: str


class FileRenameRequest(BaseModel):
    path: str
    new_name: str


class FileCopyRequest(BaseModel):
    source: str
    destination: str


class FileTransferRequest(FileCopyRequest):
    mode: Literal["copy", "move"]


class MkdirRequest(BaseModel):
    path: str


class OperationResponse(BaseModel):
    ok: bool
    message: str = ""
    path: str = ""


_transfer_jobs: dict[str, dict] = {}
_transfer_jobs_lock = threading.Lock()


def _set_transfer_job(job_id: str, **updates) -> None:
    with _transfer_jobs_lock:
        if job_id in _transfer_jobs:
            _transfer_jobs[job_id].update(updates)


def _get_path_size(path: Path) -> int:
    if path.is_file():
        return path.stat().st_size
    total = 0
    for item in path.rglob("*"):
        if item.is_file():
            try:
                total += item.stat().st_size
            except OSError:
                continue
    return total


def _copy_file_with_progress(source: Path, destination: Path, job_id: str, copied: int, total: int) -> int:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with source.open("rb") as src, destination.open("wb") as dst:
        while True:
            chunk = src.read(8 * 1024 * 1024)
            if not chunk:
                break
            dst.write(chunk)
            copied += len(chunk)
            progress = 100 if total <= 0 else min(100, int(copied * 100 / total))
            _set_transfer_job(job_id, copied_bytes=copied, progress=progress)
    shutil.copystat(source, destination, follow_symlinks=True)
    return copied


def _run_transfer_job(job_id: str, mode: str, source_raw: str, destination_raw: str) -> None:
    source = Path(source_raw)
    destination = Path(destination_raw)
    try:
        total = _get_path_size(source)
        _set_transfer_job(job_id, status="running", total_bytes=total, progress=0)
        if mode == "move" and source.stat().st_dev == destination.parent.stat().st_dev:
            moved_path = shutil.move(str(source), str(destination))
            _set_transfer_job(
                job_id,
                status="completed",
                copied_bytes=total,
                progress=100,
                finished_at=time.time(),
                path=str(moved_path),
            )
            return
        copied = 0
        if source.is_dir():
            destination.mkdir(parents=True, exist_ok=False)
            for item in source.rglob("*"):
                relative = item.relative_to(source)
                target = destination / relative
                if item.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                elif item.is_file():
                    copied = _copy_file_with_progress(item, target, job_id, copied, total)
            shutil.copystat(source, destination, follow_symlinks=True)
        else:
            copied = _copy_file_with_progress(source, destination, job_id, copied, total)

        if mode == "move":
            if source.is_dir():
                shutil.rmtree(source)
            else:
                source.unlink()
        _set_transfer_job(
            job_id,
            status="completed",
            copied_bytes=copied,
            progress=100,
            finished_at=time.time(),
            path=str(destination),
        )
    except Exception as exc:
        try:
            if destination.exists():
                if destination.is_dir():
                    shutil.rmtree(destination)
                else:
                    destination.unlink()
        except OSError:
            pass
        _set_transfer_job(job_id, status="failed", error=str(exc), finished_at=time.time())


class RemoteShareInfo(BaseModel):
    id: str
    name: str
    host: str
    user: str
    share: str
    mount_path: str
    mounted: bool = False


class RemoteShareMountRequest(BaseModel):
    id: str


REMOTE_SHARES = [
    {
        "id": "hat-pi-pishare",
        "name": "hat-pi PiShare",
        "host": "100.124.52.107",
        "user": "pi",
        "share": "PiShare",
        "password_env": "HAT_PI_SMB_PASSWORD",
    },
    {
        "id": "hat-pi-hatai",
        "name": "hat-pi HatAI",
        "host": "100.124.52.107",
        "user": "pi",
        "share": "HatAI",
        "password_env": "HAT_PI_SMB_PASSWORD",
    },
    {
        "id": "hat-linux-my4tbshare",
        "name": "hat-linux My4TBShare",
        "host": "100.69.50.64",
        "user": "hatnguyen",
        "share": "My4TBShare",
        "password_env": "HAT_LINUX_SMB_PASSWORD",
    },
    {
        "id": "hat-linux-windowsshare",
        "name": "hat-linux WindowsShare",
        "host": "100.69.50.64",
        "user": "hatnguyen",
        "share": "WindowsShare",
        "password_env": "HAT_LINUX_SMB_PASSWORD",
    },
    {
        "id": "hat-linux-systemdisk",
        "name": "hat-linux SystemDisk",
        "host": "100.69.50.64",
        "user": "hatnguyen",
        "share": "SystemDisk",
        "password_env": "HAT_LINUX_SMB_PASSWORD",
    },
]


# ── Endpoints ──


def _disk_info(vpath: str) -> tuple:
    """Return (total_gb, free_gb) or (None, None)."""
    try:
        st = shutil.disk_usage(vpath)
        return round(st.total / (1024**3), 1), round(st.free / (1024**3), 1)
    except OSError:
        return None, None


def _remote_mount_path(share: dict) -> str:
    return str(Path.home() / "mnt" / share["share"])


def _is_mounted(path: str) -> bool:
    if os.path.ismount(path):
        return True
    try:
        out = subprocess.check_output(["mount"], text=True, timeout=5)
    except (subprocess.SubprocessError, OSError):
        return False
    return any(f" on {path} " in line for line in out.splitlines())


def _remote_share_info(share: dict) -> RemoteShareInfo:
    mount_path = _remote_mount_path(share)
    return RemoteShareInfo(
        id=share["id"],
        name=share["name"],
        host=share["host"],
        user=share["user"],
        share=share["share"],
        mount_path=mount_path,
        mounted=_is_mounted(mount_path),
    )


def _password_for_share(share: dict) -> str:
    for env_name in (
        share.get("password_env"),
        f"SMB_PASSWORD_{share['host'].replace('.', '_')}",
        "SMB_PASSWORD",
        "SSH_PASSWORD",
    ):
        if not env_name:
            continue
        value = os.getenv(env_name, "").strip()
        if value:
            return value
    return ""


def _detect_remote_mounts() -> list[VolumeInfo]:
    """Parse 'mount' output to find network filesystems (smb, nfs, etc.)."""
    volumes: list[VolumeInfo] = []
    try:
        out = subprocess.check_output(["mount"], text=True, timeout=5)
    except (subprocess.SubprocessError, OSError):
        return volumes
    # Line format: //user@host/share on /path (fstype, options)
    pattern = re.compile(
        r"//(?:\S+@)?(?P<host>[\w.]+)/(?P<share>\S+)\s+on\s+(?P<mount>\S+)\s+\((?P<fstype>\w+)"
    )
    for line in out.splitlines():
        m = pattern.search(line)
        if not m:
            continue
        mount_point = m.group("mount")
        host = m.group("host")
        share = m.group("share")
        fstype = m.group("fstype")
        if not os.path.isdir(mount_point):
            continue
        if not _is_safe_path(mount_point):
            continue
        total, free = _disk_info(mount_point)
        volumes.append(
            VolumeInfo(
                name=share,
                path=mount_point,
                type="remote",
                total_gb=total,
                free_gb=free,
                remote_info={"host": host, "share": share, "fstype": fstype},
            )
        )
    # Also detect NFS mounts
    nfs_pattern = re.compile(
        r"(?P<host>[\w.]+):(?P<share>\S+)\s+on\s+(?P<mount>\S+)\s+\(nfs"
    )
    for line in out.splitlines():
        m = nfs_pattern.search(line)
        if not m:
            continue
        mount_point = m.group("mount")
        host = m.group("host")
        share = m.group("share")
        if not os.path.isdir(mount_point) or not _is_safe_path(mount_point):
            continue
        total, free = _disk_info(mount_point)
        volumes.append(
            VolumeInfo(
                name=share,
                path=mount_point,
                type="remote",
                total_gb=total,
                free_gb=free,
                remote_info={"host": host, "share": share, "fstype": "nfs"},
            )
        )
    return volumes


@router.get("/files/remote-shares", response_model=List[RemoteShareInfo])
def list_remote_shares(request: Request):
    _get_user_id(request)
    return [_remote_share_info(share) for share in REMOTE_SHARES]


@router.post("/files/mount", response_model=OperationResponse)
def mount_remote_share(req: RemoteShareMountRequest, request: Request):
    _get_user_id(request)
    share = next((item for item in REMOTE_SHARES if item["id"] == req.id), None)
    if not share:
        raise HTTPException(404, "Remote share not found")

    mount_path = _remote_mount_path(share)
    if _is_mounted(mount_path):
        return OperationResponse(ok=True, path=mount_path, message="Already mounted")

    password = _password_for_share(share)
    if not password:
        raise HTTPException(
            400,
            f"Missing password env for {share['name']}. Set {share.get('password_env')} or SMB_PASSWORD or SSH_PASSWORD.",
        )

    if platform.system() != "Darwin":
        raise HTTPException(400, "SMB mount from this UI is currently supported on macOS only")

    Path(mount_path).mkdir(parents=True, exist_ok=True)
    user = urllib.parse.quote(share["user"], safe="")
    encoded_password = urllib.parse.quote(password, safe="")
    host = share["host"]
    share_name = urllib.parse.quote(share["share"], safe="")
    url = f"smb://{user}:{encoded_password}@{host}/{share_name}"

    result = subprocess.run(
        ["mount", "-t", "smbfs", "-o", "noowners", url, mount_path],
        capture_output=True,
        text=True,
        timeout=20,
    )
    if result.returncode != 0:
        message = (result.stderr or result.stdout or "Mount failed").strip()
        raise HTTPException(500, message)
    return OperationResponse(ok=True, path=mount_path, message=f"Mounted {share['name']}")


@router.get("/files/volumes", response_model=List[VolumeInfo])
def list_volumes(request: Request):
    _get_user_id(request)
    volumes: List[VolumeInfo] = []
    home = str(Path.home())
    total, free = _disk_info(home)
    volumes.append(
        VolumeInfo(name="Home", path=home, type="home", total_gb=total, free_gb=free)
    )
    if platform.system() == "Darwin" and os.path.isdir("/Volumes"):
        for item in sorted(os.listdir("/Volumes")):
            vol_path = os.path.join("/Volumes", item)
            if item.startswith("."):
                continue
            is_recovery = item == "Recovery"
            should_show = os.path.ismount(vol_path) or (os.path.isdir(vol_path) and os.path.islink(vol_path))
            if should_show and not is_recovery:
                total, free = _disk_info(vol_path)
                volumes.append(
                    VolumeInfo(
                        name=item,
                        path=vol_path,
                        type="external",
                        total_gb=total,
                        free_gb=free,
                    )
                )
    # Add remote network mounts
    remote_vols = _detect_remote_mounts()
    seen = {v.path for v in volumes}
    for rv in remote_vols:
        if rv.path not in seen:
            volumes.append(rv)
            seen.add(rv.path)
    return volumes


@router.get("/files/list")
def list_directory(
    path: str = Query(...),
    showHidden: bool = Query(False),
    request: Request = None,
):
    if request:
        _get_user_id(request)
    if not _is_safe_path(path):
        raise HTTPException(403, "Access to this path is restricted")
    if not os.path.isdir(path):
        raise HTTPException(404, "Directory not found")
    entries: List[FileEntry] = []
    try:
        for item in sorted(os.listdir(path)):
            if not showHidden and item.startswith("."):
                continue
            item_path = os.path.join(path, item)
            if not _is_safe_path(item_path):
                continue
            try:
                st = os.stat(item_path)
                is_dir = os.path.isdir(item_path)
                is_link = os.path.islink(item_path)
                entries.append(
                    FileEntry(
                        name=item,
                        path=item_path,
                        type="symlink" if is_link else ("directory" if is_dir else "file"),
                        size=st.st_size if not is_dir else 0,
                        mtime=st.st_mtime,
                        readable=os.access(item_path, os.R_OK),
                        extension=Path(item).suffix.lower(),
                    )
                )
            except (OSError, PermissionError):
                continue
    except PermissionError:
        raise HTTPException(403, "Permission denied")
    parent = str(Path(path).parent)
    if path == "/" or not _is_safe_path(parent):
        parent = None
    return {"entries": entries, "parent": parent, "current": path}


@router.get("/files/file", response_model=FileContent)
def read_file(path: str = Query(...), request: Request = None):
    if request:
        _get_user_id(request)
    if not _is_safe_path(path):
        raise HTTPException(403, "Path restricted")
    if not os.path.isfile(path):
        raise HTTPException(404, "File not found")
    if not os.access(path, os.R_OK):
        raise HTTPException(403, "Cannot read file")
    st = os.stat(path)
    ext = Path(path).suffix.lower()
    if ext in BINARY_EXTS:
        return FileContent(
            path=path,
            name=Path(path).name,
            content="[Binary file — preview not available]",
            size=st.st_size,
            mtime=st.st_mtime,
            language="",
            is_binary=True,
        )
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except (UnicodeDecodeError, OSError):
        return FileContent(
            path=path,
            name=Path(path).name,
            content="[Cannot read as text]",
            size=st.st_size,
            mtime=st.st_mtime,
            language="",
            is_binary=True,
        )
    return FileContent(
        path=path,
        name=Path(path).name,
        content=content,
        size=st.st_size,
        mtime=st.st_mtime,
        language=LANGUAGE_MAP.get(ext, ext.lstrip(".") or "txt"),
        is_binary=False,
    )


@router.get("/files/download")
def download_file(path: str = Query(...), request: Request = None):
    if request:
        _get_user_id(request)
    if not _is_safe_path(path):
        raise HTTPException(403, "Path restricted")
    if not os.path.isfile(path):
        raise HTTPException(404, "File not found")
    if not os.access(path, os.R_OK):
        raise HTTPException(403, "Cannot read file")
    filename = Path(path).name
    return FileResponse(
        path=path,
        filename=filename,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.put("/files/file", response_model=OperationResponse)
def write_file(req: FileWriteRequest, request: Request):
    _get_user_id(request)
    if not _is_safe_path(req.path):
        raise HTTPException(403, "Path restricted")
    parent = os.path.dirname(req.path) or "."
    if not os.access(parent, os.W_OK):
        raise HTTPException(403, "Cannot write to directory")
    try:
        with open(req.path, "w", encoding="utf-8") as f:
            f.write(req.content)
        return OperationResponse(ok=True, path=req.path, message="Saved")
    except OSError as e:
        raise HTTPException(500, f"Write failed: {e}")


MEDIA_EXTS = frozenset(
    {
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico",
        ".svg", ".heic", ".heif", ".tiff", ".tif",
        ".mp4", ".mov", ".webm", ".mkv", ".avi", ".wmv", ".flv",
        ".m4v", ".3gp", ".ogv", ".mts", ".m2ts", ".ts",
        ".mp3", ".wav", ".flac", ".aac", ".m4a", ".ogg", ".opus", ".wma",
    }
)


@router.get("/files/media")
def serve_media(path: str = Query(...), request: Request = None):
    if request:
        _get_user_id(request)
    if not _is_safe_path(path):
        raise HTTPException(403, "Path restricted")
    if not os.path.isfile(path):
        raise HTTPException(404, "File not found")
    ext = Path(path).suffix.lower()
    if ext not in MEDIA_EXTS:
        raise HTTPException(400, "Not a media file")
    mime, _ = mimetypes.guess_type(path)
    if not mime:
        mime = "application/octet-stream"
    file_size = os.path.getsize(path)
    range_header = request.headers.get("range") if request else None

    filename = Path(path).name
    encoded_filename = urllib.parse.quote(filename)
    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": f"inline; filename*=UTF-8''{encoded_filename}",
    }

    def iter_file(start: int = 0, end: Optional[int] = None, chunk_size: int = 1024 * 1024):
        with open(path, "rb") as f:
            f.seek(start)
            remaining = (end - start + 1) if end is not None else None
            while True:
                read_size = chunk_size if remaining is None else min(chunk_size, remaining)
                if read_size <= 0:
                    break
                chunk = f.read(read_size)
                if not chunk:
                    break
                yield chunk
                if remaining is not None:
                    remaining -= len(chunk)

    if range_header:
        match = re.match(r"bytes=(\d*)-(\d*)", range_header)
        if not match:
            raise HTTPException(416, "Invalid range")
        start_s, end_s = match.groups()
        if start_s:
            start = int(start_s)
            end = int(end_s) if end_s else file_size - 1
        else:
            suffix_len = int(end_s) if end_s else 0
            start = max(file_size - suffix_len, 0)
            end = file_size - 1
        if start >= file_size or end < start:
            raise HTTPException(416, "Range not satisfiable")
        end = min(end, file_size - 1)
        content_length = end - start + 1
        headers.update(
            {
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Content-Length": str(content_length),
            }
        )
        return StreamingResponse(
            iter_file(start, end),
            status_code=206,
            media_type=mime,
            headers=headers,
        )

    headers["Content-Length"] = str(file_size)
    return StreamingResponse(iter_file(), media_type=mime, headers=headers)


@router.delete("/files/file", response_model=OperationResponse)
def delete_file(path: str = Query(...), request: Request = None):
    if request:
        _get_user_id(request)
    if not _is_safe_path(path):
        raise HTTPException(403, "Path restricted")
    if not os.path.exists(path):
        raise HTTPException(404, "Path not found")
    trash_dir = Path.home() / ".Trash"
    trash_dir.mkdir(exist_ok=True)

    # Also delete associated .srt files for videos
    deleted_srts = []
    ext = Path(path).suffix.lower()
    if ext in MEDIA_EXTS:
        parent = Path(path).parent
        stem = Path(path).stem
        for srt_file in parent.glob(f"{stem}*.srt"):
            if srt_file.is_file():
                srt_dest = trash_dir / srt_file.name
                counter = 1
                while srt_dest.exists():
                    srt_dest = trash_dir / f"{srt_file.stem} ({counter}).srt"
                    counter += 1
                try:
                    shutil.move(str(srt_file), str(srt_dest))
                    deleted_srts.append(srt_dest.name)
                except OSError:
                    pass

    dest_name = Path(path).name
    dest = trash_dir / dest_name
    counter = 1
    while dest.exists():
        stem = Path(dest_name).stem
        suffix = Path(dest_name).suffix
        dest = trash_dir / f"{stem} ({counter}){suffix}"
        counter += 1
    try:
        shutil.move(path, str(dest))
        msg = f"Moved to Trash as {dest.name}"
        if deleted_srts:
            msg += f" (+ {', '.join(deleted_srts)})"
        return OperationResponse(ok=True, path=str(dest), message=msg)
    except OSError as e:
        raise HTTPException(500, f"Trash failed: {e}")


@router.post("/files/mkdir", response_model=OperationResponse)
def create_directory(req: MkdirRequest, request: Request):
    _get_user_id(request)
    if not _is_safe_path(req.path):
        raise HTTPException(403, "Path restricted")
    try:
        os.makedirs(req.path, exist_ok=False)
        return OperationResponse(ok=True, path=req.path, message="Created")
    except FileExistsError:
        raise HTTPException(409, "Already exists")
    except OSError as e:
        raise HTTPException(500, f"Create failed: {e}")


@router.post("/files/rename", response_model=OperationResponse)
def rename_file(req: FileRenameRequest, request: Request):
    _get_user_id(request)
    if not _is_safe_path(req.path):
        raise HTTPException(403, "Path restricted")
    parent = Path(req.path).parent
    new_path = parent / req.new_name
    if not _is_safe_path(str(new_path)):
        raise HTTPException(403, "New path restricted")
    try:
        os.rename(req.path, str(new_path))
        return OperationResponse(ok=True, path=str(new_path), message="Renamed")
    except OSError as e:
        raise HTTPException(500, f"Rename failed: {e}")


@router.post("/files/copy", response_model=OperationResponse)
def copy_file(req: FileCopyRequest, request: Request):
    _get_user_id(request)
    if not _is_safe_path(req.source) or not _is_safe_path(req.destination):
        raise HTTPException(403, "Path restricted")
    if not os.path.exists(req.source):
        raise HTTPException(404, "Source not found")
    if os.path.exists(req.destination):
        raise HTTPException(409, "Destination already exists")
    destination_parent = os.path.dirname(req.destination) or "."
    if not os.path.isdir(destination_parent):
        raise HTTPException(404, "Destination directory not found")
    source_path = Path(req.source).resolve()
    destination_path = Path(req.destination).resolve()
    if source_path.is_dir() and (
        destination_path == source_path or source_path in destination_path.parents
    ):
        raise HTTPException(400, "Cannot copy a directory into itself")
    try:
        if os.path.isdir(req.source):
            shutil.copytree(req.source, req.destination)
        else:
            shutil.copy2(req.source, req.destination)
        return OperationResponse(ok=True, path=req.destination, message="Copied")
    except OSError as e:
        raise HTTPException(500, f"Copy failed: {e}")


@router.post("/files/move", response_model=OperationResponse)
def move_file(req: FileCopyRequest, request: Request):
    _get_user_id(request)
    if not _is_safe_path(req.source) or not _is_safe_path(req.destination):
        raise HTTPException(403, "Path restricted")
    if not os.path.exists(req.source):
        raise HTTPException(404, "Source not found")
    if os.path.exists(req.destination):
        raise HTTPException(409, "Destination already exists")
    destination_parent = os.path.dirname(req.destination) or "."
    if not os.path.isdir(destination_parent):
        raise HTTPException(404, "Destination directory not found")
    source_path = Path(req.source).resolve()
    destination_path = Path(req.destination).resolve()
    if source_path.is_dir() and (
        destination_path == source_path or source_path in destination_path.parents
    ):
        raise HTTPException(400, "Cannot move a directory into itself")
    try:
        moved_path = shutil.move(req.source, req.destination)
        return OperationResponse(ok=True, path=moved_path, message="Moved")
    except OSError as e:
        raise HTTPException(500, f"Move failed: {e}")


@router.post("/files/transfer")
def start_transfer(req: FileTransferRequest, request: Request):
    uid = _get_user_id(request)
    if not _is_safe_path(req.source) or not _is_safe_path(req.destination):
        raise HTTPException(403, "Path restricted")
    if not os.path.exists(req.source):
        raise HTTPException(404, "Source not found")
    if os.path.exists(req.destination):
        raise HTTPException(409, "Destination already exists")
    destination_parent = os.path.dirname(req.destination) or "."
    if not os.path.isdir(destination_parent):
        raise HTTPException(404, "Destination directory not found")
    source_path = Path(req.source).resolve()
    destination_path = Path(req.destination).resolve()
    if source_path.is_dir() and (
        destination_path == source_path or source_path in destination_path.parents
    ):
        raise HTTPException(400, f"Cannot {req.mode} a directory into itself")

    job_id = uuid.uuid4().hex
    with _transfer_jobs_lock:
        _transfer_jobs[job_id] = {
            "id": job_id,
            "owner_id": uid,
            "mode": req.mode,
            "source": req.source,
            "destination": req.destination,
            "status": "queued",
            "progress": 0,
            "copied_bytes": 0,
            "total_bytes": 0,
            "created_at": time.time(),
            "error": "",
            "path": "",
        }
    threading.Thread(
        target=_run_transfer_job,
        args=(job_id, req.mode, req.source, req.destination),
        daemon=True,
    ).start()
    return {"id": job_id}


@router.get("/files/transfer/{job_id}")
def get_transfer(job_id: str, request: Request):
    uid = _get_user_id(request)
    with _transfer_jobs_lock:
        job = dict(_transfer_jobs.get(job_id) or {})
    if not job:
        raise HTTPException(404, "Transfer not found")
    if job.get("owner_id") != uid:
        raise HTTPException(403, "Transfer restricted")
    job.pop("owner_id", None)
    return job


@router.get("/files/pinned")
def get_pinned_folders(request: Request):
    uid = _get_user_id(request)
    user = get_user_by_id(uid)
    raw = (user or {}).get("pinned_folders", "[]")
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []


class PinnedFoldersBody(BaseModel):
    folders: list[dict]


@router.put("/files/pinned")
def save_pinned_folders(body: PinnedFoldersBody, request: Request):
    uid = _get_user_id(request)
    update_user(uid, {"pinned_folders": json.dumps(body.folders)})
    return {"ok": True}
