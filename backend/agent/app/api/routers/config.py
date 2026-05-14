from __future__ import annotations

from typing import Any

import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from hermes_constants import get_config_path
from utils import atomic_write_text

router = APIRouter(tags=["config"])


class ConfigUpdate(BaseModel):
    config: dict[str, Any] | None = None
    yaml_text: str | None = None


def _read_config_text() -> str:
    path = get_config_path()
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("{}\n", encoding="utf-8")
    return path.read_text(encoding="utf-8")


def _parse_config(text: str) -> dict[str, Any]:
    try:
        parsed = yaml.safe_load(text) or {}
    except yaml.YAMLError as exc:
        raise HTTPException(status_code=400, detail=f"YAML không hợp lệ: {exc}") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="config.yaml phải là một object YAML")
    return parsed


@router.get("/config")
def get_config() -> dict[str, Any]:
    text = _read_config_text()
    return {
        "path": str(get_config_path()),
        "config": _parse_config(text),
        "yaml": text,
    }


@router.put("/config")
def update_config(payload: ConfigUpdate) -> dict[str, Any]:
    if payload.yaml_text is not None:
        next_text = payload.yaml_text.rstrip() + "\n"
        parsed = _parse_config(next_text)
    elif payload.config is not None:
        parsed = payload.config
        next_text = yaml.safe_dump(
            parsed,
            allow_unicode=True,
            sort_keys=False,
            default_flow_style=False,
        )
    else:
        raise HTTPException(status_code=400, detail="Thiếu config hoặc yaml_text")

    path = get_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_text(path, next_text)
    return {
        "path": str(path),
        "config": parsed,
        "yaml": next_text,
        "message": "Đã lưu cấu hình",
    }
