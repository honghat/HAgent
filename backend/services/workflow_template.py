"""ComfyUI workflow template loader.

Đọc file JSON từ backend/data/workflows/, thay placeholder ${var} bằng giá trị
runtime, trả về dict sẵn sàng POST /prompt. Số nguyên/float được giữ nguyên
type khi placeholder đứng một mình ("${seed}" → int, không phải str)."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

WORKFLOWS_DIR = Path(__file__).resolve().parent.parent / "data" / "workflows"

_PLACEHOLDER_RE = re.compile(r"\$\{(\w+)\}")


def _coerce(raw: Any) -> Any:
    if isinstance(raw, str):
        try:
            if "." in raw or "e" in raw.lower():
                return float(raw)
            return int(raw)
        except (TypeError, ValueError):
            return raw
    return raw


def _substitute(node: Any, params: dict[str, Any]) -> Any:
    if isinstance(node, dict):
        return {k: _substitute(v, params) for k, v in node.items()}
    if isinstance(node, list):
        return [_substitute(v, params) for v in node]
    if isinstance(node, str):
        m = _PLACEHOLDER_RE.fullmatch(node)
        if m:
            key = m.group(1)
            if key in params:
                return _coerce(params[key]) if not isinstance(params[key], (int, float, bool)) else params[key]
            return node
        # multi-token interpolation → string
        def repl(match: re.Match) -> str:
            key = match.group(1)
            return str(params.get(key, match.group(0)))
        return _PLACEHOLDER_RE.sub(repl, node)
    return node


def _read_raw(name: str) -> dict:
    base = Path(os.environ.get("COMFYUI_WORKFLOW_TEMPLATES_DIR") or WORKFLOWS_DIR)
    return json.loads((base / f"{name}.json").read_text(encoding="utf-8"))


def load_workflow(name: str, params: dict[str, Any] | None = None) -> dict:
    """Load full workflow template and substitute placeholders."""
    return _substitute(_read_raw(name), params or {})


def read_meta(name: str) -> dict:
    """Trả về metadata: kind/category/display + (nếu preset) prompt prefix/negative."""
    raw = _read_raw(name)
    if raw.get("_kind") == "preset":
        return {
            "kind": "preset",
            "category": raw.get("_category", "photo"),
            "display": raw.get("_display") or name,
            "positive_prefix": raw.get("positive_prefix", ""),
            "negative": raw.get("negative", ""),
        }
    return {"kind": "template", "category": None, "display": name}


def apply_workflow(name: str, params: dict[str, Any], default_builder) -> dict:
    """Resolve workflow to a ComfyUI dict.

    - Preset (`_kind=preset`): patch params (positive prefix + negative) rồi gọi
      ``default_builder(**params)`` của model đang chọn.
    - Template: substitute placeholders trực tiếp.
    """
    raw = _read_raw(name)
    if raw.get("_kind") == "preset":
        merged = dict(params)
        prefix = (raw.get("positive_prefix") or "").strip()
        if prefix:
            existing = (merged.get("prompt") or "").strip()
            merged["prompt"] = f"{prefix}, {existing}".strip(", ")
        if "negative" in raw:
            merged["neg"] = raw["negative"]
        return default_builder(**merged)
    return _substitute(raw, params or {})


def workflow_path(name: str) -> str:
    """Public-facing relative name dùng để hiện cho user."""
    return f"{name}.json"
