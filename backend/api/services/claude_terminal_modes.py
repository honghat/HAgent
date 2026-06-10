"""Shared Claude Terminal mode settings."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from hagent_constants import get_hagent_home

CLAUDE_MODE_PATH = Path(get_hagent_home()) / "claude_terminal_mode.json"


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def _read_existing() -> dict[str, Any]:
    try:
        if CLAUDE_MODE_PATH.exists():
            data = json.loads(CLAUDE_MODE_PATH.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
    except Exception:
        pass
    return {}


def _existing_api_key() -> str:
    current = _read_existing()
    env = current.get("env")
    if isinstance(env, dict) and isinstance(env.get("ANTHROPIC_API_KEY"), str):
        return env["ANTHROPIC_API_KEY"]
    helper = current.get("apiKeyHelper")
    if isinstance(helper, str) and helper.startswith("echo '") and helper.endswith("'"):
        return helper[6:-1]
    return ""


def _settings(
    mode: str,
    label: str,
    base_url: str,
    model: str,
    api_key: str = "",
) -> dict[str, Any]:
    key = api_key or _existing_api_key() or "xxx"
    return {
        "mode": mode,
        "label": label,
        "env": {
            "ANTHROPIC_API_KEY": key,
            "ANTHROPIC_BASE_URL": base_url,
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
        },
        "permissions": {
            "allow": [],
            "deny": [],
        },
        "apiKeyHelper": f"echo '{key}'",
        "model": model,
    }


def claude_terminal_modes() -> dict[str, dict[str, str]]:
    return {
        "freemodel": {
            "label": "FreeModel",
            "base_url": _env("CLAUDE_FREEMODEL_URL", "https://api-cc.freemodel.dev"),
            "model": _env("CLAUDE_FREEMODEL_MODEL", "sonnet[1m]"),
            "api_key": _env("CLAUDE_FREEMODEL_API_KEY", ""),
        },
        "deepseek": {
            "label": "DeepSeek Proxy",
            "base_url": _env("CLAUDE_DEEPSEEK_URL", "https://api.deepseek.com/anthropic"),
            "model": _env("DEEPSEEK_MODEL", "deepseek-v4-flash"),
            "api_key": _env("DEEPSEEK_API_KEY", ""),
        },
        "ollama": {
            "label": "Ollama Remote",
            "base_url": _env("CLAUDE_OLLAMA_URL", "http://100.69.50.64:11434"),
            "model": _env("CLAUDE_OLLAMA_MODEL", "qwen"),
            "api_key": _env("CLAUDE_OLLAMA_API_KEY", "xxx"),
        },
        "lmstudio": {
            "label": "LM Studio Remote",
            "base_url": _env("CLAUDE_LM_STUDIO_URL", "http://100.69.50.64:1234"),
            "model": _env("CLAUDE_LM_STUDIO_MODEL", "qwen/qwen3.5-9b"),
            "api_key": _env("CLAUDE_LM_STUDIO_API_KEY", "xxx"),
        },
        "llamacpp": {
            "label": "Llama.cpp Remote",
            "base_url": _env("CLAUDE_LLAMACPP_URL", "http://100.69.50.64:8080"),
            "model": _env("CLAUDE_LLAMACPP_MODEL", "google/gemma-4-e4b"),
            "api_key": _env("CLAUDE_LLAMACPP_API_KEY", "xxx"),
        },
        "lmstudio_local": {
            "label": "LM Studio Local",
            "base_url": _env("CLAUDE_LM_STUDIO_LOCAL_URL", "http://localhost:1234"),
            "model": _env("CLAUDE_LM_STUDIO_LOCAL_MODEL", "google/gemma-4-e4b"),
            "api_key": _env("CLAUDE_LM_STUDIO_LOCAL_API_KEY", "xxx"),
        },
        "cx": {
            "label": "9Router",
            "base_url": _env("CLAUDE_CX_URL", ""),
            "model": _env("CLAUDE_CX_MODEL", ""),
            "api_key": _env("CLAUDE_CX_API_KEY", ""),
        },
    }


def read_claude_terminal_mode() -> str:
    current = _read_existing()
    mode = current.get("mode")
    return mode if isinstance(mode, str) and mode else "freemodel"


def read_claude_terminal_settings() -> dict[str, Any]:
    current = _read_existing()
    mode = current.get("mode")
    if isinstance(mode, str) and mode in claude_terminal_modes():
        return current
    return build_claude_terminal_settings("freemodel")


def build_claude_terminal_settings(mode: str) -> dict[str, Any]:
    modes = claude_terminal_modes()
    config = modes.get(mode)
    if not config:
        raise ValueError(f"Invalid Claude Terminal mode: {mode}")
    return _settings(
        mode=mode,
        label=config["label"],
        base_url=config["base_url"],
        model=config["model"],
        api_key=config.get("api_key", ""),
    )


def write_claude_terminal_mode(mode: str) -> dict[str, Any]:
    settings = build_claude_terminal_settings(mode)
    CLAUDE_MODE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CLAUDE_MODE_PATH.write_text(
        json.dumps(settings, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return settings
