"""ComfyUI workflow file manager.

Quản lý các JSON template trong `backend/data/workflows/` — đây chính là các
workflow mà PhotoTab + AnimateTab nạp khi sinh ảnh/video. Sửa file ở đây sẽ
áp dụng ngay cho lần generate kế tiếp (loader đọc đĩa mỗi lần)."""
from __future__ import annotations

import json
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from pydantic import BaseModel

from api.services.user_store import resolve_user_id
from services.workflow_template import WORKFLOWS_DIR

router = APIRouter(prefix="/api/comfyui/workflows", tags=["comfyui-workflows"])

MAX_UPLOAD_BYTES = 1_048_576  # 1MB
NAME_RE = re.compile(r"^[\w.\-]+\.json$")

USED_BY = {
    "sdxl_lightning_4step.json": "Photo · SDXL-Lightning 4-step",
    "flux_schnell_q4.json": "Photo · Flux.1 Schnell Q4",
    "wan_i2v.json": "Video · Wan 2.1 I2V",
    "animatediff_i2v.json": "Video · AnimateDiff",
}

VIDEO_KEYWORDS = ("i2v", "video", "animate", "wan", "ad_")


def _inspect(path: Path) -> tuple[str, str, str | None]:
    """Returns (kind, category, display). Đọc 1 lần file để lấy meta."""
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        raw = {}
    kind = "preset" if raw.get("_kind") == "preset" else "template"
    cat_meta = raw.get("_category")
    if cat_meta in ("photo", "video", "both"):
        cat = cat_meta
    else:
        low = path.name.lower()
        cat = "video" if any(k in low for k in VIDEO_KEYWORDS) else "photo"
    display = raw.get("_display")
    return kind, cat, display


class WorkflowSaveBody(BaseModel):
    content: str


def _user_id(request: Request) -> str:
    token = request.headers.get("authorization", "").replace("Bearer ", "").strip()
    uid = resolve_user_id(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return uid


def _check_name(name: str) -> None:
    if not NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Tên file không hợp lệ")


def _path_for(name: str) -> Path:
    return WORKFLOWS_DIR / name


@router.get("")
async def list_workflows(request: Request, category: str = ""):
    _user_id(request)
    WORKFLOWS_DIR.mkdir(parents=True, exist_ok=True)
    items = []
    for f in WORKFLOWS_DIR.glob("*.json"):
        st = f.stat()
        kind, cat, display = _inspect(f)
        if category and cat != category and cat != "both":
            continue
        items.append({
            "name": f.name,
            "display": display or f.name,
            "size": st.st_size,
            "mtime": st.st_mtime,
            "category": cat,
            "kind": kind,
            "used_by": USED_BY.get(f.name),
        })
    items.sort(key=lambda x: (USED_BY.get(x["name"]) is None, x["name"]))
    return {"workflows": items, "dir": str(WORKFLOWS_DIR)}


@router.get("/{name}")
async def get_workflow(name: str, request: Request):
    _user_id(request)
    _check_name(name)
    p = _path_for(name)
    if not p.is_file():
        raise HTTPException(status_code=404, detail="Workflow không tồn tại")
    return {"name": name, "content": p.read_text(encoding="utf-8"),
            "used_by": USED_BY.get(name)}


@router.put("/{name}")
async def save_workflow(name: str, body: WorkflowSaveBody, request: Request):
    _user_id(request)
    _check_name(name)
    json_ok = True
    try:
        json.loads(body.content)
    except json.JSONDecodeError:
        json_ok = False
    p = _path_for(name)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(body.content, encoding="utf-8")
    tmp.replace(p)
    return {"ok": True, "json_valid": json_ok, "name": name}


@router.delete("/{name}")
async def delete_workflow(name: str, request: Request):
    _user_id(request)
    _check_name(name)
    if name in USED_BY:
        raise HTTPException(
            status_code=400,
            detail=f"Không thể xoá: workflow đang được dùng cho {USED_BY[name]}",
        )
    p = _path_for(name)
    if p.is_file():
        p.unlink()
    return {"ok": True, "deleted": name}


@router.post("/upload")
async def upload_workflow(request: Request, file: UploadFile = File(...)):
    _user_id(request)
    name = (file.filename or "").strip()
    if not name.lower().endswith(".json"):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file .json")
    _check_name(name)
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File quá lớn (>1MB)")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File không phải UTF-8")
    json_ok = True
    try:
        json.loads(text)
    except json.JSONDecodeError:
        json_ok = False
    p = _path_for(name)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(p)
    return {"ok": True, "json_valid": json_ok, "name": name}
