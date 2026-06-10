from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from hagent_constants import get_config_path
from utils import atomic_write_text

router = APIRouter(tags=["config"])
PROJECT_ROOT = Path(__file__).resolve().parents[3]
ENV_PATH = PROJECT_ROOT / ".env"
TELEGRAM_ENV_KEYS = [
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_TERMINAL_BOT_TOKEN",
    "TELEGRAM_HOME_CHANNEL",
    "TELEGRAM_HOME_CHANNEL_THREAD_ID",
    "TELEGRAM_API_ID",
    "TELEGRAM_API_HASH",
]


class ConfigUpdate(BaseModel):
    config: dict[str, Any] | None = None
    yaml_text: str | None = None


class TelegramConfigUpdate(BaseModel):
    bot_token: str | None = None
    terminal_bot_token: str | None = None
    home_channel: str | None = None
    home_channel_thread_id: str | None = None
    api_id: str | None = None
    api_hash: str | None = None


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


def _read_env_map() -> dict[str, str]:
    values: dict[str, str] = {}
    if not ENV_PATH.exists():
        return values
    for raw_line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def _mask_secret(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 10:
        return "••••"
    return f"{value[:6]}••••{value[-4:]}"


def _write_env_values(updates: dict[str, str]) -> None:
    ENV_PATH.parent.mkdir(parents=True, exist_ok=True)
    lines = ENV_PATH.read_text(encoding="utf-8").splitlines() if ENV_PATH.exists() else []
    seen: set[str] = set()
    next_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            next_lines.append(line)
            continue
        key = line.split("=", 1)[0].strip()
        if key in updates:
            next_lines.append(f"{key}={updates[key]}")
            seen.add(key)
        else:
            next_lines.append(line)
    for key in TELEGRAM_ENV_KEYS:
        if key in updates and key not in seen:
            next_lines.append(f"{key}={updates[key]}")
    atomic_write_text(ENV_PATH, "\n".join(next_lines).rstrip() + "\n")
    for key, value in updates.items():
        os.environ[key] = value


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


@router.get("/config/telegram")
def get_telegram_config() -> dict[str, Any]:
    env_file_values = _read_env_map()
    values = {key: env_file_values.get(key) or os.getenv(key, "") for key in TELEGRAM_ENV_KEYS}
    token = values.get("TELEGRAM_BOT_TOKEN", "")
    return {
        "path": str(ENV_PATH),
        "config": {
            "bot_token_masked": _mask_secret(token),
            "bot_id": token.split(":", 1)[0] if ":" in token else "",
            "terminal_bot_token_masked": _mask_secret(values.get("TELEGRAM_TERMINAL_BOT_TOKEN", "")),
            "terminal_bot_id": values.get("TELEGRAM_TERMINAL_BOT_TOKEN", "").split(":", 1)[0] if ":" in values.get("TELEGRAM_TERMINAL_BOT_TOKEN", "") else "",
            "home_channel": values.get("TELEGRAM_HOME_CHANNEL", ""),
            "home_channel_thread_id": values.get("TELEGRAM_HOME_CHANNEL_THREAD_ID", ""),
            "api_id": values.get("TELEGRAM_API_ID", ""),
            "api_hash_masked": _mask_secret(values.get("TELEGRAM_API_HASH", "")),
        },
    }


@router.put("/config/telegram")
def update_telegram_config(payload: TelegramConfigUpdate) -> dict[str, Any]:
    current = _read_env_map()
    updates = {
        "TELEGRAM_BOT_TOKEN": (payload.bot_token if payload.bot_token is not None and payload.bot_token.strip() else current.get("TELEGRAM_BOT_TOKEN", "")),
        "TELEGRAM_TERMINAL_BOT_TOKEN": (payload.terminal_bot_token if payload.terminal_bot_token is not None and payload.terminal_bot_token.strip() else current.get("TELEGRAM_TERMINAL_BOT_TOKEN", "")),
        "TELEGRAM_HOME_CHANNEL": (payload.home_channel if payload.home_channel is not None else current.get("TELEGRAM_HOME_CHANNEL", "")),
        "TELEGRAM_HOME_CHANNEL_THREAD_ID": (payload.home_channel_thread_id if payload.home_channel_thread_id is not None else current.get("TELEGRAM_HOME_CHANNEL_THREAD_ID", "")),
        "TELEGRAM_API_ID": (payload.api_id if payload.api_id is not None else current.get("TELEGRAM_API_ID", "")),
        "TELEGRAM_API_HASH": (payload.api_hash if payload.api_hash is not None and payload.api_hash.strip() else current.get("TELEGRAM_API_HASH", "")),
    }
    updates = {key: str(value).strip() for key, value in updates.items()}
    _write_env_values(updates)
    return {
        "path": str(ENV_PATH),
        "config": {
            "bot_token_masked": _mask_secret(updates["TELEGRAM_BOT_TOKEN"]),
            "bot_id": updates["TELEGRAM_BOT_TOKEN"].split(":", 1)[0] if ":" in updates["TELEGRAM_BOT_TOKEN"] else "",
            "terminal_bot_token_masked": _mask_secret(updates["TELEGRAM_TERMINAL_BOT_TOKEN"]),
            "terminal_bot_id": updates["TELEGRAM_TERMINAL_BOT_TOKEN"].split(":", 1)[0] if ":" in updates["TELEGRAM_TERMINAL_BOT_TOKEN"] else "",
            "home_channel": updates["TELEGRAM_HOME_CHANNEL"],
            "home_channel_thread_id": updates["TELEGRAM_HOME_CHANNEL_THREAD_ID"],
            "api_id": updates["TELEGRAM_API_ID"],
            "api_hash_masked": _mask_secret(updates["TELEGRAM_API_HASH"]),
        },
        "message": "Đã lưu cấu hình Telegram",
    }
