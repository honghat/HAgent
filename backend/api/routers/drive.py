from __future__ import annotations

import asyncio
import json
import mimetypes
import os
import shutil
import tempfile
import zipfile
from datetime import datetime
from fnmatch import fnmatch
from pathlib import Path
from typing import Any, Optional
from urllib.parse import quote, urlencode, urlsplit, urlunsplit

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel

from hagent_constants import get_token_file_path

router = APIRouter(prefix="/api/drive", tags=["drive"])

ROOT_DIR = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT_DIR / "data"
CONFIG_FILE = get_token_file_path("google_drive.json", "../data/google_drive.json")
HIDDEN_SHARED_FILE = DATA_DIR / "google_drive_hidden_shared.json"

DRIVE_API = "https://www.googleapis.com/drive/v3"
DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3"
TOKEN_URL = "https://oauth2.googleapis.com/token"
DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"

EXCLUDED_DIRS = {
    ".git",
    ".next",
    ".venv",
    "__pycache__",
    "dist",
    "node_modules",
    "venv",
}
EXCLUDED_SUFFIXES = {".pyc", ".log", ".mp4", ".mov", ".webm", ".wav", ".mp3"}
DRIVEIGNORE_FILE = ROOT_DIR / ".driveignore"


def _env_value(*names: str) -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    for env_file in (ROOT_DIR / ".env", ROOT_DIR / "backend" / ".env"):
        if not env_file.exists():
            continue
        try:
            for raw in env_file.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith("export "):
                    line = line[7:].strip()
                if "=" not in line:
                    continue
                key, value = line.split("=", 1)
                if key.strip() in names:
                    return value.strip().strip('"').strip("'")
        except Exception:
            continue
    return ""


class DriveConfig(BaseModel):
    client_id: str = ""
    client_secret: str = ""
    refresh_token: str = ""
    access_token: str = ""
    root_folder_id: str = ""


class FolderCreate(BaseModel):
    name: str
    parent_id: str = ""


class FolderDelete(BaseModel):
    id: str


class DriveItemDelete(BaseModel):
    id: str
    hide_shared: bool = False


class DriveItemUpdate(BaseModel):
    id: str
    name: str


class BackupRequest(BaseModel):
    folder_id: str = ""
    scope: str = "data"


class UploadPathRequest(BaseModel):
    path: str
    folder_id: str = ""


def _load_config() -> dict[str, Any]:
    env_config = {
        "client_id": _env_value("GOOGLE_DRIVE_CLIENT_ID", "GDRIVE_CLIENT_ID", "GOOGLE_CLIENT_ID", "YOUTUBE_CLIENT_ID"),
        "client_secret": _env_value("GOOGLE_DRIVE_CLIENT_SECRET", "GDRIVE_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET", "YOUTUBE_CLIENT_SECRET"),
        "refresh_token": _env_value("GOOGLE_DRIVE_REFRESH_TOKEN", "GDRIVE_REFRESH_TOKEN", "GOOGLE_REFRESH_TOKEN", "YOUTUBE_REFRESH_TOKEN"),
        "access_token": _env_value("GOOGLE_DRIVE_ACCESS_TOKEN", "GDRIVE_ACCESS_TOKEN", "GOOGLE_ACCESS_TOKEN"),
        "root_folder_id": _env_value("GOOGLE_DRIVE_ROOT_FOLDER_ID", "GDRIVE_ROOT_FOLDER_ID"),
    }
    saved = {}
    if CONFIG_FILE.exists():
        try:
            data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            saved = data if isinstance(data, dict) else {}
        except Exception:
            saved = {}
    return {**env_config, **{k: v for k, v in saved.items() if v}}


def _save_config(config: dict[str, Any]) -> None:
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        os.chmod(CONFIG_FILE, 0o600)
    except Exception:
        pass


def _load_hidden_shared() -> set[str]:
    if not HIDDEN_SHARED_FILE.exists():
        return set()
    try:
        data = json.loads(HIDDEN_SHARED_FILE.read_text(encoding="utf-8"))
        return set(data if isinstance(data, list) else [])
    except Exception:
        return set()


def _save_hidden_shared(ids: set[str]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    HIDDEN_SHARED_FILE.write_text(json.dumps(sorted(ids), ensure_ascii=False, indent=2), encoding="utf-8")


def _hide_shared_item(item_id: str) -> None:
    hidden = _load_hidden_shared()
    hidden.add(item_id)
    _save_hidden_shared(hidden)


def _write_env_value(key: str, value: str) -> None:
    env_path = ROOT_DIR / "backend" / ".env"
    env_path.parent.mkdir(parents=True, exist_ok=True)
    lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.exists() else []
    next_line = f'{key}="{value}"'
    replaced = False
    output = []
    for line in lines:
        stripped = line.strip()
        prefix = stripped[7:].strip() if stripped.startswith("export ") else stripped
        if prefix.startswith(f"{key}="):
            output.append(next_line)
            replaced = True
        else:
            output.append(line)
    if not replaced:
        output.append(next_line)
    env_path.write_text("\n".join(output).rstrip() + "\n", encoding="utf-8")


def _public_config(config: dict[str, Any]) -> dict[str, Any]:
    return {
        "client_id": config.get("client_id", ""),
        "has_client_secret": bool(config.get("client_secret")),
        "has_refresh_token": bool(config.get("refresh_token")),
        "has_access_token": bool(config.get("access_token")),
        "root_folder_id": config.get("root_folder_id", ""),
        "source": "env+saved" if any(_env_value("YOUTUBE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_CLIENT_ID")) else "saved",
    }


def _is_local_oauth_host(hostname: str) -> bool:
    host = hostname.lower().strip("[]")
    return host == "localhost" or host == "::1" or host.startswith("127.")


def _oauth_base_url(request: Request) -> str:
    configured = _env_value("APP_BASE_URL", "HAGENT_PUBLIC_BASE_URL", "PUBLIC_BASE_URL")
    if configured:
        return configured.rstrip("/")

    forwarded_host = request.headers.get("x-forwarded-host", "").split(",", 1)[0].strip()
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",", 1)[0].strip()
    if forwarded_host:
        hostname = urlsplit(f"//{forwarded_host}").hostname or ""
        scheme = forwarded_proto or ("http" if _is_local_oauth_host(hostname) else "https")
        return f"{scheme}://{forwarded_host}".rstrip("/")

    base = str(request.base_url).rstrip("/")
    parsed = urlsplit(base)
    hostname = parsed.hostname or ""
    scheme = parsed.scheme or "http"
    netloc = parsed.netloc
    if hostname == "localhost":
        netloc = "127.0.0.1" + (f":{parsed.port}" if parsed.port else "")
        hostname = "127.0.0.1"
    if scheme == "http" and not _is_local_oauth_host(hostname):
        scheme = "https"
    return urlunsplit((scheme, netloc, "", "", ""))


async def _access_token() -> str:
    config = _load_config()
    if config.get("refresh_token") and config.get("client_id") and config.get("client_secret"):
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                TOKEN_URL,
                data={
                    "client_id": config["client_id"],
                    "client_secret": config["client_secret"],
                    "refresh_token": config["refresh_token"],
                    "grant_type": "refresh_token",
                },
            )
        if res.status_code >= 400:
            raise HTTPException(status_code=400, detail=f"Không refresh được Google token: {res.text}")
        token = res.json().get("access_token")
        if not token:
            raise HTTPException(status_code=400, detail="Google không trả access_token")
        config["access_token"] = token
        _save_config(config)
        return token
    if config.get("access_token"):
        return config["access_token"]
    raise HTTPException(status_code=400, detail="Chưa cấu hình Google Drive token")


async def _drive_request(method: str, url: str, **kwargs) -> httpx.Response:
    token = await _access_token()
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.request(method, url, headers=headers, **kwargs)
    if res.status_code >= 400:
        message = res.text
        try:
            data = res.json()
            error = data.get("error", {})
            reason = ""
            for item in error.get("errors", []) or []:
                reason = item.get("reason") or reason
            if reason == "insufficientPermissions" or error.get("status") == "PERMISSION_DENIED":
                message = (
                    "Token Google hiện tại chưa có quyền Google Drive. "
                    "Token YouTube trong .env không dùng được cho Drive. "
                    "Hãy tạo refresh token có scope Drive và lưu vào GOOGLE_DRIVE_REFRESH_TOKEN."
                )
            else:
                message = error.get("message") or message
        except Exception:
            pass
        raise HTTPException(status_code=res.status_code, detail=message)
    return res


async def _remove_my_permission(file_id: str) -> None:
    about = await _drive_request(
        "GET",
        f"{DRIVE_API}/about",
        params={"fields": "user(permissionId)"},
    )
    permission_id = (about.json().get("user") or {}).get("permissionId")
    if not permission_id:
        raise HTTPException(status_code=403, detail="Không tìm thấy quyền truy cập của tài khoản hiện tại")
    await _drive_request(
        "DELETE",
        f"{DRIVE_API}/files/{file_id}/permissions/{permission_id}",
        params={"supportsAllDrives": "true"},
    )


async def _resolve_folder_id(folder_id: str) -> str:
    item_id = folder_id.strip()
    if not item_id or item_id == "root":
        return item_id
    res = await _drive_request(
        "GET",
        f"{DRIVE_API}/files/{item_id}",
        params={
            "fields": "id,mimeType,shortcutDetails",
            "supportsAllDrives": "true",
        },
    )
    item = res.json()
    if item.get("mimeType") != "application/vnd.google-apps.shortcut":
        return item_id
    shortcut = item.get("shortcutDetails") or {}
    if shortcut.get("targetMimeType") == "application/vnd.google-apps.folder" and shortcut.get("targetId"):
        return shortcut["targetId"]
    return item_id


def _backup_roots(scope: str) -> list[Path]:
    if scope == "workspace":
        return [ROOT_DIR]
    if scope == "config":
        return [ROOT_DIR / "config", ROOT_DIR / "ecosystem.config.cjs", ROOT_DIR / "package.json"]
    return [ROOT_DIR / "data", ROOT_DIR / "config", ROOT_DIR / "ecosystem.config.cjs"]


def _driveignore_patterns() -> list[str]:
    if not DRIVEIGNORE_FILE.exists():
        return []
    patterns = []
    for raw in DRIVEIGNORE_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        patterns.append(line)
    return patterns


def _matches_driveignore(path: Path, base: Path) -> bool:
    patterns = _driveignore_patterns()
    if not patterns:
        return False
    try:
        rel = path.relative_to(base).as_posix()
    except ValueError:
        try:
            rel = path.relative_to(ROOT_DIR).as_posix()
        except ValueError:
            rel = path.name
    rel_dir = rel + "/" if path.is_dir() and not rel.endswith("/") else rel
    for pattern in patterns:
        pat = pattern.strip("/")
        if pattern.endswith("/"):
            if rel_dir.startswith(pattern) or any(part == pat for part in rel.split("/")):
                return True
            continue
        if fnmatch(rel, pattern) or fnmatch(path.name, pattern) or fnmatch(rel, pat):
            return True
    return False


def _should_skip(path: Path, base: Path = ROOT_DIR) -> bool:
    if any(part in EXCLUDED_DIRS for part in path.parts):
        return True
    if path.suffix.lower() in EXCLUDED_SUFFIXES:
        return True
    if _matches_driveignore(path, base):
        return True
    return False


def _create_backup_zip(scope: str) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out_path = Path(tempfile.gettempdir()) / f"hagent-backup-{scope}-{stamp}.zip"
    roots = _backup_roots(scope)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root in roots:
            if not root.exists():
                continue
            if root.is_file():
                zf.write(root, root.relative_to(ROOT_DIR))
                continue
            for path in root.rglob("*"):
                if not path.is_file() or _should_skip(path, ROOT_DIR):
                    continue
                zf.write(path, path.relative_to(ROOT_DIR))
    return out_path


async def _upload_local_file_to_parent(path: Path, parent: str) -> dict[str, Any]:
    metadata = {"name": path.name, "parents": [parent]}
    mime = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    files = {
        "metadata": (None, json.dumps(metadata), "application/json; charset=UTF-8"),
        "file": (path.name, path.read_bytes(), mime),
    }
    res = await _drive_request(
        "POST",
        f"{DRIVE_UPLOAD_API}/files",
        params={
            "uploadType": "multipart",
            "fields": "id,name,size,webViewLink,createdTime",
            "supportsAllDrives": "true",
        },
        files=files,
    )
    return res.json()


async def _upload_local_file(path: Path, folder_id: str) -> dict[str, Any]:
    parent = await _resolve_folder_id(folder_id or _load_config().get("root_folder_id") or "root")
    return await _upload_local_file_to_parent(path, parent)


async def _create_drive_folder(name: str, parent: str) -> dict[str, Any]:
    res = await _drive_request(
        "POST",
        f"{DRIVE_API}/files",
        json={
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent],
        },
        headers={"Content-Type": "application/json"},
        params={"supportsAllDrives": "true", "fields": "id,name,mimeType,parents,webViewLink"},
    )
    return res.json()


def _drive_q_escape(name: str) -> str:
    return name.replace("\\", "\\\\").replace("'", "\\'")


async def _find_drive_folder(name: str, parent: str) -> Optional[dict[str, Any]]:
    q = (
        f"name = '{_drive_q_escape(name)}' and '{parent}' in parents "
        "and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    )
    try:
        res = await _drive_request(
            "GET",
            f"{DRIVE_API}/files",
            params={
                "q": q,
                "fields": "files(id,name,mimeType,parents,webViewLink)",
                "pageSize": 1,
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
                "corpora": "allDrives",
            },
        )
        files = res.json().get("files", [])
        return files[0] if files else None
    except Exception:
        return None


async def _find_or_create_drive_folder(name: str, parent: str) -> dict[str, Any]:
    found = await _find_drive_folder(name, parent)
    if found:
        return found
    return await _create_drive_folder(name, parent)


async def _upload_directory_tree(source: Path, folder_id: str) -> dict[str, Any]:
    parent = await _resolve_folder_id(folder_id or _load_config().get("root_folder_id") or "root")
    root_folder = await _find_or_create_drive_folder(source.name, parent)
    folder_ids: dict[Path, str] = {source: root_folder["id"]}
    created_folders = [root_folder]
    uploaded_files = []

    for path in sorted(source.rglob("*"), key=lambda item: (len(item.relative_to(source).parts), item.relative_to(source).as_posix())):
        if path.is_symlink():
            continue
        if path.is_dir():
            drive_parent = folder_ids.get(path.parent, root_folder["id"])
            folder = await _find_or_create_drive_folder(path.name, drive_parent)
            folder_ids[path] = folder["id"]
            created_folders.append(folder)
            continue
        if not path.is_file():
            continue
        drive_parent = folder_ids.get(path.parent, root_folder["id"])
        uploaded_files.append(await _upload_local_file_to_parent(path, drive_parent))

    return {
        "root_folder": root_folder,
        "created_folders": created_folders,
        "uploaded_files": uploaded_files,
        "folder_count": len(created_folders),
        "file_count": len(uploaded_files),
    }


@router.get("/config")
async def get_drive_config():
    config = _load_config()
    return {"config": _public_config(config), "ready": bool(config.get("access_token") or config.get("refresh_token"))}


@router.get("/auth/login")
async def drive_login(request: Request):
    config = _load_config()
    client_id = config.get("client_id", "")
    if not client_id:
        return HTMLResponse("""<html><body><h2>Thiếu Google Client ID</h2>
<p>Thêm <code>GOOGLE_DRIVE_CLIENT_ID</code> hoặc dùng <code>YOUTUBE_CLIENT_ID</code> trong <code>backend/.env</code>.</p>
</body></html>""")
    base = _oauth_base_url(request)
    redirect_uri = base + "/api/drive/auth/callback"
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": DRIVE_SCOPE,
        "access_type": "offline",
        "prompt": "consent",
    })
    return RedirectResponse(auth_url)


@router.get("/auth/callback")
async def drive_callback(code: str = Query(""), request: Request = None):
    if not code:
        return HTMLResponse("<html><body><h2>Lỗi: Không có mã xác thực Google Drive</h2></body></html>")
    config = _load_config()
    client_id = config.get("client_id", "")
    client_secret = config.get("client_secret", "")
    redirect_uri = _oauth_base_url(request) + "/api/drive/auth/callback"
    if not client_id or not client_secret:
        return HTMLResponse("<html><body><h2>Thiếu client_id/client_secret cho Google Drive</h2></body></html>")
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(TOKEN_URL, data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })
    data = res.json()
    refresh_token = data.get("refresh_token", "")
    if not refresh_token:
        return HTMLResponse(f"""<html><body><h2>Không nhận được refresh token</h2>
<p>Hãy chọn lại tài khoản và đồng ý cấp quyền Drive. Nếu vẫn lỗi, gỡ quyền app ở Google Account rồi thử lại.</p>
<pre>{json.dumps(data, ensure_ascii=False, indent=2)}</pre>
</body></html>""")
    _write_env_value("GOOGLE_DRIVE_REFRESH_TOKEN", refresh_token)
    config["refresh_token"] = refresh_token
    config.pop("access_token", None)
    _save_config(config)
    return HTMLResponse("""<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:32px">
<h2>Đã kết nối Google Drive</h2>
<p>Refresh token đã được lưu vào <code>backend/.env</code>. Có thể đóng tab này và bấm Làm mới trong H-Agent.</p>
</body></html>""")


@router.put("/config")
async def update_drive_config(payload: DriveConfig):
    current = _load_config()
    next_config = {
        "client_id": payload.client_id.strip(),
        "client_secret": payload.client_secret.strip() or current.get("client_secret", ""),
        "refresh_token": payload.refresh_token.strip() or current.get("refresh_token", ""),
        "access_token": payload.access_token.strip() or current.get("access_token", ""),
        "root_folder_id": payload.root_folder_id.strip(),
    }
    _save_config(next_config)
    return {"config": _public_config(next_config), "message": "Đã lưu Google Drive"}


@router.get("/folders")
async def list_folders(parent_id: Optional[str] = None):
    config = _load_config()
    parent = await _resolve_folder_id(parent_id or config.get("root_folder_id") or "root")
    query = f"'{parent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    res = await _drive_request(
        "GET",
        f"{DRIVE_API}/files",
        params={
            "q": query,
            "fields": "files(id,name,createdTime,modifiedTime,parents)",
            "orderBy": "folder,name",
            "pageSize": 100,
        },
    )
    return {"parent_id": parent, "folders": res.json().get("files", [])}


@router.get("/items")
async def list_items(parent_id: Optional[str] = None, shared: bool = Query(False)):
    config = _load_config()
    parent = await _resolve_folder_id(parent_id or config.get("root_folder_id") or "root")
    query = "sharedWithMe = true and trashed = false" if shared and not parent_id else f"'{parent}' in parents and trashed = false"
    res = await _drive_request(
        "GET",
        f"{DRIVE_API}/files",
        params={
            "q": query,
            "fields": "files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,parents,shortcutDetails)",
            "orderBy": "folder,name",
            "pageSize": 200,
            "corpora": "allDrives",
            "includeItemsFromAllDrives": "true",
            "supportsAllDrives": "true",
        },
    )
    items = res.json().get("files", [])
    if shared and not parent_id:
        hidden = _load_hidden_shared()
        items = [item for item in items if item.get("id") not in hidden]
    return {"parent_id": parent, "items": items}


@router.post("/folders")
async def create_folder(payload: FolderCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tên thư mục bắt buộc")
    config = _load_config()
    parent = await _resolve_folder_id(payload.parent_id.strip() or config.get("root_folder_id") or "root")
    res = await _drive_request(
        "POST",
        f"{DRIVE_API}/files",
        json={
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent],
        },
        headers={"Content-Type": "application/json"},
        params={"supportsAllDrives": "true", "fields": "id,name,mimeType,parents,webViewLink"},
    )
    return {"folder": res.json()}


@router.delete("/folders")
async def delete_folder(payload: FolderDelete):
    if not payload.id.strip():
        raise HTTPException(status_code=400, detail="Thiếu folder id")
    await _drive_request("DELETE", f"{DRIVE_API}/files/{payload.id.strip()}")
    return {"status": "deleted"}


@router.patch("/items")
async def rename_item(payload: DriveItemUpdate):
    item_id = payload.id.strip()
    name = payload.name.strip()
    if not item_id or not name:
        raise HTTPException(status_code=400, detail="Thiếu id hoặc tên mới")
    res = await _drive_request(
        "PATCH",
        f"{DRIVE_API}/files/{item_id}",
        json={"name": name},
        headers={"Content-Type": "application/json"},
        params={"fields": "id,name,mimeType,modifiedTime,webViewLink"},
    )
    return {"item": res.json()}


@router.delete("/items")
async def delete_item(payload: DriveItemDelete):
    item_id = payload.id.strip()
    if not item_id:
        raise HTTPException(status_code=400, detail="Thiếu item id")
    if payload.hide_shared:
        _hide_shared_item(item_id)
        return {"status": "hidden_shared"}
    try:
        await _drive_request("DELETE", f"{DRIVE_API}/files/{item_id}", params={"supportsAllDrives": "true"})
        return {"status": "deleted"}
    except HTTPException as exc:
        if exc.status_code not in (403, 404):
            raise
        try:
            await _remove_my_permission(item_id)
            return {"status": "removed_shared"}
        except HTTPException:
            _hide_shared_item(item_id)
            return {"status": "hidden_shared"}


@router.post("/backup")
async def backup_to_drive(payload: BackupRequest):
    folder_id = await _resolve_folder_id(payload.folder_id.strip() or _load_config().get("root_folder_id") or "root")
    scope = payload.scope if payload.scope in {"data", "config", "workspace"} else "data"
    archive = _create_backup_zip(scope)
    metadata = {"name": archive.name, "parents": [folder_id]}
    mime = mimetypes.guess_type(str(archive))[0] or "application/zip"
    try:
      files = {
          "metadata": (None, json.dumps(metadata), "application/json; charset=UTF-8"),
          "file": (archive.name, archive.read_bytes(), mime),
      }
      res = await _drive_request(
          "POST",
          f"{DRIVE_UPLOAD_API}/files",
          params={"uploadType": "multipart", "fields": "id,name,size,webViewLink,createdTime"},
          files=files,
      )
      return {"file": res.json(), "size": archive.stat().st_size}
    finally:
      archive.unlink(missing_ok=True)


@router.post("/upload-path")
async def upload_path_to_drive(payload: UploadPathRequest):
    source = Path(payload.path).expanduser().resolve()
    if not source.exists():
        raise HTTPException(status_code=404, detail="Không tìm thấy file/thư mục")
    if source.is_dir():
        result = await _upload_directory_tree(source, payload.folder_id.strip())
        return {
            "folder": result["root_folder"],
            "source": str(source),
            "archived": False,
            "type": "folder",
            "folder_count": result["folder_count"],
            "file_count": result["file_count"],
            "created_folders": result["created_folders"],
            "uploaded_files": result["uploaded_files"],
        }
    file_info = await _upload_local_file(source, payload.folder_id.strip())
    return {
        "file": file_info,
        "source": str(source),
        "archived": False,
        "type": "file",
        "file_count": 1,
        "folder_count": 0,
    }


# ============================================================================
# Multi-account DiDong Sync
# ============================================================================

from api.services import drive_sync  # noqa: E402
from api.services.drive_sync import (  # noqa: E402
    get_account_quota,
    quota_group_for_limit,
    start_sync,
    start_drive_download,
    get_job,
    list_jobs,
    cancel_job,
)
from api.services.db import get_connection  # noqa: E402
from api.services.user_store import resolve_user_id  # noqa: E402

# Khoá nội bộ không trả ra API (token nhạy cảm / callable không serialize được).
_JOB_HIDDEN = {"token_paths", "_on_finish", "log"}


def _public_job(job: dict | None) -> dict | None:
    if not job:
        return job
    public = {k: v for k, v in job.items() if k not in _JOB_HIDDEN}
    if public.get("map_id") and not public.get("map_name"):
        try:
            backup_map = drive_sync.get_map(public["map_id"])
            if backup_map:
                public["map_name"] = backup_map.get("name", "")
                public["title"] = backup_map.get("name", "")
        except Exception:
            pass
    return public


def _get_uid(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    token = (
        auth.replace("Bearer ", "").strip()
        or request.query_params.get("t", "")
        or request.cookies.get("hagent_token", "")
    )
    uid = resolve_user_id(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Chưa đăng nhập")
    return uid


class SyncStartPayload(BaseModel):
    source: str
    account_ids: list[str]
    delete_source_after_sync: bool = False


class BackupMapPayload(BaseModel):
    name: str = ""
    source_path: str = ""
    source_paths: list[str] = []
    dest_folder: str = ""
    dest_folders: dict[str, str] = {}
    account_ids: list[str]
    enabled: bool = True
    delete_source_after_sync: bool = False
    run_now: bool = False
    is_transient: bool = False
    schedule_interval: str = "daily_2"


class BackupMapUpdate(BaseModel):
    name: str | None = None
    source_path: str | None = None
    source_paths: list[str] | None = None
    dest_folder: str | None = None
    dest_folders: dict[str, str] | None = None
    account_ids: list[str] | None = None
    enabled: bool | None = None
    delete_source_after_sync: bool | None = None
    schedule_interval: str | None = None


class LocalRenamePayload(BaseModel):
    path: str
    name: str


class LocalDeletePayload(BaseModel):
    path: str
    confirm_delete: bool = False


def _delete_local_target(target: Path) -> None:
    if target.is_dir() and not target.is_symlink():
        shutil.rmtree(target)
    else:
        target.unlink()


def _normalize_map_sources(source_paths: list[str] | None, source_path: str | None = "") -> list[str]:
    raw_items = source_paths or []
    if not raw_items and source_path:
        raw_items = [source_path]
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in raw_items:
        value = str(raw or "").strip()
        if not value or value in seen:
            continue
        normalized.append(value)
        seen.add(value)
    return normalized


@router.get("/sync/accounts-quota")
async def sync_accounts_quota(request: Request):
    """Trả quota Drive cho tất cả tài khoản Google đã kết nối."""
    uid = _get_uid(request)
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, email, token_path FROM google_accounts WHERE user_id = ?", (uid,)
        ).fetchall()

    async def get_one(row):
        q = await get_account_quota(row["token_path"])
        return {
            "id": row["id"],
            "email": row["email"],
            "shared_group": quota_group_for_limit(q.get("limit", 0)),
            **q,
        }

    result = await asyncio.gather(*(get_one(row) for row in rows))

    shared_pools: dict[str, dict[str, int]] = {}
    for account in result:
        group = account.get("shared_group", "")
        if not group:
            continue
        pool = shared_pools.setdefault(group, {"limit": 0, "free": account["free"]})
        pool["limit"] = max(pool["limit"], account["limit"])
        pool["free"] = min(pool["free"], account["free"])
    for account in result:
        pool = shared_pools.get(account.get("shared_group", ""))
        if pool:
            account["pool_limit"] = pool["limit"]
            account["pool_free"] = pool["free"]
            account["pool_used"] = max(0, pool["limit"] - pool["free"])
    return {"accounts": result}


def _local_directory_size(directory: Path, cache: dict[str, int]) -> int:
    key = str(directory)
    if key in cache:
        return cache[key]
    try:
        if directory.is_mount():
            size = shutil.disk_usage(directory).used
            cache[key] = size
            return size
    except OSError:
        pass
    total = 0
    try:
        with os.scandir(directory) as iterator:
            for child in iterator:
                try:
                    if child.is_symlink():
                        continue
                    if child.is_dir(follow_symlinks=False):
                        total += _local_directory_size(Path(child.path), cache)
                    else:
                        total += child.stat(follow_symlinks=False).st_size
                except (PermissionError, FileNotFoundError, OSError):
                    continue
    except (PermissionError, FileNotFoundError, OSError):
        total = 0
    cache[key] = total
    return total


def _sync_browse_entries(
    directory: Path,
    *,
    show_hidden: bool,
    depth: int,
    size_cache: dict[str, int],
) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    try:
        with os.scandir(directory) as it:
            children = list(it)
    except (PermissionError, FileNotFoundError, OSError):
        return []

    # Sắp xếp theo tên
    children.sort(key=lambda entry: entry.name)

    for entry in children:
        if not show_hidden and entry.name.startswith("."):
            continue
        try:
            is_dir = entry.is_dir(follow_symlinks=False)
            is_symlink = entry.is_symlink()
            st_size = 0
            if not is_dir and not is_symlink:
                try:
                    st_size = entry.stat(follow_symlinks=False).st_size
                except OSError:
                    st_size = 0

            # Luôn gán dir_size = 0 để tránh disk_usage/is_mount cực kỳ chậm trên macOS / ổ đĩa ngoài
            dir_size = 0

            item_entry: dict[str, Any] = {
                "name": entry.name,
                "path": entry.path,
                "type": "dir" if is_dir else "file",
                "size": dir_size if is_dir else st_size,
                "hidden": entry.name.startswith("."),
            }

            if is_dir and depth > 1 and not is_symlink:
                try:
                    item_entry["children"] = _sync_browse_entries(
                        Path(entry.path),
                        show_hidden=show_hidden,
                        depth=depth - 1,
                        size_cache=size_cache,
                    )
                except (PermissionError, OSError):
                    item_entry["children"] = []
            entries.append(item_entry)
        except (PermissionError, FileNotFoundError, OSError):
            continue
    return entries


@router.get("/sync/browse")
async def sync_browse(
    path: str = Query("/"),
    show_hidden: bool = Query(False),
    depth: int = Query(1, ge=1, le=2),
):
    """Duyệt filesystem cục bộ; có thể trả cây tối đa 2 cấp."""
    p = Path(path).expanduser()
    if not p.exists():
        raise HTTPException(status_code=404, detail="Đường dẫn không tồn tại")
    if p.is_file():
        st = p.stat()
        return {
            "type": "file",
            "name": p.name,
            "size": st.st_size,
            "path": str(p),
            "hidden": p.name.startswith("."),
        }
    try:
        entries = await asyncio.to_thread(
            _sync_browse_entries,
            p,
            show_hidden=show_hidden,
            depth=depth,
            size_cache={},
        )
        return {"type": "dir", "path": str(p), "entries": entries, "depth": depth}
    except (PermissionError, OSError):
        raise HTTPException(status_code=403, detail="Không có quyền truy cập")


@router.post("/sync/local-rename")
async def sync_local_rename(payload: LocalRenamePayload, request: Request):
    """Đổi tên thư mục hoặc tệp cục bộ."""
    _get_uid(request)
    source = Path(payload.path).expanduser()
    name = payload.name.strip()
    if not source.exists():
        raise HTTPException(status_code=404, detail="Đường dẫn không tồn tại")
    if source.parent == source:
        raise HTTPException(status_code=400, detail="Không thể đổi tên thư mục gốc")
    if not name or name in {".", ".."} or "/" in name or "\0" in name:
        raise HTTPException(status_code=400, detail="Tên mới không hợp lệ")
    target = source.with_name(name)
    if target.exists():
        raise HTTPException(status_code=409, detail="Tên mới đã tồn tại")
    try:
        await asyncio.to_thread(source.rename, target)
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"Đổi tên thất bại: {exc}")
    return {"path": str(target), "name": target.name, "type": "dir" if target.is_dir() else "file"}


@router.post("/sync/local-delete")
async def sync_local_delete(payload: LocalDeletePayload, request: Request):
    """Xóa tệp hoặc thư mục cục bộ."""
    _get_uid(request)
    if not payload.confirm_delete:
        raise HTTPException(status_code=400, detail="Cần xác nhận xóa")
    target = Path(payload.path).expanduser()
    if not target.exists() and not target.is_symlink():
        return {"deleted": True, "missing": True, "path": str(target)}
    if target.parent == target:
        raise HTTPException(status_code=400, detail="Không thể xóa thư mục gốc")
    item_type = "dir" if target.is_dir() else "file"
    try:
        await asyncio.to_thread(_delete_local_target, target)
    except OSError as exc:
        if not target.exists() and not target.is_symlink():
            return {"deleted": True, "path": str(target), "type": item_type, "warning": str(exc)}
        raise HTTPException(status_code=400, detail=f"Xóa thất bại: {exc}")
    return {"deleted": True, "path": str(target), "type": item_type}


@router.post("/sync/start")
async def sync_start(payload: SyncStartPayload, request: Request):
    """Bắt đầu job đồng bộ ổ di động lên Drive."""
    uid = _get_uid(request)
    source = Path(payload.source).expanduser()
    if not source.exists():
        raise HTTPException(status_code=404, detail="Không tìm thấy đường dẫn nguồn")
    if not payload.account_ids:
        raise HTTPException(status_code=400, detail="Cần chọn ít nhất 1 tài khoản")

    with get_connection() as conn:
        token_paths = []
        valid_ids = []
        for aid in payload.account_ids:
            row = conn.execute(
                "SELECT id, email, token_path FROM google_accounts WHERE id = ? AND user_id = ?",
                (aid, uid),
            ).fetchone()
            if row:
                token_paths.append(row["token_path"])
                valid_ids.append(row["id"])

    if not valid_ids:
        raise HTTPException(status_code=400, detail="Không tìm thấy tài khoản hợp lệ")

    job = start_sync(str(source), valid_ids, token_paths, delete_source_after_sync=payload.delete_source_after_sync)
    return _public_job(job)


@router.get("/sync/jobs")
async def sync_jobs(request: Request):
    uid = _get_uid(request)
    live_jobs = list_jobs()
    live_run_ids = {j.get("run_id") for j in live_jobs if j.get("run_id")}
    drive_sync.mark_interrupted_active_runs(uid, live_run_ids)
    history = [j for j in drive_sync.list_history_jobs(uid) if j.get("run_id") not in live_run_ids]
    return {"jobs": [_public_job(j) for j in [*history, *live_jobs]]}


@router.get("/sync/jobs/{job_id}")
async def sync_job_status(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy job")
    return _public_job(job)


@router.post("/sync/jobs/{job_id}/cancel")
async def sync_job_cancel(job_id: str):
    if not cancel_job(job_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy job hoặc đã xong")
    return {"ok": True}


# ── Backup Maps (gmail ↔ thư mục, lưu DB, tự chạy 2h sáng) ──────────────────

def _account_token_path(uid: str, account_id: str) -> str:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT token_path FROM google_accounts WHERE id = ? AND user_id = ?",
            (account_id, uid),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản")
    return row["token_path"]


class DriveFolderCreate(BaseModel):
    account_id: str
    name: str
    parent_id: str = "root"


class DriveFolderRename(BaseModel):
    account_id: str
    name: str


class DriveCleanupPayload(BaseModel):
    account_id: str
    folder_id: str = "root"
    confirm_permanent: bool = False


class DriveTrashPayload(BaseModel):
    account_id: str
    item_id: str
    confirm_delete: bool = False
    empty_trash: bool = True


class DriveDownloadPayload(BaseModel):
    account_id: str
    item_id: str
    destination_path: str


class DriveMovePayload(BaseModel):
    source_account_id: str
    target_account_id: str
    item_id: str
    target_parent_id: str = "root"
    confirm_move: bool = False
    background: bool = False
    item_name: str = ""


class DriveSharePayload(BaseModel):
    account_id: str
    item_id: str
    email: str = ""
    role: str = "reader"
    type: str = "user"
    domain: str = ""
    send_notification: bool = False


class DrivePermissionUpdate(BaseModel):
    account_id: str
    role: str


GOOGLE_NATIVE_MIME_PREFIX = "application/vnd.google-apps."
GOOGLE_NATIVE_PDF_EXPORTS = {
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.spreadsheet",
    "application/vnd.google-apps.presentation",
    "application/vnd.google-apps.drawing",
}
DRIVE_OFFICE_PREVIEW_EXTS = {".doc", ".docx", ".pptx", ".xlsx", ".xlsm"}
MAX_DRIVE_OFFICE_PREVIEW_BYTES = 35 * 1024 * 1024


async def _drive_item_metadata(token: str, item_id: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            f"{DRIVE_API}/files/{item_id}",
            headers={"Authorization": f"Bearer {token}"},
            params={
                "supportsAllDrives": "true",
                "fields": "id,name,mimeType,size,webViewLink,iconLink,thumbnailLink",
            },
        )
    response.raise_for_status()
    return response.json()


def _preview_filename(name: str, suffix: str = "") -> str:
    safe = (name or "drive-file").replace("/", "_").replace("\0", "").strip()
    if not safe or safe in {".", ".."}:
        safe = "drive-file"
    if suffix and not safe.lower().endswith(suffix):
        safe += suffix
    return safe


async def _stream_drive_http(
    *,
    token: str,
    url: str,
    params: dict[str, Any],
    media_type: str,
    filename: str,
    request: Request,
    download: bool,
) -> StreamingResponse:
    client = httpx.AsyncClient(timeout=600, follow_redirects=True)
    headers = {"Authorization": f"Bearer {token}"}
    range_header = request.headers.get("range", "")
    if range_header:
        headers["Range"] = range_header

    stream = client.stream("GET", url, headers=headers, params=params)
    response = await stream.__aenter__()
    if response.status_code >= 400:
        body = (await response.aread()).decode("utf-8", errors="replace")
        await stream.__aexit__(None, None, None)
        await client.aclose()
        raise HTTPException(status_code=response.status_code, detail=body or "Google Drive preview failed")

    disposition = "attachment" if download else "inline"
    out_headers = {
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(filename)}",
    }
    for source, target in (
        ("content-length", "Content-Length"),
        ("content-range", "Content-Range"),
        ("accept-ranges", "Accept-Ranges"),
    ):
        if response.headers.get(source):
            out_headers[target] = response.headers[source]

    async def body():
        try:
            async for chunk in response.aiter_bytes():
                yield chunk
        finally:
            await stream.__aexit__(None, None, None)
            await client.aclose()

    actual_media_type = response.headers.get("content-type", "").split(";", 1)[0].strip() or media_type
    return StreamingResponse(
        body(),
        status_code=206 if response.status_code == 206 else 200,
        media_type=actual_media_type,
        headers=out_headers,
    )


@router.get("/sync/drive-preview")
async def sync_drive_preview(
    request: Request,
    account_id: str = Query(...),
    item_id: str = Query(...),
    download: bool = Query(False),
    thumbnail: bool = Query(False),
):
    """Stream preview/download cho một file Drive. Google-native files được export PDF."""
    uid = _get_uid(request)
    token_path = _account_token_path(uid, account_id)
    token = await drive_sync._refresh_token(token_path)
    try:
        metadata = await _drive_item_metadata(token, item_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không đọc được metadata Drive: {exc}")

    name = metadata.get("name") or "drive-file"
    mime_type = metadata.get("mimeType", "")
    if mime_type == drive_sync.DRIVE_FOLDER_MIME:
        raise HTTPException(status_code=400, detail="Không thể xem trước thư mục")

    guessed_type = mimetypes.guess_type(name)[0] or ""
    is_image = (guessed_type.startswith("image/") or mime_type.startswith("image/"))
    thumbnail_link = metadata.get("thumbnailLink", "")
    if thumbnail and is_image and thumbnail_link and not download:
        return await _stream_drive_http(
            token=token,
            url=thumbnail_link.replace("=s220", "=s4096"),
            params={},
            media_type=guessed_type or mime_type or "image/jpeg",
            filename=_preview_filename(name),
            request=request,
            download=False,
        )

    if mime_type.startswith(GOOGLE_NATIVE_MIME_PREFIX):
        if mime_type not in GOOGLE_NATIVE_PDF_EXPORTS:
            raise HTTPException(status_code=400, detail="Định dạng Google này chưa hỗ trợ preview")
        media_type = "application/pdf"
        return await _stream_drive_http(
            token=token,
            url=f"{DRIVE_API}/files/{item_id}/export",
            params={"mimeType": media_type},
            media_type=media_type,
            filename=_preview_filename(name, ".pdf"),
            request=request,
            download=download,
        )

    media_type = guessed_type if mime_type in {"", "application/octet-stream"} and guessed_type else mime_type
    media_type = media_type or "application/octet-stream"
    return await _stream_drive_http(
        token=token,
        url=f"{DRIVE_API}/files/{item_id}",
        params={"alt": "media", "supportsAllDrives": "true"},
        media_type=media_type,
        filename=_preview_filename(name),
        request=request,
        download=download,
    )


@router.get("/sync/drive-office-preview")
async def sync_drive_office_preview(request: Request, account_id: str = Query(...), item_id: str = Query(...)):
    """Tải tạm Office file trên Drive và trả preview text/table giống File Manager."""
    uid = _get_uid(request)
    token_path = _account_token_path(uid, account_id)
    token = await drive_sync._refresh_token(token_path)
    try:
        metadata = await _drive_item_metadata(token, item_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không đọc được metadata Drive: {exc}")

    name = metadata.get("name") or "drive-file"
    ext = Path(name).suffix.lower()
    if ext not in DRIVE_OFFICE_PREVIEW_EXTS:
        raise HTTPException(status_code=400, detail="File này không phải Office preview được")
    size = int(metadata.get("size") or 0)
    if size > MAX_DRIVE_OFFICE_PREVIEW_BYTES:
        raise HTTPException(status_code=413, detail="File Office quá lớn để xem nhanh")

    temp_fd, temp_name = tempfile.mkstemp(prefix="hagent-drive-preview-", suffix=ext)
    os.close(temp_fd)
    temp_path = Path(temp_name)
    try:
        async with httpx.AsyncClient(timeout=600, follow_redirects=True) as client:
            async with client.stream(
                "GET",
                f"{DRIVE_API}/files/{item_id}",
                headers={"Authorization": f"Bearer {token}"},
                params={"alt": "media", "supportsAllDrives": "true"},
            ) as response:
                response.raise_for_status()
                written = 0
                with temp_path.open("wb") as output:
                    async for chunk in response.aiter_bytes():
                        written += len(chunk)
                        if written > MAX_DRIVE_OFFICE_PREVIEW_BYTES:
                            raise HTTPException(status_code=413, detail="File Office quá lớn để xem nhanh")
                        output.write(chunk)
        from api.routers.files import _build_office_preview
        preview = await asyncio.to_thread(_build_office_preview, str(temp_path))
        return {
            "path": f"drive:{item_id}",
            "name": name,
            "size": size,
            "mimeType": metadata.get("mimeType", ""),
            "webViewLink": metadata.get("webViewLink", ""),
            "extension": ext,
            **preview,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không xem trước được file Office trên Drive: {exc}")
    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except OSError:
            pass


@router.get("/sync/drive-folders")
async def sync_drive_folders(request: Request, account_id: str = Query(...), parent_id: str = Query("root")):
    """Duyệt thư mục và tệp trên Google Drive của 1 tài khoản."""
    uid = _get_uid(request)
    token_path = _account_token_path(uid, account_id)
    try:
        items = await drive_sync.list_drive_items(token_path, parent_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Không đọc được Drive: {e}")
    return {
        "items": items,
        "folders": [item for item in items if item["type"] == "folder"],
    }


@router.post("/sync/drive-folders")
async def sync_create_drive_folder(payload: DriveFolderCreate, request: Request):
    """Tạo thư mục mới trên Drive của 1 tài khoản."""
    uid = _get_uid(request)
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Thiếu tên thư mục")
    token_path = _account_token_path(uid, payload.account_id)
    try:
        folder = await drive_sync.create_drive_folder(token_path, payload.name, payload.parent_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Tạo thư mục thất bại: {e}")
    return folder


@router.put("/sync/drive-folders/{folder_id}")
async def sync_rename_drive_folder(folder_id: str, payload: DriveFolderRename, request: Request):
    """Đổi tên thư mục Drive hiện tại."""
    uid = _get_uid(request)
    name = payload.name.strip()
    if folder_id == "root":
        raise HTTPException(status_code=400, detail="Không thể đổi tên My Drive")
    if not name:
        raise HTTPException(status_code=400, detail="Thiếu tên thư mục")
    token_path = _account_token_path(uid, payload.account_id)
    try:
        return await drive_sync.rename_drive_folder(token_path, folder_id, name)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Đổi tên thư mục thất bại: {exc}")


@router.post("/sync/drive-cleanup")
async def sync_drive_cleanup(payload: DriveCleanupPayload, request: Request):
    """Xóa vĩnh viễn thư mục/nội dung Drive và dọn toàn bộ thùng rác của tài khoản."""
    uid = _get_uid(request)
    if not payload.confirm_permanent:
        raise HTTPException(status_code=400, detail="Cần xác nhận xóa vĩnh viễn")
    token_path = _account_token_path(uid, payload.account_id)
    try:
        return await drive_sync.delete_drive_target_and_empty_trash(
            token_path,
            payload.folder_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Xóa Drive thất bại: {exc}")


@router.post("/sync/drive-trash")
async def sync_drive_trash(payload: DriveTrashPayload, request: Request):
    """Chuyển một tệp hoặc thư mục Drive vào thùng rác và có thể dọn thùng rác."""
    uid = _get_uid(request)
    if not payload.confirm_delete:
        raise HTTPException(status_code=400, detail="Cần xác nhận xóa")
    token_path = _account_token_path(uid, payload.account_id)
    try:
        return await drive_sync.trash_drive_item(token_path, payload.item_id, payload.empty_trash)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Xóa Drive thất bại: {exc}")


@router.post("/sync/drive-download")
async def sync_drive_download(payload: DriveDownloadPayload, request: Request):
    """Tải tệp hoặc cây thư mục Drive xuống Local."""
    uid = _get_uid(request)
    token_path = _account_token_path(uid, payload.account_id)
    try:
        return _public_job(start_drive_download(payload.account_id, token_path, payload.item_id, payload.destination_path))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Tải Drive xuống Local thất bại: {exc}")


@router.post("/sync/drive-move")
async def sync_drive_move(payload: DriveMovePayload, request: Request):
    """Di chuyển tệp/thư mục trong Drive hoặc giữa hai Gmail đã kết nối."""
    uid = _get_uid(request)
    if not payload.confirm_move:
        raise HTTPException(status_code=400, detail="Cần xác nhận di chuyển")
    source_token_path = _account_token_path(uid, payload.source_account_id)
    target_token_path = _account_token_path(uid, payload.target_account_id)

    if source_token_path == target_token_path:
        # Cùng tài khoản — chạy ngay (luôn nhanh)
        try:
            return await drive_sync.move_drive_item_between_accounts(
                source_token_path, target_token_path, payload.item_id, payload.target_parent_id,
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Di chuyển Drive thất bại: {exc}")

    # Khác tài khoản — chạy ngầm nếu background=true
    if payload.background:
        job = drive_sync.start_drive_move_job(
            source_token_path, target_token_path,
            payload.item_id, payload.target_parent_id,
            payload.source_account_id, payload.target_account_id,
            item_name=payload.item_name,
        )
        return {"background": True, "job": _public_job(job)}
    try:
        return await drive_sync.move_drive_item_between_accounts(
            source_token_path, target_token_path, payload.item_id, payload.target_parent_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Di chuyển Drive thất bại: {exc}")


# ── Drive Sharing (permissions) ──────────────────────────────────────────────


async def _drive_permission_request(
    method: str,
    account_id: str,
    url: str,
    uid: str,
    **kwargs,
) -> dict[str, Any]:
    token_path = _account_token_path(uid, account_id)
    token = await drive_sync._refresh_token(token_path)
    params = kwargs.pop("params", {})
    params.setdefault("supportsAllDrives", "true")
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.request(
            method, url,
            headers={"Authorization": f"Bearer {token}"},
            params=params,
            **kwargs,
        )
    if r.status_code >= 400:
        detail = r.text
        try:
            detail = r.json().get("error", {}).get("message") or detail
        except Exception:
            pass
        raise HTTPException(status_code=r.status_code, detail=detail)
    return r.json()


@router.get("/sync/drive-permissions/{item_id}")
async def list_drive_permissions(item_id: str, account_id: str = Query(...), request: Request = None):
    """Liệt kê quyền truy cập của 1 file/thư mục Drive."""
    uid = _get_uid(request)
    data = await _drive_permission_request(
        "GET", account_id,
        f"{DRIVE_API}/files/{item_id}/permissions",
        uid,
        params={
            "supportsAllDrives": "true",
            "fields": "permissions(id,type,role,emailAddress,displayName,domain,deleted)",
        },
    )
    return data


@router.post("/sync/drive-share/{item_id}")
async def create_drive_share(item_id: str, payload: DriveSharePayload, request: Request):
    """Chia sẻ file/thư mục Drive với email/domain/công khai."""
    uid = _get_uid(request)
    if payload.item_id != item_id:
        raise HTTPException(status_code=400, detail="item_id không khớp")
    body: dict[str, Any] = {
        "type": payload.type,
        "role": payload.role,
    }
    if payload.type in ("user", "group"):
        if not payload.email:
            raise HTTPException(status_code=400, detail="Cần email cho type=user hoặc type=group")
        body["emailAddress"] = payload.email
    elif payload.type == "domain":
        if not payload.domain:
            raise HTTPException(status_code=400, detail="Cần domain cho type=domain")
        body["domain"] = payload.domain
    result = await _drive_permission_request(
        "POST", payload.account_id,
        f"{DRIVE_API}/files/{item_id}/permissions",
        uid,
        params={
            "supportsAllDrives": "true",
            "sendNotificationEmail": str(payload.send_notification).lower(),
        },
        json=body,
    )
    return {"status": "shared", "permissionId": result.get("id", ""), "itemId": item_id}


@router.delete("/sync/drive-permissions/{item_id}/{permission_id}")
async def delete_drive_permission(
    item_id: str, permission_id: str,
    account_id: str = Query(...),
    request: Request = None,
):
    """Xoá quyền truy cập của 1 file/thư mục Drive."""
    uid = _get_uid(request)
    await _drive_permission_request(
        "DELETE", account_id,
        f"{DRIVE_API}/files/{item_id}/permissions/{permission_id}",
        uid,
    )
    return {"status": "removed", "permissionId": permission_id}


@router.put("/sync/drive-permissions/{item_id}/{permission_id}")
async def update_drive_permission(
    item_id: str, permission_id: str,
    payload: DrivePermissionUpdate,
    request: Request,
):
    """Cập nhật quyền (role) cho 1 permission."""
    uid = _get_uid(request)
    await _drive_permission_request(
        "PATCH", payload.account_id,
        f"{DRIVE_API}/files/{item_id}/permissions/{permission_id}",
        uid,
        json={"role": payload.role},
    )
    return {"status": "updated", "permissionId": permission_id}


@router.get("/sync/maps")
async def list_backup_maps(request: Request):
    uid = _get_uid(request)
    return {"maps": drive_sync.list_maps(uid)}


@router.post("/sync/maps")
async def create_backup_map(payload: BackupMapPayload, request: Request):
    uid = _get_uid(request)
    source_paths = _normalize_map_sources(payload.source_paths, payload.source_path)
    if not source_paths:
        raise HTTPException(status_code=400, detail="Thiếu thư mục nguồn")
    if not payload.account_ids:
        raise HTTPException(status_code=400, detail="Cần chọn ít nhất 1 tài khoản")
    if payload.run_now:
        missing = [path for path in source_paths if not Path(path).expanduser().exists()]
        if missing:
            raise HTTPException(status_code=404, detail=f"Thư mục nguồn không tồn tại: {missing[0]}")
    placeholders = ",".join("?" * len(payload.account_ids))
    with get_connection() as conn:
        rows = conn.execute(
            f"SELECT id FROM google_accounts WHERE user_id = ? AND id IN ({placeholders})",
            (uid, *payload.account_ids),
        ).fetchall()
    owned_account_ids = {row["id"] for row in rows}
    account_ids = [account_id for account_id in payload.account_ids if account_id in owned_account_ids]
    if not account_ids:
        raise HTTPException(status_code=400, detail="Không tìm thấy tài khoản hợp lệ")
    name = payload.name.strip() or Path(source_paths[0]).name or "Backup"
    enabled_val = -1 if payload.is_transient else (1 if payload.enabled else 0)
    backup_map = drive_sync.create_map(
        uid,
        name,
        source_paths[0],
        account_ids,
        enabled_val,
        payload.dest_folder,
        payload.delete_source_after_sync,
        source_paths,
        payload.dest_folders,
        payload.schedule_interval,
    )
    if not payload.run_now:
        return backup_map
    job = drive_sync.start_sync_for_map(backup_map, trigger="drop")
    if not job:
        raise HTTPException(status_code=400, detail="Không có tài khoản hợp lệ trong map")
    return {"map": backup_map, "job": _public_job(job)}


@router.put("/sync/maps/{map_id}")
async def update_backup_map(map_id: str, payload: BackupMapUpdate, request: Request):
    uid = _get_uid(request)
    current = drive_sync.get_map(map_id, uid)
    if not current:
        raise HTTPException(status_code=404, detail="Không tìm thấy map")
    source_paths = None
    if payload.source_paths is not None or payload.source_path is not None:
        source_paths = _normalize_map_sources(payload.source_paths, payload.source_path)
        if not source_paths:
            raise HTTPException(status_code=400, detail="Map cần ít nhất 1 thư mục nguồn")
    return drive_sync.update_map(
        map_id, uid,
        name=payload.name, source_path=payload.source_path, dest_folder=payload.dest_folder,
        dest_folders=payload.dest_folders,
        account_ids=payload.account_ids, enabled=payload.enabled,
        delete_source_after_sync=payload.delete_source_after_sync,
        source_paths=source_paths,
        schedule_interval=payload.schedule_interval,
    )


@router.delete("/sync/maps/{map_id}")
async def delete_backup_map(map_id: str, request: Request):
    uid = _get_uid(request)
    if not drive_sync.delete_map(map_id, uid):
        raise HTTPException(status_code=404, detail="Không tìm thấy map")
    return {"ok": True}


@router.post("/sync/maps/{map_id}/run")
async def run_backup_map(map_id: str, request: Request):
    uid = _get_uid(request)
    m = drive_sync.get_map(map_id, uid)
    if not m:
        raise HTTPException(status_code=404, detail="Không tìm thấy map")
    missing = [path for path in (m.get("source_paths") or [m["source_path"]]) if not Path(path).expanduser().exists()]
    if missing:
        raise HTTPException(status_code=404, detail=f"Thư mục nguồn không tồn tại: {missing[0]}")
    job = drive_sync.start_sync_for_map(m, trigger="manual")
    if not job:
        raise HTTPException(status_code=400, detail="Không có tài khoản hợp lệ trong map")
    return _public_job(job)


@router.get("/sync/maps/{map_id}/runs")
async def list_backup_map_runs(map_id: str, request: Request):
    uid = _get_uid(request)
    if not drive_sync.get_map(map_id, uid):
        raise HTTPException(status_code=404, detail="Không tìm thấy map")
    return {"runs": drive_sync.list_runs(map_id)}


@router.delete("/sync/runs/{run_id}")
async def delete_backup_run(run_id: str, request: Request):
    """Xoá 1 lượt sao lưu khỏi lịch sử (cả bản DB lẫn job còn trong bộ nhớ).

    Idempotent: nếu lượt sao lưu đã biến mất (vd job ad-hoc bị xoá sau restart)
    vẫn trả ok để UI gỡ card khỏi danh sách thay vì báo lỗi.
    """
    uid = _get_uid(request)
    removed_db = drive_sync.delete_run(run_id, uid)
    # Ad-hoc sync không có run_id riêng → frontend gửi luôn job id.
    removed_mem = drive_sync.forget_job(job_id=run_id, run_id=run_id)
    return {"ok": True, "deleted": removed_db or removed_mem}


@router.delete("/sync/maps/{map_id}/runs")
async def delete_backup_map_runs(map_id: str, request: Request):
    """Xoá toàn bộ lịch sử runs của 1 map (giữ nguyên map)."""
    uid = _get_uid(request)
    if not drive_sync.get_map(map_id, uid):
        raise HTTPException(status_code=404, detail="Không tìm thấy map")
    deleted = drive_sync.delete_runs_for_map(map_id, uid)
    return {"ok": True, "deleted": deleted}


@router.delete("/sync/runs")
async def delete_all_backup_runs(request: Request):
    """Xoá toàn bộ lịch sử sao lưu của user (giữ nguyên các map)."""
    uid = _get_uid(request)
    deleted = drive_sync.delete_all_history(uid)
    deleted += drive_sync.forget_finished_jobs()
    return {"ok": True, "deleted": deleted}
