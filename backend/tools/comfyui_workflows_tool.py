"""Agent tool: liệt kê ComfyUI workflow / preset có sẵn trong
``backend/data/workflows/``. Agent gọi tool này TRƯỚC khi truyền tham số
``workflow`` vào image_generate / image_to_video_*."""
from __future__ import annotations

import json
from pathlib import Path

from .registry import registry
from services.workflow_template import WORKFLOWS_DIR


def _inspect(path: Path) -> dict:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        raw = {}
    kind = "preset" if raw.get("_kind") == "preset" else "template"
    cat = raw.get("_category") if raw.get("_category") in ("photo", "video", "both") else None
    if cat is None:
        low = path.name.lower()
        cat = "video" if any(k in low for k in ("i2v", "video", "animate", "wan", "ad_")) else "photo"
    info: dict = {
        "name": path.name,
        "kind": kind,
        "category": cat,
        "display": raw.get("_display") or path.name,
    }
    if kind == "preset":
        if raw.get("positive_prefix"):
            info["positive_prefix"] = raw["positive_prefix"]
        if raw.get("negative"):
            info["negative"] = raw["negative"]
    return info


def _handle(args, **kw):
    category = (args.get("category") or "").strip().lower()
    items = []
    for f in sorted(WORKFLOWS_DIR.glob("*.json")):
        info = _inspect(f)
        if category and category not in (info["category"], "both") and info["category"] != "both":
            continue
        items.append(info)
    return json.dumps({"workflows": items, "dir": str(WORKFLOWS_DIR)}, ensure_ascii=False)


registry.register(
    name="list_comfyui_workflows",
    toolset="image_gen",
    schema={
        "name": "list_comfyui_workflows",
        "description": (
            "List ComfyUI workflow JSON / preset có sẵn để dùng làm tham số "
            "`workflow` cho `image_generate`, `image_to_video_wan`, "
            "`image_to_video_animatediff`. Preset (kind=preset) thêm prompt "
            "prefix + negative trên model người dùng đang chọn (lý tưởng cho "
            "style như 'người que / stickman'); template (kind=template) "
            "thay toàn bộ workflow. Gọi TRƯỚC khi sinh ảnh/video nếu user "
            "yêu cầu style đặc biệt (stick figure, anime, …)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "enum": ["photo", "video"],
                    "description": "Lọc theo loại. Bỏ qua để liệt kê tất cả.",
                },
            },
            "required": [],
        },
    },
    handler=_handle,
    is_async=False,
    emoji="📜",
)
