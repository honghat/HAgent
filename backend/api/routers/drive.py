from __future__ import annotations

import json
import mimetypes
import os
import tempfile
import zipfile
from datetime import datetime
from fnmatch import fnmatch
from pathlib import Path
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/drive", tags=["drive"])

ROOT_DIR = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT_DIR / "data"
CONFIG_FILE = DATA_DIR / "google_drive.json"
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
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


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


def _zip_path(source: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out_path = Path(tempfile.gettempdir()) / f"{source.name}-{stamp}.zip"
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
        if source.is_file():
            zf.write(source, source.name)
        else:
            for path in source.rglob("*"):
                if not path.is_file() or _should_skip(path, source):
                    continue
                zf.write(path, source.name / path.relative_to(source))
    return out_path


async def _upload_local_file(path: Path, folder_id: str) -> dict[str, Any]:
    parent = await _resolve_folder_id(folder_id or _load_config().get("root_folder_id") or "root")
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
    base = str(request.base_url).rstrip("/").replace("https://", "http://").replace("localhost", "127.0.0.1")
    redirect_uri = base + "/api/drive/auth/callback"
    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        "&response_type=code"
        f"&scope={DRIVE_SCOPE}"
        "&access_type=offline"
        "&prompt=consent"
    )
    return RedirectResponse(auth_url)


@router.get("/auth/callback")
async def drive_callback(code: str = Query(""), request: Request = None):
    if not code:
        return HTMLResponse("<html><body><h2>Lỗi: Không có mã xác thực Google Drive</h2></body></html>")
    config = _load_config()
    client_id = config.get("client_id", "")
    client_secret = config.get("client_secret", "")
    redirect_uri = str(request.base_url).rstrip("/").replace("https://", "http://").replace("localhost", "127.0.0.1") + "/api/drive/auth/callback"
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
    archive: Path | None = None
    try:
        upload_source = source
        if source.is_dir():
            archive = _zip_path(source)
            upload_source = archive
        file_info = await _upload_local_file(upload_source, payload.folder_id.strip())
        return {
            "file": file_info,
            "source": str(source),
            "archived": source.is_dir(),
        }
    finally:
        if archive:
            archive.unlink(missing_ok=True)
