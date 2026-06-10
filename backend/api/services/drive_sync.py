"""Drive Sync Service - đồng bộ ổ di động lên nhiều tài khoản Google Drive."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import tempfile
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional

import httpx

from api.services.google_credential_store import load_google_credential

logger = logging.getLogger(__name__)

TOKEN_URL = "https://oauth2.googleapis.com/token"
FAMILY_SHARED_100_GB_LIMIT = 100 * 1024 ** 3

def quota_group_for_limit(limit: int) -> str:
    """Các account 100 GB của chủ hệ thống dùng chung một Google One family pool."""
    tolerance = 1024 ** 3
    return "family-100gb" if abs(int(limit or 0) - FAMILY_SHARED_100_GB_LIMIT) <= tolerance else ""
DRIVE_API = "https://www.googleapis.com/drive/v3"
DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3"
DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder"
DRIVE_SHORTCUT_MIME = "application/vnd.google-apps.shortcut"
GOOGLE_EXPORTS = {
    "application/vnd.google-apps.document": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".docx",
    ),
    "application/vnd.google-apps.spreadsheet": (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".xlsx",
    ),
    "application/vnd.google-apps.presentation": (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".pptx",
    ),
    "application/vnd.google-apps.drawing": ("application/pdf", ".pdf"),
}

_JOBS: Dict[str, Dict[str, Any]] = {}
_JOBS_LOCK = threading.Lock()
INTERRUPTED_RUN_ERROR = (
    "Tiến trình sao lưu bị gián đoạn trước khi hoàn tất "
    "(service đã khởi động lại hoặc thread nền đã dừng)."
)
LOCAL_EXCLUDED_DIRS = {
    ".git",
    ".next",
    ".venv",
    "__pycache__",
    "dist",
    "node_modules",
    "venv",
}
LOCAL_EXCLUDED_FILE_NAMES = {".DS_Store", ".npmrc"}
LOCAL_EXCLUDED_SUFFIXES = {".pyc"}
UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024

# ---------------------------------------------------------------------------
# Token helpers & Cache
# ---------------------------------------------------------------------------

_ACCESS_TOKEN_CACHE: Dict[str, tuple[str, float]] = {}
_QUOTA_CACHE: Dict[str, tuple[Dict[str, Any], float]] = {}

async def _refresh_token(token_path: str, *, force: bool = False) -> str:
    now = time.time()
    if not force and token_path in _ACCESS_TOKEN_CACHE:
        access_token, expires_at = _ACCESS_TOKEN_CACHE[token_path]
        if expires_at - now > 300:  # Token còn hạn ít nhất 5 phút
            return access_token

    data = load_google_credential(token_path)
    if not (data.get("refresh_token") and data.get("client_id") and data.get("client_secret")):
        raise ValueError(f"Token file thiếu thông tin: {token_path}")
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(TOKEN_URL, data={
            "client_id": data["client_id"],
            "client_secret": data["client_secret"],
            "refresh_token": data["refresh_token"],
            "grant_type": "refresh_token",
        })
    r.raise_for_status()
    res_data = r.json()
    access_token = res_data["access_token"]
    expires_in = res_data.get("expires_in", 3600)
    _ACCESS_TOKEN_CACHE[token_path] = (access_token, now + expires_in)
    return access_token

async def get_account_quota(token_path: str) -> Dict[str, Any]:
    """Trả về {used, limit, free} bytes cho một tài khoản."""
    now = time.time()
    if token_path in _QUOTA_CACHE:
        cached_quota, expires_at = _QUOTA_CACHE[token_path]
        if expires_at > now:
            return cached_quota

    try:
        token = await _refresh_token(token_path)
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.get(
                f"{DRIVE_API}/about",
                headers={"Authorization": f"Bearer {token}"},
                params={"fields": "storageQuota"},
            )
        r.raise_for_status()
        q = r.json().get("storageQuota", {})
        used = int(q.get("usage", 0))
        limit = int(q.get("limit", 15 * 1024 ** 3))
        res = {"used": used, "limit": limit, "free": max(0, limit - used)}
        _QUOTA_CACHE[token_path] = (res, now + 30)  # Cache trong 30 giây
        return res
    except Exception as e:
        return {"used": 0, "limit": 15 * 1024 ** 3, "free": 15 * 1024 ** 3, "error": str(e)}

# ---------------------------------------------------------------------------
# Upload helpers (single account)
# ---------------------------------------------------------------------------

def _drive_q_escape(name: str) -> str:
    return name.replace("\\", "\\\\").replace("'", "\\'")

async def _find_folder(token: str, name: str, parent_id: str) -> Optional[str]:
    """Tìm folder con theo tên (None nếu chưa có)."""
    q = (
        f"name = '{_drive_q_escape(name)}' and '{parent_id}' in parents "
        "and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    )
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(
            f"{DRIVE_API}/files",
            headers={"Authorization": f"Bearer {token}"},
            params={"q": q, "fields": "files(id)", "pageSize": 1},
        )
    r.raise_for_status()
    files = r.json().get("files", [])
    return files[0]["id"] if files else None

async def _create_folder(token: str, name: str, parent_id: str) -> str:
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(
            f"{DRIVE_API}/files",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"name": name, "mimeType": "application/vnd.google-apps.folder",
                  "parents": [parent_id]},
        )
    r.raise_for_status()
    return r.json()["id"]

async def _find_or_create_folder(token: str, name: str, parent_id: str) -> str:
    """Trả id folder con — tái dùng nếu đã tồn tại (giúp incremental qua nhiều ngày)."""
    found = await _find_folder(token, name, parent_id)
    return found or await _create_folder(token, name, parent_id)

async def list_drive_folders(token_path: str, parent_id: str = "root") -> List[Dict[str, str]]:
    """Liệt kê các thư mục con trên Drive của 1 account (để browse chọn đích)."""
    items = await list_drive_items(token_path, parent_id)
    return [{"id": item["id"], "name": item["name"]} for item in items if item["type"] == "folder"]

async def list_drive_items(token_path: str, parent_id: str = "root") -> List[Dict[str, Any]]:
    """Liệt kê thư mục và tệp con để duyệt, kéo thả và tải xuống."""
    token = await _refresh_token(token_path)
    q = f"'{parent_id}' in parents and trashed = false"
    items: List[Dict[str, Any]] = []
    page_token = None
    async with httpx.AsyncClient(timeout=30) as c:
        while True:
            params = {
                "q": q,
                "fields": "nextPageToken, files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink,thumbnailLink,shortcutDetails)",
                "orderBy": "folder,name",
                "pageSize": 1000,
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
                "corpora": "allDrives",
            }
            if page_token:
                params["pageToken"] = page_token
            r = await c.get(
                f"{DRIVE_API}/files",
                headers={"Authorization": f"Bearer {token}"},
                params=params,
            )
            r.raise_for_status()
            data = r.json()
            for item in data.get("files", []):
                items.append({
                    "id": item["id"],
                    "name": item["name"],
                    "mimeType": item.get("mimeType", ""),
                    "type": "folder" if item.get("mimeType") == DRIVE_FOLDER_MIME else "file",
                    "size": int(item.get("size") or 0),
                    "modifiedTime": item.get("modifiedTime", ""),
                    "webViewLink": item.get("webViewLink", ""),
                    "iconLink": item.get("iconLink", ""),
                    "thumbnailLink": item.get("thumbnailLink", ""),
                    "shortcutDetails": item.get("shortcutDetails") or {},
                })
            page_token = data.get("nextPageToken")
            if not page_token:
                break
    return items

async def create_drive_folder(token_path: str, name: str, parent_id: str = "root") -> Dict[str, str]:
    """Tạo (hoặc tái dùng) thư mục con trên Drive, trả {id, name}."""
    token = await _refresh_token(token_path)
    fid = await _find_or_create_folder(token, name.strip(), parent_id)
    return {"id": fid, "name": name.strip()}

async def rename_drive_folder(token_path: str, folder_id: str, name: str) -> Dict[str, str]:
    """Đổi tên một mục Drive."""
    token = await _refresh_token(token_path)
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.patch(
            f"{DRIVE_API}/files/{folder_id}",
            headers={"Authorization": f"Bearer {token}"},
            params={"supportsAllDrives": "true", "fields": "id,name"},
            json={"name": name.strip()},
        )
    response.raise_for_status()
    data = response.json()
    return {"id": data["id"], "name": data["name"]}

async def trash_drive_item(token_path: str, item_id: str, empty_trash: bool = True, permanent: bool = False) -> Dict[str, Any]:
    """Chuyển một tệp hoặc thư mục Drive vào thùng rác, rồi có thể dọn thùng rác."""
    token = await _refresh_token(token_path)
    async with httpx.AsyncClient(timeout=30) as client:
        if permanent:
            response = await client.delete(
                f"{DRIVE_API}/files/{item_id}",
                headers={"Authorization": f"Bearer {token}"},
                params={"supportsAllDrives": "true"},
            )
            if response.status_code not in (204, 404):
                response.raise_for_status()
            return {"id": item_id, "name": "", "trashed": False, "deleted": True, "trash_emptied": False, "trash_error": ""}
        response = await client.patch(
            f"{DRIVE_API}/files/{item_id}",
            headers={"Authorization": f"Bearer {token}"},
            params={"supportsAllDrives": "true", "fields": "id,name,trashed"},
            json={"trashed": True},
        )
        response.raise_for_status()
        result = response.json()
        trash_emptied = False
        trash_error = ""
        if empty_trash:
            try:
                trash_response = await client.delete(f"{DRIVE_API}/files/trash", headers={"Authorization": f"Bearer {token}"})
                trash_response.raise_for_status()
                trash_emptied = True
            except Exception as exc:
                trash_error = str(exc)
    return {**result, "trash_emptied": trash_emptied, "trash_error": trash_error}


async def delete_drive_item_permanently(token_path: str, item_id: str) -> Dict[str, Any]:
    """Xoá vĩnh viễn một mục Drive, không đưa vào Trash."""
    token = await _refresh_token(token_path)
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.delete(
            f"{DRIVE_API}/files/{item_id}",
            headers={"Authorization": f"Bearer {token}"},
            params={"supportsAllDrives": "true"},
        )
        if response.status_code not in (204, 404):
            response.raise_for_status()
    return {"id": item_id, "deleted": True}

async def delete_drive_target_and_empty_trash(
    token_path: str,
    folder_id: str = "root",
) -> Dict[str, Any]:
    """Xóa vĩnh viễn thư mục hiện tại (hoặc mọi mục ở root), rồi dọn thùng rác."""
    token = await _refresh_token(token_path)
    headers = {"Authorization": f"Bearer {token}"}
    target_id = (folder_id or "root").strip() or "root"
    targets: List[Dict[str, str]] = []
    errors: List[str] = []
    trash_error = ""

    async with httpx.AsyncClient(timeout=120) as client:
        if target_id == "root":
            page_token = None
            while True:
                params = {
                    "q": "'root' in parents and trashed = false",
                    "fields": "nextPageToken, files(id,name,mimeType)",
                    "pageSize": 1000,
                }
                if page_token:
                    params["pageToken"] = page_token
                response = await client.get(
                    f"{DRIVE_API}/files",
                    headers=headers,
                    params=params,
                )
                response.raise_for_status()
                data = response.json()
                targets.extend(data.get("files", []))
                page_token = data.get("nextPageToken")
                if not page_token:
                    break
        else:
            targets.append({"id": target_id, "name": target_id})

        deleted = 0
        for target in targets:
            try:
                response = await client.delete(
                    f"{DRIVE_API}/files/{target['id']}",
                    headers=headers,
                    params={"supportsAllDrives": "true"},
                )
                response.raise_for_status()
                deleted += 1
            except Exception as exc:
                errors.append(f"{target.get('name') or target['id']}: {exc}")

        trash_emptied = False
        try:
            response = await client.delete(f"{DRIVE_API}/files/trash", headers=headers)
            response.raise_for_status()
            trash_emptied = True
        except Exception as exc:
            trash_error = str(exc)

    return {
        "deleted": deleted,
        "failed": len(errors),
        "errors": errors[:20],
        "trash_emptied": trash_emptied,
        "trash_error": trash_error,
        "target": target_id,
    }

def _safe_download_name(name: str) -> str:
    safe = (name or "Drive item").replace("/", "_").replace("\0", "").strip()
    return safe if safe not in {"", ".", ".."} else "Drive item"

def _available_download_path(path: Path) -> Path:
    if not path.exists():
        return path
    for index in range(1, 10000):
        candidate = path.with_name(f"{path.stem} ({index}){path.suffix}")
        if not candidate.exists():
            return candidate
    raise RuntimeError(f"Không tìm được tên trống cho {path.name}")

async def download_drive_item(
    token_path: str,
    item_id: str,
    destination_path: str,
    job: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """Tải một tệp hoặc cả cây thư mục Drive xuống thư mục Local."""
    destination = Path(destination_path).expanduser()
    if not destination.exists() or not destination.is_dir():
        raise ValueError("Thư mục Local đích không tồn tại")

    token = await _refresh_token(token_path)
    headers = {"Authorization": f"Bearer {token}"}
    stats: Dict[str, Any] = {"files": 0, "folders": 0, "bytes": 0, "skipped": 0, "errors": []}
    capture_manifest = bool(job and job.get("type") == "move")
    source_manifest: Dict[str, str] = {}
    if capture_manifest and job is not None:
        job["source_manifest"] = source_manifest

    def sync_job() -> None:
        if not job:
            return
        job["files_done"] = stats["files"]
        job["files_processed"] = stats["files"] + stats["skipped"]
        job["bytes_done"] = stats["bytes"]
        job["skipped"] = stats["skipped"]
        job["errors"] = stats["errors"]
        job["folders_done"] = stats["folders"]

    async with httpx.AsyncClient(timeout=600) as client:
        async def metadata(file_id: str) -> Dict[str, Any]:
            response = await client.get(
                f"{DRIVE_API}/files/{file_id}",
                headers=headers,
                params={"supportsAllDrives": "true", "fields": "id,name,mimeType,size,shortcutDetails"},
            )
            response.raise_for_status()
            return response.json()

        async def children(folder_id: str) -> List[Dict[str, Any]]:
            result: List[Dict[str, Any]] = []
            page_token = None
            while True:
                params = {
                    "q": f"'{folder_id}' in parents and trashed = false",
                    "fields": "nextPageToken, files(id,name,mimeType,size,shortcutDetails)",
                    "orderBy": "folder,name",
                    "pageSize": 1000,
                    "supportsAllDrives": "true",
                    "includeItemsFromAllDrives": "true",
                    "corpora": "allDrives",
                }
                if page_token:
                    params["pageToken"] = page_token
                response = await client.get(f"{DRIVE_API}/files", headers=headers, params=params)
                response.raise_for_status()
                data = response.json()
                result.extend(data.get("files", []))
                page_token = data.get("nextPageToken")
                if not page_token:
                    return result

        async def write_response(response: httpx.Response, target: Path) -> None:
            response.raise_for_status()
            with target.open("wb") as output:
                async for chunk in response.aiter_bytes():
                    output.write(chunk)
                    stats["bytes"] += len(chunk)
                    sync_job()

        async def download(
            item: Dict[str, Any],
            parent: Path,
            rel: str = "",
            seen: set[str] | None = None,
            record_self: bool = True,
            record_children: bool = True,
            source_id: str = "",
        ) -> None:
            if job and job.get("status") == "cancelled":
                return
            seen = seen or set()
            source_id = source_id or item.get("id", "")
            name = _safe_download_name(item.get("name", "Drive item"))
            rel_name = f"{rel}/{name}".strip("/")
            mime_type = item.get("mimeType", "")
            if mime_type == DRIVE_SHORTCUT_MIME:
                shortcut = item.get("shortcutDetails") or {}
                target_id = shortcut.get("targetId")
                if not target_id:
                    stats["skipped"] += 1
                    stats["errors"].append(f"{name}: shortcut không có target")
                    return
                if target_id in seen:
                    stats["skipped"] += 1
                    stats["errors"].append(f"{name}: shortcut lặp")
                    return
                target = await metadata(target_id)
                target["name"] = item.get("name") or target.get("name") or name
                await download(
                    target,
                    parent,
                    rel,
                    seen | {target_id},
                    record_self=record_self,
                    record_children=False,
                    source_id=source_id,
                )
                return
            if mime_type == DRIVE_FOLDER_MIME:
                folder = _available_download_path(parent / name)
                folder.mkdir(parents=True, exist_ok=False)
                if capture_manifest and record_self:
                    source_manifest[str(folder)] = source_id
                stats["folders"] += 1
                if job:
                    job["current_file"] = f"Đọc thư mục: {rel_name}"
                    job["log"].append(f"↳ {rel_name}: đang đọc")
                    sync_job()
                child_items = await children(item["id"])
                if job:
                    job["folders_total"] = max(int(job.get("folders_total") or 0), stats["folders"])
                    job["log"].append(f"↳ {rel_name}: {len(child_items)} mục")
                for child in child_items:
                    try:
                        await download(child, folder, rel_name, seen, record_children, record_children)
                    except Exception as exc:
                        stats["skipped"] += 1
                        stats["errors"].append(f"{child.get('name', child['id'])}: {exc}")
                        sync_job()
                return

            export = GOOGLE_EXPORTS.get(mime_type)
            if mime_type.startswith("application/vnd.google-apps.") and not export:
                stats["skipped"] += 1
                stats["errors"].append(f"{name}: định dạng Google chưa hỗ trợ xuất")
                sync_job()
                return
            if job:
                job["files_total"] += 1
                job["current_file"] = rel_name
                size = int(item.get("size") or 0)
                if size > 0:
                    job["bytes_total"] += size
            if export:
                export_mime, extension = export
                target = _available_download_path(parent / f"{name}{extension}")
                async with client.stream(
                    "GET",
                    f"{DRIVE_API}/files/{item['id']}/export",
                    headers=headers,
                    params={"mimeType": export_mime},
                ) as response:
                    await write_response(response, target)
            else:
                target = _available_download_path(parent / name)
                async with client.stream(
                    "GET",
                    f"{DRIVE_API}/files/{item['id']}",
                    headers=headers,
                    params={"alt": "media", "supportsAllDrives": "true"},
                ) as response:
                    await write_response(response, target)
            if capture_manifest and record_self:
                source_manifest[str(target)] = source_id
            stats["files"] += 1
            sync_job()

        root_item = await metadata(item_id)
        if job:
            if job.get("type") != "move":
                job["title"] = f"Tải {root_item.get('name', 'Drive')} xuống Local"
            job["source"] = root_item.get("name", job.get("source", "Google Drive"))
        await download(root_item, destination)
        if root_item.get("mimeType") == DRIVE_FOLDER_MIME and stats["folders"] > 0 and stats["files"] == 0 and not stats["errors"]:
            stats["errors"].append("Google Drive trả thư mục không có file con. Có thể thư mục rỗng, file nằm ở shortcut khác, hoặc tài khoản không có quyền đọc nội dung.")
            sync_job()

    return {
        **stats,
        "destination": str(destination),
        "item_name": root_item.get("name", ""),
        "source_manifest": source_manifest if capture_manifest else {},
    }

def start_drive_download(account_id: str, token_path: str, item_id: str, destination_path: str) -> Dict[str, Any]:
    job = _new_job(f"drive:{item_id}", [account_id], [token_path])
    job.update({
        "type": "download",
        "direction": "download",
        "item_id": item_id,
        "destination": destination_path,
        "title": "Tải Drive xuống Local",
        "folders_total": 0,
        "folders_done": 0,
    })

    async def _run_download() -> None:
        job["status"] = "running"
        try:
            result = await download_drive_item(token_path, item_id, destination_path, job)
            job["download"] = result
            if job["status"] != "cancelled":
                job["status"] = "error" if result.get("errors") and result.get("files", 0) == 0 else "done"
        except Exception as exc:
            job["status"] = "error"
            job["errors"].append(str(exc))
        finally:
            job["finished_at"] = time.time()
            job["current_file"] = ""

    def _run():
        asyncio.run(_run_download())

    threading.Thread(target=_run, daemon=True).start()
    return job

async def _upload_local_tree(token: str, source: Path, parent_id: str,
                             job: Dict[str, Any] | None = None,
                             token_path: str = "") -> Dict[str, Any]:
    stats: Dict[str, Any] = {"files": 0, "folders": 0, "bytes": 0}
    baseline_done = int(job.get("files_done", 0)) if job else 0
    baseline_processed = int(job.get("files_processed", 0)) if job else 0
    baseline_bytes = int(job.get("bytes_done", 0)) if job else 0
    async def refresh_upload_token() -> str:
        nonlocal token
        if token_path:
            token = await _refresh_token(token_path, force=True)
        return token
    async def cleanup_source(path: Path) -> None:
        if not job:
            return
        source_token_path = str(job.get("source_token_path") or "").strip()
        source_manifest = job.get("source_manifest") or {}
        source_id = source_manifest.get(str(path))
        if not source_token_path or not source_id:
            return
        try:
            await delete_drive_item_permanently(source_token_path, source_id)
        except Exception as exc:
            message = f"{path.name}: xoá nguồn thất bại: {exc}"
            job["errors"].append(message)
            job["log"].append(f"✗ {message}")
    async def upload(path: Path, parent: str) -> Dict[str, Any]:
        if job and job.get("status") == "cancelled":
            return {"id": "", "name": path.name, "type": "cancelled"}
        if path.is_dir():
            try:
                folder_id = await _find_or_create_folder(token, path.name, parent)
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code != 401 or not token_path:
                    raise
                folder_id = await _find_or_create_folder(await refresh_upload_token(), path.name, parent)
            stats["folders"] += 1
            if job:
                job["current_file"] = f"↑ {path.name}/"
                job["folders_done"] = int(job.get("folders_done") or 0) + 1
            for child in sorted(path.iterdir()):
                await upload(child, folder_id)
            if not job or job.get("status") != "cancelled":
                await cleanup_source(path)
            return {"id": folder_id, "name": path.name, "type": "folder"}
        if job:
            job["current_file"] = f"↑ {path.name}"
        uploaded_result = await _upload_file(token, path, parent, refresh_token=refresh_upload_token if token_path else None)
        file_size = path.stat().st_size
        stats["files"] += 1
        stats["bytes"] += file_size
        if job:
            job["files_done"] = baseline_done + stats["files"]
            job["files_processed"] = baseline_processed + stats["files"]
            job["bytes_done"] = baseline_bytes + stats["bytes"]
        if not job or job.get("status") != "cancelled":
            await cleanup_source(path)
        return {"id": uploaded_result.get("id", ""), "name": path.name, "type": "file"}

    root = await upload(source, parent_id)
    return {**stats, "root": root}

async def move_drive_item_between_accounts(
    source_token_path: str,
    target_token_path: str,
    item_id: str,
    target_parent_id: str = "root",
    job: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """Di chuyển trong cùng Drive, hoặc copy-xác minh-trash khi khác tài khoản."""
    target_parent = (target_parent_id or "root").strip() or "root"
    if source_token_path == target_token_path:
        token = await _refresh_token(source_token_path)
        headers = {"Authorization": f"Bearer {token}"}
        async with httpx.AsyncClient(timeout=60) as client:
            metadata = await client.get(
                f"{DRIVE_API}/files/{item_id}",
                headers=headers,
                params={"supportsAllDrives": "true", "fields": "id,name,parents"},
            )
            metadata.raise_for_status()
            item = metadata.json()
            parents = item.get("parents") or []
            if target_parent in parents:
                return {
                    "mode": "same-account",
                    "moved": False,
                    "name": item.get("name", ""),
                    "message": "Mục đã nằm trong thư mục đích",
                }
            params = {
                "supportsAllDrives": "true",
                "addParents": target_parent,
                "fields": "id,name,parents",
            }
            if parents:
                params["removeParents"] = ",".join(parents)
            response = await client.patch(
                f"{DRIVE_API}/files/{item_id}",
                headers=headers,
                params=params,
            )
            response.raise_for_status()
            moved = response.json()
        return {
            "mode": "same-account",
            "moved": True,
            "source_trashed": False,
            "name": moved.get("name", ""),
            "target_id": moved.get("id", ""),
        }

    saved_title = job.get("title", "") if job else ""
    with tempfile.TemporaryDirectory(prefix="hagent-drive-move-") as temporary:
        if job:
            job["phase"] = "download"
            job["current_file"] = "↓ Đang tải xuống từ nguồn..."
        download = await download_drive_item(source_token_path, item_id, temporary, job)
        # Khôi phục title (download_drive_item ghi đè)
        if job and saved_title:
            job["title"] = saved_title
        if download.get("skipped") or download.get("errors"):
            raise RuntimeError(
                "Không xóa nguồn vì có mục không tải được: "
                + "; ".join(download.get("errors", [])[:5])
            )
        local_items = list(Path(temporary).iterdir())
        if len(local_items) != 1:
            raise RuntimeError("Không xác định được mục gốc sau khi tải tạm")

        # Gấp đôi files_total cho phase upload (download xong ~50%, upload tiếp ~100%)
        if job:
            download_files = int(job.get("files_total", 0))
            download_bytes = int(job.get("bytes_total", 0))
            job["files_total"] = download_files * 2
            job["bytes_total"] = download_bytes * 2
            job["phase"] = "upload"
            job["current_file"] = "↑ Đang chuẩn bị tải lên tài khoản đích..."

        if job:
            job["source_token_path"] = source_token_path
            job["source_manifest"] = download.get("source_manifest") or job.get("source_manifest") or {}
        target_token = await _refresh_token(target_token_path)
        upload = await _upload_local_tree(target_token, local_items[0], target_parent, job, target_token_path)
        if job:
            job.pop("source_token_path", None)
            job.pop("source_manifest", None)

    return {
        "mode": "cross-account",
        "moved": True,
        "copy_completed": True,
        "source_deleted": True,
        "name": download.get("item_name", ""),
        "download": download,
        "upload": upload,
    }

async def _list_remote_index(token: str, folder_id: str) -> Dict[str, Dict[str, Any]]:
    """Trả index file theo tên, giữ mọi bản trùng tên để so đúng theo size."""
    index: Dict[str, Dict[str, Any]] = {}
    page_token = None
    q = f"'{folder_id}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'"
    async with httpx.AsyncClient(timeout=60) as c:
        while True:
            params = {
                "q": q,
                "fields": "nextPageToken, files(id,name,size)",
                "pageSize": 1000,
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
                "corpora": "allDrives",
            }
            if page_token:
                params["pageToken"] = page_token
            r = await c.get(
                f"{DRIVE_API}/files",
                headers={"Authorization": f"Bearer {token}"},
                params=params,
            )
            r.raise_for_status()
            data = r.json()
            for f in data.get("files", []):
                try:
                    size = int(f.get("size", 0))
                except (ValueError, TypeError):
                    size = -1  # Google-native file (no size) → coi như khác
                item = {"id": f.get("id", ""), "size": size}
                entry = index.setdefault(f["name"], {"items": [], "by_size": {}, "id": "", "size": -1})
                entry["items"].append(item)
                entry["by_size"].setdefault(size, item)
                if not entry["id"]:
                    entry.update(item)
            page_token = data.get("nextPageToken")
            if not page_token:
                break
    return index

def _remote_entry_for_update(remote: Dict[str, Dict[str, Any]], name: str) -> Optional[Dict[str, Any]]:
    entry = remote.get(name)
    if not entry:
        return None
    items = entry.get("items") or []
    return items[0] if items else entry

def _remember_remote_file(remote: Dict[str, Dict[str, Any]], name: str, file_id: str, size: int) -> None:
    item = {"id": file_id, "size": size}
    entry = remote.setdefault(name, {"items": [], "by_size": {}, "id": "", "size": -1})
    existing_items = entry.setdefault("items", [])
    for existing in existing_items:
        if existing.get("id") == file_id:
            existing.update(item)
            for cached_size, cached in list(entry.setdefault("by_size", {}).items()):
                if cached.get("id") == file_id and cached_size != size:
                    entry["by_size"].pop(cached_size, None)
            break
    else:
        existing_items.append(item)
    entry.setdefault("by_size", {})[size] = item
    entry.update(item)

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}

def _is_transient(exc: Exception) -> bool:
    """502/503/504/429/500 hoặc lỗi mạng → đáng thử lại."""
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in _RETRYABLE_STATUS
    return isinstance(exc, (httpx.TransportError, httpx.TimeoutException))

async def _upload_file(
    token: str,
    path: Path,
    parent_id: str,
    file_id: str | None = None,
    progress: Callable[[int], None] | None = None,
    refresh_token: Callable[[], Awaitable[str]] | None = None,
) -> Dict[str, Any]:
    mime, _ = __import__("mimetypes").guess_type(str(path))
    mime = mime or "application/octet-stream"
    size = path.stat().st_size

    async def _file_content():
        sent = 0
        if progress:
            progress(0)
        with path.open("rb") as fh:
            while True:
                chunk = await asyncio.to_thread(fh.read, UPLOAD_CHUNK_BYTES)
                if not chunk:
                    break
                sent += len(chunk)
                if progress:
                    progress(min(sent, size))
                yield chunk

    async def _once() -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=600) as c:
            if file_id:
                r = await c.patch(
                    f"{DRIVE_UPLOAD_API}/files/{file_id}?uploadType=resumable",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "X-Upload-Content-Type": mime,
                        "X-Upload-Content-Length": str(size),
                    },
                )
            else:
                metadata = json.dumps({"name": path.name, "parents": [parent_id]}).encode()
                r = await c.post(
                    f"{DRIVE_UPLOAD_API}/files?uploadType=resumable",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json; charset=UTF-8",
                        "X-Upload-Content-Type": mime,
                        "X-Upload-Content-Length": str(size),
                    },
                    content=metadata,
                )
            r.raise_for_status()
            upload_url = r.headers["Location"]

            r2 = await c.put(
                upload_url,
                content=_file_content(),
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Length": str(size),
                    "Content-Type": mime,
                },
            )
        r2.raise_for_status()
        return r2.json()

    last_exc: Exception | None = None
    for attempt in range(4):  # 1 lần đầu + 3 lần thử lại
        try:
            return await _once()
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            is_unauthorized = isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 401
            if (
                attempt == 3
                or (is_unauthorized and not refresh_token)
                or (not is_unauthorized and not _is_transient(exc))
            ):
                raise
            if is_unauthorized and refresh_token:
                token = await refresh_token()
            await asyncio.sleep(2 ** attempt)  # backoff 1s, 2s, 4s
    raise last_exc  # pragma: no cover

# ---------------------------------------------------------------------------
# Sync job
# ---------------------------------------------------------------------------

def _new_job(source: str, account_ids: List[str], token_paths: List[str],
             dest_folder: str = "", delete_source_after_sync: bool = False,
             source_paths: Optional[List[str]] = None,
             dest_folders: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    normalized_sources = _normalize_source_paths(source_paths, source)
    job: Dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "source": normalized_sources[0] if normalized_sources else source,
        "source_paths": normalized_sources,
        "dest_folder": dest_folder,
        "dest_folders": dest_folders or {},
        "delete_source_after_sync": bool(delete_source_after_sync),
        "source_deleted": False,
        "source_files_trashed": 0,
        "source_delete_error": "",
        "account_ids": account_ids,
        "token_paths": token_paths,
        "status": "pending",   # pending | running | done | cancelled | error
        "files_total": 0,
        "files_processed": 0,
        "files_done": 0,
        "skipped": 0,
        "bytes_total": 0,
        "bytes_done": 0,
        "current_bytes_total": 0,
        "current_bytes_done": 0,
        "current_file": "",
        "current_account": "",
        "errors": [],
        "started_at": time.time(),
        "finished_at": None,
        "log": [],
    }
    with _JOBS_LOCK:
        _JOBS[job["id"]] = job
    return job

def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    with _JOBS_LOCK:
        return _JOBS.get(job_id)

def list_jobs() -> List[Dict[str, Any]]:
    with _JOBS_LOCK:
        return list(_JOBS.values())

def forget_job(job_id: str = "", run_id: str = "") -> bool:
    """Xoá 1 job đã kết thúc khỏi bộ nhớ (theo id hoặc run_id). Bỏ qua job đang chạy."""
    with _JOBS_LOCK:
        for key, job in list(_JOBS.items()):
            if job["status"] in ("pending", "running"):
                continue
            if (job_id and key == job_id) or (run_id and job.get("run_id") == run_id):
                _JOBS.pop(key, None)
                return True
    return False

def forget_finished_jobs() -> int:
    """Xoá toàn bộ job đã kết thúc khỏi bộ nhớ (giữ lại job đang chạy/chờ)."""
    with _JOBS_LOCK:
        stale = [k for k, j in _JOBS.items() if j["status"] not in ("pending", "running")]
        for k in stale:
            _JOBS.pop(k, None)
    return len(stale)

def cancel_job(job_id: str) -> bool:
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
        if job and job["status"] in ("pending", "running"):
            job["status"] = "cancelled"
            return True
    return False

def _skip_local_dir(name: str) -> bool:
    return name in LOCAL_EXCLUDED_DIRS or name.startswith(".Trash")

def _skip_local_file(name: str) -> bool:
    if name.startswith("."):
        if name == ".gitignore":
            return False
        if name == ".env" or name.startswith(".env."):
            return False
        return True
    return (
        name in LOCAL_EXCLUDED_FILE_NAMES
        or name.startswith("._")
        or Path(name).suffix.lower() in LOCAL_EXCLUDED_SUFFIXES
    )

def _collect_files(source: Path) -> List[Path]:
    if source.is_file():
        return [] if _skip_local_file(source.name) else [source]
    files: List[Path] = []
    for root, dirs, names in os.walk(source):
        dirs[:] = [name for name in dirs if not _skip_local_dir(name)]
        current = Path(root)
        for name in names:
            if _skip_local_file(name):
                continue
            path = current / name
            if path.is_file():
                files.append(path)
    return sorted(files)

def _available_trash_path(path: Path) -> Path:
    trash_dir = Path.home() / ".Trash"
    trash_dir.mkdir(parents=True, exist_ok=True)
    candidate = trash_dir / path.name
    if not candidate.exists():
        return candidate
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    for index in range(1, 10000):
        candidate = trash_dir / f"{path.stem} {stamp}-{index}{path.suffix}"
        if not candidate.exists():
            return candidate
    raise RuntimeError(f"Không tìm được tên trống trong Trash cho {path.name}")

def _move_file_to_trash(path: Path) -> Path:
    target = _available_trash_path(path)
    shutil.move(str(path), str(target))
    return target

def _normalize_source_paths(source_paths: Any = None, source_path: str = "") -> List[str]:
    items = source_paths if isinstance(source_paths, list) else []
    if not items and source_path:
        items = [source_path]
    normalized: List[str] = []
    seen: set[str] = set()
    for raw in items:
        value = str(raw or "").strip()
        if not value or value in seen:
            continue
        normalized.append(value)
        seen.add(value)
    return normalized

def _trash_local_source_files(source: Path) -> int:
    """Đưa file nguồn vào Trash; nếu nguồn là thư mục thì giữ thư mục và chỉ đưa file bên trong vào Trash."""
    if not source.exists():
        raise FileNotFoundError(f"Không tìm thấy nguồn: {source}")
    if source.parent == source:
        raise ValueError("Không thể xử lý thư mục gốc")
    if source.is_file():
        _move_file_to_trash(source)
        return 1
    moved = 0
    for file_path in _collect_files(source):
        if file_path.exists():
            _move_file_to_trash(file_path)
            moved += 1
    return moved

async def _run_sync(job: Dict[str, Any]) -> None:
    try:
        job["status"] = "running"
        source_values = _normalize_source_paths(job.get("source_paths"), job.get("source", ""))
        if not source_values:
            job["status"] = "error"
            job["errors"].append("Không có thư mục nguồn nào")
            return
        sources = [Path(path).expanduser() for path in source_values]
        source_batches = [(source, _collect_files(source)) for source in sources]
        job["source_paths"] = [str(source) for source, _ in source_batches]
        job["source"] = job["source_paths"][0]
        job["files_total"] = sum(len(files) for _, files in source_batches)
        job["bytes_total"] = sum(f.stat().st_size for _, files in source_batches for f in files)

        token_paths = job["token_paths"]
        account_ids = job["account_ids"]
        if not token_paths:
            job["status"] = "error"
            job["errors"].append("Không có tài khoản Google nào")
            return

        quotas = await asyncio.gather(*(get_account_quota(tp) for tp in token_paths))
        for q in quotas:
            q["shared_group"] = quota_group_for_limit(q.get("limit", 0))
        quota_group_indexes: Dict[str, List[int]] = {}
        for index, quota in enumerate(quotas):
            group = quota.get("shared_group", "")
            if group:
                quota_group_indexes.setdefault(group, []).append(index)
        for indexes in quota_group_indexes.values():
            shared_free = min(quotas[index]["free"] for index in indexes)
            for index in indexes:
                quotas[index]["free"] = shared_free
        acc_idx = 0
        multi_source = len(source_batches) > 1
        folder_cache: Dict[str, str] = {}          # cache cây folder: key → drive folder id
        folder_missing_cache: set[str] = set()
        remote_index_cache: Dict[str, Dict[str, Dict[str, Any]]] = {}
        skip_index_cache: Dict[tuple[tuple[str, ...], tuple[str, ...]], Dict[str, set[int]]] = {}
        def source_base_parts_for(source: Path) -> tuple[str, ...]:
            source_dest = (job.get("dest_folders") or {}).get(str(source))
            if source_dest is None:
                source_dest = job.get("dest_folder") or ""
            source_dest = source_dest.strip().strip("/")
            explicit_dest_parts = tuple(p for p in source_dest.split("/") if p) if source_dest else ()
            is_specific_mapping = (job.get("dest_folders") or {}).get(str(source)) is not None
            if explicit_dest_parts:
                if not is_specific_mapping and multi_source and source.is_dir():
                    return (*explicit_dest_parts, source.name)
                return explicit_dest_parts
            return (f"DiDong_Backup_{source.name}",)
        async def token_for(tp: str, *, force: bool = False) -> str:
            return await _refresh_token(tp, force=force)
        async def resolve_parent(token: str, tp: str, base_parts: tuple[str, ...], rel_parts: tuple[str, ...]) -> str:
            key = tp
            cur = "root"
            for part in base_parts:
                key = key + "/" + part
                if key not in folder_cache:
                    folder_cache[key] = await _find_or_create_folder(token, part, cur)
                    folder_missing_cache.discard(key)
                cur = folder_cache[key]
            for part in rel_parts:
                key = key + "/" + part
                if key not in folder_cache:
                    folder_cache[key] = await _find_or_create_folder(token, part, cur)
                    folder_missing_cache.discard(key)
                cur = folder_cache[key]
            return cur
        async def find_parent(token: str, tp: str, base_parts: tuple[str, ...], rel_parts: tuple[str, ...]) -> Optional[str]:
            key = tp
            cur = "root"
            for part in (*base_parts, *rel_parts):
                key = key + "/" + part
                if key in folder_cache:
                    cur = folder_cache[key]
                    continue
                if key in folder_missing_cache:
                    return None
                found = await _find_folder(token, part, cur)
                if not found:
                    folder_missing_cache.add(key)
                    return None
                folder_cache[key] = found
                cur = found
            return cur
        async def remote_index_for_parent(token: str, tp: str, parent_id: str) -> Dict[str, Dict[str, Any]]:
            idx_key = f"{tp}:{parent_id}"
            if idx_key not in remote_index_cache:
                remote_index_cache[idx_key] = await _list_remote_index(token, parent_id)
            return remote_index_cache[idx_key]
        async def load_skip_index(base_parts: tuple[str, ...], rel_parts: tuple[str, ...]) -> Dict[str, set[int]]:
            key = (base_parts, rel_parts)
            index = skip_index_cache.get(key)
            if index is not None:
                return index
            async def load_index(tp_i: str):
                try:
                    token_i = await token_for(tp_i)
                    parent_i = await find_parent(token_i, tp_i, base_parts, rel_parts)
                    return await remote_index_for_parent(token_i, tp_i, parent_i) if parent_i else None
                except Exception:
                    return None
            index = {}
            for index_i in await asyncio.gather(*(load_index(tp_i) for tp_i in token_paths)):
                if not index_i:
                    continue
                for n, entry in index_i.items():
                    index.setdefault(n, set()).update((entry.get("by_size") or {}).keys())
            skip_index_cache[key] = index
            return index
        skip_keys: set[tuple[tuple[str, ...], tuple[str, ...]]] = set()
        for source, files in source_batches:
            source_base_parts = source_base_parts_for(source)
            for f in files:
                skip_keys.add((source_base_parts, f.relative_to(source).parts[:-1] if source.is_dir() else ()))
        if skip_keys:
            await asyncio.gather(*(load_skip_index(base_parts, rel_parts) for base_parts, rel_parts in skip_keys))
        async def already_backed_up(name: str, size: int, base_parts: tuple[str, ...], rel_parts: tuple[str, ...]) -> bool:
            index = await load_skip_index(base_parts, rel_parts)
            return size in index.get(name, set())
        for source, files in source_batches:
            source_base_parts = source_base_parts_for(source)
            for f in files:
                if job["status"] == "cancelled":
                    break
                size = f.stat().st_size
                relative_file = f.relative_to(source) if source.is_dir() else Path(f.name)
                rel_parts = relative_file.parts[:-1] if source.is_dir() else ()
                display_name = str(Path(source.name) / relative_file) if multi_source and source.is_dir() else str(relative_file)
                job["current_file"] = display_name
                job["current_account"] = ""
                job["current_bytes_total"] = 0
                job["current_bytes_done"] = 0

                if await already_backed_up(f.name, size, source_base_parts, rel_parts):
                    job["skipped"] += 1
                    job["files_processed"] += 1
                    job["log"].append(f"= {display_name} (bỏ qua, không đổi)")
                    continue

                tried = 0
                while tried < len(token_paths):
                    if quotas[acc_idx]["free"] >= size:
                        break
                    acc_idx = (acc_idx + 1) % len(token_paths)
                    tried += 1
                else:
                    job["skipped"] += 1
                    job["files_processed"] += 1
                    job["log"].append(f"= {display_name} (bỏ qua, hết dung lượng)")
                    continue

                tp = token_paths[acc_idx]
                acc_id = account_ids[acc_idx]
                job["current_account"] = acc_id
                job["current_bytes_total"] = size
                job["current_bytes_done"] = 0

                def update_current_bytes(sent: int) -> None:
                    job["current_bytes_done"] = min(size, max(0, int(sent or 0)))

                try:
                    token = await token_for(tp)
                    parent_id = await resolve_parent(token, tp, source_base_parts, rel_parts)
                    remote = await remote_index_for_parent(token, tp, parent_id)
                    existing = _remote_entry_for_update(remote, f.name)
                    existing_id = existing.get("id") if existing else ""

                    if existing_id:
                        await _upload_file(
                            token,
                            f,
                            parent_id,
                            file_id=existing_id,
                            progress=update_current_bytes,
                            refresh_token=lambda tp=tp: token_for(tp, force=True),
                        )
                        job["log"].append(f"↻ {display_name} → {acc_id} (ghi đè)")
                        new_id = existing_id
                    else:
                        created = await _upload_file(
                            token,
                            f,
                            parent_id,
                            progress=update_current_bytes,
                            refresh_token=lambda tp=tp: token_for(tp, force=True),
                        )
                        new_id = created.get("id", "") if isinstance(created, dict) else ""
                        job["log"].append(f"✓ {display_name} → {acc_id}")
                    _remember_remote_file(remote, f.name, new_id, size)
                    if (skip_key := (source_base_parts, rel_parts)) in skip_index_cache:
                        skip_index_cache[skip_key].setdefault(f.name, set()).add(size)
                    remaining = max(0, quotas[acc_idx]["free"] - size)
                    shared_group = quotas[acc_idx].get("shared_group", "")
                    shared_indexes = quota_group_indexes.get(shared_group, [acc_idx])
                    for index in shared_indexes:
                        quotas[index]["free"] = remaining
                    job["bytes_done"] += size
                    job["files_done"] += 1
                    job["files_processed"] += 1
                    job["current_bytes_total"] = 0
                    job["current_bytes_done"] = 0
                except Exception as e:
                    job["errors"].append(f"{display_name}: {e}")
                    job["log"].append(f"✗ {display_name}: {e}")
                    job["files_processed"] += 1
                    job["current_bytes_total"] = 0
                    job["current_bytes_done"] = 0
            if job["status"] == "cancelled":
                break

        job["status"] = "done" if job["status"] != "cancelled" else "cancelled"
        if job["status"] == "done" and job.get("delete_source_after_sync") and not job["errors"]:
            try:
                moved = 0
                for source, _ in source_batches:
                    moved += await asyncio.to_thread(_trash_local_source_files, source)
                job["source_deleted"] = False
                job["source_files_trashed"] = moved
                job["log"].append(f"✓ Đã chuyển {moved} file gốc vào Trash cho {len(source_batches)} nguồn")
            except Exception as exc:
                message = f"Chuyển file gốc vào Trash thất bại: {exc}"
                job["source_delete_error"] = str(exc)
                job["errors"].append(message)
                job["log"].append(f"✗ {message}")
                job["status"] = "error"
    except Exception as exc:
        if job.get("status") != "cancelled":
            job["status"] = "error"
        message = f"Đồng bộ thất bại: {exc}"
        job["errors"].append(message)
        job["log"].append(f"✗ {message}")
        logger.exception("drive sync job failed: %s", job.get("id"))
    finally:
        job["finished_at"] = time.time()
        job["current_file"] = ""
        job["current_bytes_total"] = 0
        job["current_bytes_done"] = 0
        # Callback ghi DB khi job từ map
        cb = job.get("_on_finish")
        if cb:
            try:
                cb(job)
            except Exception as e:
                logger.warning("drive backup on_finish callback failed: %s", e)

def start_sync(source: str, account_ids: List[str], token_paths: List[str],
               dest_folder: str = "", delete_source_after_sync: bool = False,
               source_paths: Optional[List[str]] = None,
               dest_folders: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    job = _new_job(source, account_ids, token_paths, dest_folder, delete_source_after_sync, source_paths, dest_folders)

    def _run():
        asyncio.run(_run_sync(job))

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return job

# ===========================================================================
# Backup Maps (gmail ↔ thư mục) + lịch sử + scheduler — lưu DB hagent.db
# ===========================================================================

def _conn():
    from api.services.db import get_connection
    return get_connection()

def _latest_run_for_map(conn, map_id: str):
    return conn.execute(
        """
        SELECT status, files_done, bytes_done, skipped,
               COALESCE(NULLIF(finished_at, ''), NULLIF(started_at, '')) AS run_at
        FROM drive_backup_runs
        WHERE map_id = ?
        ORDER BY COALESCE(NULLIF(finished_at, ''), NULLIF(started_at, '')) DESC
        LIMIT 1
        """,
        (map_id,),
    ).fetchone()

def _sync_map_last_from_runs(conn, map_id: str) -> None:
    latest = _latest_run_for_map(conn, map_id)
    if latest:
        conn.execute(
            """UPDATE drive_backup_maps SET last_run_at = ?, last_status = ?,
               last_files = ?, last_bytes = ?, last_skipped = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (
                latest["run_at"] or "",
                latest["status"] or "",
                int(latest["files_done"] or 0),
                int(latest["bytes_done"] or 0),
                int(latest["skipped"] or 0),
                map_id,
            ),
        )
        return
    conn.execute(
        """UPDATE drive_backup_maps SET last_run_at = '', last_status = '',
           last_files = 0, last_bytes = 0, last_skipped = 0,
           updated_at = CURRENT_TIMESTAMP
           WHERE id = ?""",
        (map_id,),
    )

def _decode_errors(raw: str | None) -> list[str]:
    try:
        data = json.loads(raw or "[]")
    except Exception:
        return []
    return data if isinstance(data, list) else []

def _mark_interrupted_active_runs(
    conn,
    user_id: str | None = None,
    live_run_ids: set[str] | None = None,
) -> int:
    live_run_ids = {rid for rid in (live_run_ids or set()) if rid}
    where = ["r.status IN ('pending', 'running')"]
    params: list[Any] = []
    if user_id:
        where.append("m.user_id = ?")
        params.append(user_id)
    if live_run_ids:
        placeholders = ",".join("?" for _ in live_run_ids)
        where.append(f"r.id NOT IN ({placeholders})")
        params.extend(sorted(live_run_ids))

    rows = conn.execute(
        f"""
        SELECT r.id, r.map_id, r.errors_json
        FROM drive_backup_runs AS r
        JOIN drive_backup_maps AS m ON m.id = r.map_id
        WHERE {' AND '.join(where)}
        """,
        params,
    ).fetchall()
    if not rows:
        return 0

    finished = datetime.now().isoformat()
    map_ids: set[str] = set()
    for row in rows:
        errors = _decode_errors(row["errors_json"])
        if INTERRUPTED_RUN_ERROR not in errors:
            errors.append(INTERRUPTED_RUN_ERROR)
        conn.execute(
            """UPDATE drive_backup_runs
               SET status = 'error',
                   errors_json = ?,
                   finished_at = COALESCE(NULLIF(finished_at, ''), ?)
               WHERE id = ?""",
            (json.dumps(errors[:50], ensure_ascii=False), finished, row["id"]),
        )
        map_ids.add(row["map_id"])
    for map_id in map_ids:
        _sync_map_last_from_runs(conn, map_id)
    return len(rows)

def mark_interrupted_active_runs(
    user_id: str | None = None,
    live_run_ids: set[str] | None = None,
) -> int:
    """Đánh dấu các run pending/running không còn job sống là lỗi.

    Backup chạy trong thread nền; khi service restart hoặc thread chết trước
    callback ghi DB, lịch sử sẽ còn status pending/running mãi nếu không dọn.
    """
    with _conn() as conn:
        return _mark_interrupted_active_runs(conn, user_id, live_run_ids)

def _backfill_missing_runs_from_map_last(conn) -> None:
    rows = conn.execute(
        """
        SELECT id, last_status, last_files, last_bytes, last_skipped, last_run_at
        FROM drive_backup_maps AS m
        WHERE COALESCE(last_run_at, '') != ''
          AND NOT EXISTS (
              SELECT 1 FROM drive_backup_runs AS r WHERE r.map_id = m.id
          )
        """
    ).fetchall()
    for row in rows:
        run_id = f"legacy-{row['id']}"
        run_at = row["last_run_at"] or ""
        conn.execute(
            """INSERT OR IGNORE INTO drive_backup_runs
               (id, map_id, trigger, status, files_done, bytes_done, skipped, errors_json, started_at, finished_at)
               VALUES (?, ?, 'legacy', ?, ?, ?, ?, '[]', ?, ?)""",
            (
                run_id,
                row["id"],
                row["last_status"] or "done",
                int(row["last_files"] or 0),
                int(row["last_bytes"] or 0),
                int(row["last_skipped"] or 0),
                run_at,
                run_at,
            ),
        )

def init_backup_tables() -> None:
    """Tạo 2 bảng nếu chưa có. Gọi từ init_db()."""
    with _conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS drive_backup_maps (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL DEFAULT '',
                source_path TEXT NOT NULL,
                source_paths_json TEXT NOT NULL DEFAULT '[]',
                dest_folder TEXT NOT NULL DEFAULT '',
                dest_folders_json TEXT NOT NULL DEFAULT '{}',
                account_ids_json TEXT NOT NULL DEFAULT '[]',
                enabled INTEGER NOT NULL DEFAULT 1,
                delete_source_after_sync INTEGER NOT NULL DEFAULT 0,
                schedule_interval TEXT NOT NULL DEFAULT 'daily_2',
                last_run_at TEXT DEFAULT '',
                last_status TEXT DEFAULT '',
                last_files INTEGER DEFAULT 0,
                last_bytes INTEGER DEFAULT 0,
                last_skipped INTEGER DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS drive_backup_runs (
                id TEXT PRIMARY KEY,
                map_id TEXT NOT NULL,
                trigger TEXT NOT NULL DEFAULT 'manual',
                status TEXT NOT NULL DEFAULT '',
                files_done INTEGER DEFAULT 0,
                bytes_done INTEGER DEFAULT 0,
                skipped INTEGER DEFAULT 0,
                errors_json TEXT DEFAULT '[]',
                started_at TEXT DEFAULT '',
                finished_at TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_backup_runs_map ON drive_backup_runs(map_id);
            """
        )
        # Migrate: thêm cột dest_folder cho DB đã tạo bảng trước đó
        cols = {r[1] for r in conn.execute("PRAGMA table_info(drive_backup_maps)").fetchall()}
        if "source_paths_json" not in cols:
            conn.execute("ALTER TABLE drive_backup_maps ADD COLUMN source_paths_json TEXT NOT NULL DEFAULT '[]'")
        if "dest_folder" not in cols:
            conn.execute("ALTER TABLE drive_backup_maps ADD COLUMN dest_folder TEXT NOT NULL DEFAULT ''")
        if "delete_source_after_sync" not in cols:
            conn.execute("ALTER TABLE drive_backup_maps ADD COLUMN delete_source_after_sync INTEGER NOT NULL DEFAULT 0")
        if "dest_folders_json" not in cols:
            conn.execute("ALTER TABLE drive_backup_maps ADD COLUMN dest_folders_json TEXT NOT NULL DEFAULT '{}'")
        if "schedule_interval" not in cols:
            conn.execute("ALTER TABLE drive_backup_maps ADD COLUMN schedule_interval TEXT NOT NULL DEFAULT 'daily_2'")
        _backfill_missing_runs_from_map_last(conn)
        _mark_interrupted_active_runs(conn)

def _map_dict(row) -> Dict[str, Any]:
    try:
        account_ids = json.loads(row["account_ids_json"] or "[]")
    except Exception:
        account_ids = []
    try:
        raw_source_paths = json.loads(row["source_paths_json"] or "[]") if "source_paths_json" in row.keys() else []
    except Exception:
        raw_source_paths = []
    source_paths = _normalize_source_paths(raw_source_paths, row["source_path"])
    try:
        dest_folders = json.loads(row["dest_folders_json"] or "{}") if "dest_folders_json" in row.keys() else {}
    except Exception:
        dest_folders = {}
    return {
        "id": row["id"],
        "name": row["name"],
        "source_path": source_paths[0] if source_paths else row["source_path"],
        "source_paths": source_paths,
        "dest_folder": (row["dest_folder"] if "dest_folder" in row.keys() else "") or "",
        "dest_folders": dest_folders,
        "account_ids": account_ids,
        "enabled": bool(row["enabled"]),
        "delete_source_after_sync": bool(row["delete_source_after_sync"]) if "delete_source_after_sync" in row.keys() else False,
        "schedule_interval": row["schedule_interval"] if "schedule_interval" in row.keys() else "daily_2",
        "last_run_at": row["last_run_at"],
        "last_status": row["last_status"],
        "last_files": row["last_files"],
        "last_bytes": row["last_bytes"],
        "last_skipped": row["last_skipped"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }

def list_maps(user_id: str) -> List[Dict[str, Any]]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM drive_backup_maps WHERE user_id = ? AND enabled >= 0 ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
        emails = {r["id"]: r["email"] for r in conn.execute(
            "SELECT id, email FROM google_accounts WHERE user_id = ?", (user_id,)
        ).fetchall()}
    result = []
    for row in rows:
        d = _map_dict(row)
        d["account_emails"] = [emails.get(a, a) for a in d["account_ids"]]
        result.append(d)
    return result

def get_map(map_id: str, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    with _conn() as conn:
        if user_id:
            row = conn.execute(
                "SELECT * FROM drive_backup_maps WHERE id = ? AND user_id = ?", (map_id, user_id)
            ).fetchone()
        else:
            row = conn.execute("SELECT * FROM drive_backup_maps WHERE id = ?", (map_id,)).fetchone()
    return _map_dict(row) if row else None

def create_map(user_id: str, name: str, source_path: str, account_ids: List[str],
               enabled: bool = True, dest_folder: str = "",
               delete_source_after_sync: bool = False,
               source_paths: Optional[List[str]] = None,
               dest_folders: Optional[Dict[str, str]] = None,
               schedule_interval: str = "daily_2") -> Dict[str, Any]:
    normalized_sources = _normalize_source_paths(source_paths, source_path)
    primary_source = normalized_sources[0] if normalized_sources else source_path.strip()
    mid = str(uuid.uuid4())
    dest_folders_val = dest_folders or {}
    with _conn() as conn:
        conn.execute(
            """INSERT INTO drive_backup_maps
               (id, user_id, name, source_path, source_paths_json, dest_folder, dest_folders_json, account_ids_json, enabled, delete_source_after_sync, schedule_interval)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (mid, user_id, name.strip(), primary_source, json.dumps(normalized_sources, ensure_ascii=False), (dest_folder or "").strip(),
             json.dumps(dest_folders_val, ensure_ascii=False),
             json.dumps(account_ids, ensure_ascii=False), int(enabled),
             1 if delete_source_after_sync else 0, schedule_interval),
        )
    return get_map(mid, user_id)

def update_map(map_id: str, user_id: str, **fields) -> Optional[Dict[str, Any]]:
    sets, vals = [], []
    for key in ("name", "dest_folder", "schedule_interval"):
        value = fields.get(key)
        if value is not None:
            sets.append(f"{key} = ?")
            vals.append(value)
    for key in ("enabled", "delete_source_after_sync"):
        value = fields.get(key)
        if value is not None:
            sets.append(f"{key} = ?")
            vals.append(int(bool(value)))

    normalized_sources = None
    if fields.get("source_paths") is not None:
        normalized_sources = _normalize_source_paths(fields["source_paths"], fields.get("source_path") or "")
    elif fields.get("source_path") is not None:
        normalized_sources = _normalize_source_paths([], fields["source_path"])
    if normalized_sources is not None:
        primary_source = normalized_sources[0] if normalized_sources else ""
        sets.append("source_path = ?")
        vals.append(primary_source)
        sets.append("source_paths_json = ?")
        vals.append(json.dumps(normalized_sources, ensure_ascii=False))
    if "account_ids" in fields and fields["account_ids"] is not None:
        sets.append("account_ids_json = ?")
        vals.append(json.dumps(fields["account_ids"], ensure_ascii=False))
    if "dest_folders" in fields and fields["dest_folders"] is not None:
        sets.append("dest_folders_json = ?")
        vals.append(json.dumps(fields["dest_folders"], ensure_ascii=False))
    if not sets:
        return get_map(map_id, user_id)
    sets.append("updated_at = CURRENT_TIMESTAMP")
    vals += [map_id, user_id]
    with _conn() as conn:
        conn.execute(
            f"UPDATE drive_backup_maps SET {', '.join(sets)} WHERE id = ? AND user_id = ?", vals
        )
    return get_map(map_id, user_id)

def delete_map(map_id: str, user_id: str) -> bool:
    with _conn() as conn:
        cur = conn.execute(
            "DELETE FROM drive_backup_maps WHERE id = ? AND user_id = ?", (map_id, user_id)
        )
        conn.execute("DELETE FROM drive_backup_runs WHERE map_id = ?", (map_id,))
    return cur.rowcount > 0

def list_runs(map_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM drive_backup_runs WHERE map_id = ? ORDER BY started_at DESC LIMIT ?",
            (map_id, limit),
        ).fetchall()
    out = []
    for r in rows:
        try:
            errors = json.loads(r["errors_json"] or "[]")
        except Exception:
            errors = []
        out.append({
            "id": r["id"], "trigger": r["trigger"], "status": r["status"],
            "files_done": r["files_done"], "bytes_done": r["bytes_done"],
            "skipped": r["skipped"], "errors": errors,
            "started_at": r["started_at"], "finished_at": r["finished_at"],
        })
    return out

def list_history_jobs(user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Trả các backup run đã lưu DB theo shape gần giống sync job để UI Lịch sử hiển thị sau restart."""
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT r.*, m.name AS map_name, m.source_path, m.dest_folder, m.account_ids_json
            FROM drive_backup_runs r
            JOIN drive_backup_maps m ON m.id = r.map_id
            WHERE m.user_id = ?
            ORDER BY COALESCE(r.started_at, r.finished_at) DESC
            LIMIT ?
            """,
            (user_id, limit),
        ).fetchall()
    rows = list(reversed(rows))
    jobs: List[Dict[str, Any]] = []
    for row in rows:
        try:
            errors = json.loads(row["errors_json"] or "[]")
        except Exception:
            errors = []
        try:
            account_ids = json.loads(row["account_ids_json"] or "[]")
        except Exception:
            account_ids = []
        files_done = int(row["files_done"] or 0)
        skipped = int(row["skipped"] or 0)
        bytes_done = int(row["bytes_done"] or 0)
        jobs.append({
            "id": f"run-{row['id']}",
            "run_id": row["id"],
            "map_id": row["map_id"],
            "map_name": row["map_name"] or "",
            "title": row["map_name"] or "",
            "trigger": row["trigger"],
            "source": row["source_path"] or "",
            "dest_folder": row["dest_folder"] or "",
            "account_ids": account_ids,
            "status": row["status"] or "done",
            "files_total": files_done + skipped,
            "files_processed": files_done + skipped,
            "files_done": files_done,
            "skipped": skipped,
            "bytes_total": bytes_done,
            "bytes_done": bytes_done,
            "current_file": "",
            "current_account": "",
            "errors": errors,
            "started_at": row["started_at"],
            "finished_at": row["finished_at"],
            "historical": True,
        })
    return jobs

def delete_run(run_id: str, user_id: str) -> bool:
    """Xoá 1 backup run khỏi lịch sử. Verify ownership qua JOIN với maps."""
    if not run_id:
        return False
    with _conn() as conn:
        row = conn.execute(
            """
            SELECT id, map_id
            FROM drive_backup_runs
            WHERE id = ? AND map_id IN (
                SELECT id FROM drive_backup_maps WHERE user_id = ?
            )
            """,
            (run_id, user_id),
        ).fetchone()
        if not row:
            return False
        cur = conn.execute(
            """
            DELETE FROM drive_backup_runs
            WHERE id = ? AND map_id IN (
                SELECT id FROM drive_backup_maps WHERE user_id = ?
            )
            """,
            (run_id, user_id),
        )
        if cur.rowcount > 0:
            _sync_map_last_from_runs(conn, row["map_id"])
    return cur.rowcount > 0

def delete_runs_for_map(map_id: str, user_id: str) -> int:
    """Xoá toàn bộ runs của 1 map (giữ nguyên map). Verify ownership."""
    with _conn() as conn:
        cur = conn.execute(
            """
            DELETE FROM drive_backup_runs
            WHERE map_id = ? AND map_id IN (
                SELECT id FROM drive_backup_maps WHERE user_id = ?
            )
            """,
            (map_id, user_id),
        )
        _sync_map_last_from_runs(conn, map_id)
    return cur.rowcount

def delete_all_history(user_id: str) -> int:
    """Xoá toàn bộ lịch sử runs của user (giữ nguyên maps)."""
    with _conn() as conn:
        map_ids = [
            row["id"]
            for row in conn.execute(
                "SELECT id FROM drive_backup_maps WHERE user_id = ?", (user_id,)
            ).fetchall()
        ]
        cur = conn.execute(
            """
            DELETE FROM drive_backup_runs
            WHERE map_id IN (SELECT id FROM drive_backup_maps WHERE user_id = ?)
            """,
            (user_id,),
        )
        for map_id in map_ids:
            _sync_map_last_from_runs(conn, map_id)
    return cur.rowcount

def start_drive_move_job(
    source_token_path: str,
    target_token_path: str,
    item_id: str,
    target_parent_id: str = "root",
    source_account_id: str = "",
    target_account_id: str = "",
    item_name: str = "",
) -> Dict[str, Any]:
    """Chạy move giữa 2 Gmail trong background, job hiển thị tiến độ."""
    job = _new_job(
        source=item_name or f"drive-move:{item_id}",
        account_ids=[a for a in [source_account_id, target_account_id] if a],
        token_paths=[p for p in [source_token_path, target_token_path] if p],
    )
    job["status"] = "running"
    job["type"] = "move"
    job["phase"] = "download"
    job["title"] = f"Di chuyển: {item_name or item_id}"
    job["current_file"] = f"Đang chuẩn bị di chuyển {item_name or '...'}..."
    job["folders_total"] = 0
    job["folders_done"] = 0

    async def _run():
        try:
            result = await move_drive_item_between_accounts(
                source_token_path, target_token_path, item_id, target_parent_id,
                job=job,
            )
            job["status"] = "done"
            job["current_file"] = ""
            job["log"].append(f"Di chuyển thành công: {result.get('name', '')}")
        except Exception as exc:
            job["status"] = "error"
            job["current_file"] = ""
            job["errors"].append(str(exc))
        finally:
            job["finished_at"] = time.time()

    threading.Thread(target=lambda: asyncio.run(_run()), daemon=True).start()
    return job

def _token_paths_for(account_ids: List[str]) -> tuple[List[str], List[str]]:
    """Trả (valid_account_ids, token_paths) theo thứ tự, bỏ account không tìm thấy."""
    ids, paths = [], []
    if not account_ids:
        return ids, paths
    with _conn() as conn:
        placeholders = ",".join("?" * len(account_ids))
        rows = conn.execute(
            f"SELECT id, token_path FROM google_accounts WHERE id IN ({placeholders})",
            account_ids,
        ).fetchall()
    by_id = {r["id"]: r["token_path"] for r in rows}
    for a in account_ids:
        if a in by_id:
            ids.append(a)
            paths.append(by_id[a])
    return ids, paths

def start_sync_for_map(map_row: Dict[str, Any], trigger: str = "manual") -> Optional[Dict[str, Any]]:
    """Khởi chạy sync cho 1 map; ghi lịch sử + cập nhật last_* khi xong."""
    account_ids, token_paths = _token_paths_for(map_row.get("account_ids", []))
    if not token_paths:
        return None

    map_id = map_row["id"]
    run_id = str(uuid.uuid4())
    job = _new_job(
        map_row["source_path"],
        account_ids,
        token_paths,
        map_row.get("dest_folder", ""),
        map_row.get("delete_source_after_sync", False),
        map_row.get("source_paths"),
        map_row.get("dest_folders"),
    )
    job["map_id"] = map_id
    job["map_name"] = map_row.get("name", "")
    job["title"] = map_row.get("name", "")
    job["trigger"] = trigger
    job["run_id"] = run_id
    started = datetime.fromtimestamp(job["started_at"]).isoformat()
    with _conn() as conn:
        conn.execute(
            """INSERT INTO drive_backup_runs
               (id, map_id, trigger, status, files_done, bytes_done, skipped, errors_json, started_at, finished_at)
               VALUES (?, ?, ?, ?, 0, 0, 0, '[]', ?, '')""",
            (run_id, map_id, trigger, job["status"], started),
        )
        conn.execute(
            """UPDATE drive_backup_maps SET last_run_at = ?, last_status = ?,
               last_files = 0, last_bytes = 0, last_skipped = 0, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (started, job["status"], map_id),
        )

    def _on_finish(j: Dict[str, Any]) -> None:
        started = datetime.fromtimestamp(j["started_at"]).isoformat()
        finished = datetime.fromtimestamp(j["finished_at"] or time.time()).isoformat()
        with _conn() as conn:
            cur = conn.execute(
                """UPDATE drive_backup_runs
                   SET status = ?, files_done = ?, bytes_done = ?, skipped = ?,
                       errors_json = ?, started_at = ?, finished_at = ?
                   WHERE id = ?""",
                (
                    j["status"],
                    j["files_done"],
                    j["bytes_done"],
                    j["skipped"],
                    json.dumps(j["errors"][:50], ensure_ascii=False),
                    started,
                    finished,
                    run_id,
                ),
            )
            if cur.rowcount == 0:
                conn.execute(
                    """INSERT INTO drive_backup_runs
                       (id, map_id, trigger, status, files_done, bytes_done, skipped, errors_json, started_at, finished_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (run_id, map_id, trigger, j["status"], j["files_done"], j["bytes_done"],
                     j["skipped"], json.dumps(j["errors"][:50], ensure_ascii=False), started, finished),
                )
            conn.execute(
                """UPDATE drive_backup_maps SET last_run_at = ?, last_status = ?,
                   last_files = ?, last_bytes = ?, last_skipped = ?, updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (finished, j["status"], j["files_done"], j["bytes_done"], j["skipped"], map_id),
            )

    job["_on_finish"] = _on_finish

    def _run():
        asyncio.run(_run_sync(job))

    threading.Thread(target=_run, daemon=True).start()
    return job

# ── Scheduler: tự chạy theo chu kỳ linh hoạt ───────────────────────────────

_scheduler_started = False

def _should_run_map(row, now: datetime) -> bool:
    interval = row["schedule_interval"] if "schedule_interval" in row.keys() else "daily_2"
    last_run = row["last_run_at"] or ""

    # helper timestamps
    current_hour_str = now.strftime("%Y-%m-%d %H")
    current_date_str = now.strftime("%Y-%m-%d")

    if interval == "hourly":
        return not last_run.startswith(current_hour_str)

    elif interval == "every_2h":
        if now.hour % 2 == 0:
            return not last_run.startswith(current_hour_str)
        return False

    elif interval == "every_4h":
        if now.hour % 4 == 0:
            return not last_run.startswith(current_hour_str)
        return False

    elif interval.startswith("daily_"):
        try:
            target_hour = int(interval.split("_")[1])
        except Exception:
            target_hour = 2
        if now.hour == target_hour:
            return not last_run.startswith(current_date_str)
        return False

    elif interval.startswith("weekly_"):
        parts = interval.split("_")
        try:
            target_weekday = int(parts[1])  # 0 = Thứ hai, 6 = Chủ nhật
        except Exception:
            target_weekday = 6
        target_hour = 2
        if len(parts) > 2:
            try:
                target_hour = int(parts[2])
            except Exception:
                pass
        if now.weekday() == target_weekday and now.hour == target_hour:
            return not last_run.startswith(current_date_str)
        return False

    # Default daily_2
    if now.hour == 2:
        return not last_run.startswith(current_date_str)
    return False

def _scheduler_loop() -> None:
    while True:
        try:
            now = datetime.now()
            with _conn() as conn:
                rows = conn.execute(
                    "SELECT * FROM drive_backup_maps WHERE enabled = 1"
                ).fetchall()
            for row in rows:
                if _should_run_map(row, now):
                    m = _map_dict(row)
                    logger.info("Drive backup scheduled run for map %s (%s, schedule=%s)", m["id"], m["name"], m.get("schedule_interval"))
                    start_sync_for_map(m, trigger="schedule")
        except Exception as e:
            logger.warning("Drive backup scheduler error: %s", e)
        time.sleep(60)  # Kiểm tra mỗi phút để phản hồi chính xác theo giờ

def start_backup_scheduler() -> None:
    global _scheduler_started
    if _scheduler_started:
        return
    _scheduler_started = True
    threading.Thread(target=_scheduler_loop, daemon=True).start()
    logger.info("Drive backup scheduler started with flexible schedule intervals")
