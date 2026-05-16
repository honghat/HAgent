"""Claude Code settings management — writes ~/.claude/settings.json"""

import json
import os
from pathlib import Path

SETTINGS_PATH = os.path.expanduser("~/.claude/settings.json")

CLAUDE_PROXY_CONFIGS = {
    "deepseek": lambda: {
        "model": "opus",
        "env": {
            "ANTHROPIC_BASE_URL": os.environ.get("CLAUDE_DEEPSEEK_URL", "https://api.deepseek.com/anthropic"),
            "ANTHROPIC_API_KEY": os.environ.get("DEEPSEEK_API_KEY", "DEEPSEEK_API_KEY_PLACEHOLDER"),
            "ANTHROPIC_MODEL": os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash"),
            "ANTHROPIC_DEFAULT_OPUS_MODEL": os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash"),
            "ANTHROPIC_DEFAULT_SONNET_MODEL": os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash"),
            "ANTHROPIC_DEFAULT_HAIKU_MODEL": os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash"),
            "ANTHROPIC_AUTH_TOKEN": os.environ.get("DEEPSEEK_API_KEY", "DEEPSEEK_API_KEY_PLACEHOLDER"),
        },
        "apiBaseUrl": os.environ.get("CLAUDE_DEEPSEEK_URL", "https://api.deepseek.com/anthropic"),
    },
    "ollama": lambda: {
        "model": "opus",
        "env": {
            "ANTHROPIC_BASE_URL": os.environ.get("CLAUDE_OLLAMA_URL", "http://100.69.50.64:11434"),
            "ANTHROPIC_API_KEY": "xxx",
            "ANTHROPIC_MODEL": os.environ.get("CLAUDE_OLLAMA_MODEL", "qwen"),
            "ANTHROPIC_DEFAULT_OPUS_MODEL": os.environ.get("CLAUDE_OLLAMA_MODEL", "qwen"),
            "ANTHROPIC_DEFAULT_SONNET_MODEL": os.environ.get("CLAUDE_OLLAMA_MODEL", "qwen"),
            "ANTHROPIC_DEFAULT_HAIKU_MODEL": os.environ.get("CLAUDE_OLLAMA_MODEL", "qwen"),
            "ANTHROPIC_AUTH_TOKEN": "xxx",
        },
        "apiBaseUrl": os.environ.get("CLAUDE_OLLAMA_URL", "http://100.69.50.64:11434"),
    },
    "lmstudio": lambda: {
        "model": "opus",
        "env": {
            "ANTHROPIC_BASE_URL": os.environ.get("CLAUDE_LM_STUDIO_URL", "http://100.69.50.64:1234"),
            "ANTHROPIC_API_KEY": "xxx",
            "ANTHROPIC_MODEL": os.environ.get("CLAUDE_LM_STUDIO_MODEL", "qwen/qwen3.5-9b"),
            "ANTHROPIC_DEFAULT_OPUS_MODEL": os.environ.get("CLAUDE_LM_STUDIO_MODEL", "qwen/qwen3.5-9b"),
            "ANTHROPIC_DEFAULT_SONNET_MODEL": os.environ.get("CLAUDE_LM_STUDIO_MODEL", "qwen/qwen3.5-9b"),
            "ANTHROPIC_DEFAULT_HAIKU_MODEL": os.environ.get("CLAUDE_LM_STUDIO_MODEL", "qwen/qwen3.5-9b"),
            "ANTHROPIC_AUTH_TOKEN": "xxx",
        },
        "apiBaseUrl": os.environ.get("CLAUDE_LM_STUDIO_URL", "http://100.69.50.64:1234"),
    },
    "llamacpp": lambda: {
        "model": "opus",
        "env": {
            "ANTHROPIC_BASE_URL": os.environ.get("CLAUDE_LLAMACPP_URL", "http://100.69.50.64:8080"),
            "ANTHROPIC_API_KEY": "xxx",
            "ANTHROPIC_MODEL": os.environ.get("CLAUDE_LLAMACPP_MODEL", "google/gemma-4-e4b"),
            "ANTHROPIC_DEFAULT_OPUS_MODEL": os.environ.get("CLAUDE_LLAMACPP_MODEL", "google/gemma-4-e4b"),
            "ANTHROPIC_DEFAULT_SONNET_MODEL": os.environ.get("CLAUDE_LLAMACPP_MODEL", "google/gemma-4-e4b"),
            "ANTHROPIC_DEFAULT_HAIKU_MODEL": os.environ.get("CLAUDE_LLAMACPP_MODEL", "google/gemma-4-e4b"),
            "ANTHROPIC_AUTH_TOKEN": "xxx",
        },
        "apiBaseUrl": os.environ.get("CLAUDE_LLAMACPP_URL", "http://100.69.50.64:8080"),
    },
    "lmstudio_local": lambda: {
        "model": "opus",
        "env": {
            "ANTHROPIC_BASE_URL": os.environ.get("CLAUDE_LM_STUDIO_LOCAL_URL", "http://localhost:1234"),
            "ANTHROPIC_API_KEY": "xxx",
            "ANTHROPIC_MODEL": os.environ.get("CLAUDE_LM_STUDIO_LOCAL_MODEL", "google/gemma-4-e4b"),
            "ANTHROPIC_DEFAULT_OPUS_MODEL": os.environ.get("CLAUDE_LM_STUDIO_LOCAL_MODEL", "google/gemma-4-e4b"),
            "ANTHROPIC_DEFAULT_SONNET_MODEL": os.environ.get("CLAUDE_LM_STUDIO_LOCAL_MODEL", "google/gemma-4-e4b"),
            "ANTHROPIC_DEFAULT_HAIKU_MODEL": os.environ.get("CLAUDE_LM_STUDIO_LOCAL_MODEL", "google/gemma-4-e4b"),
            "ANTHROPIC_AUTH_TOKEN": "xxx",
        },
        "apiBaseUrl": os.environ.get("CLAUDE_LM_STUDIO_LOCAL_URL", "http://localhost:1234"),
    },
}


def read_settings_file() -> dict:
    try:
        path = Path(SETTINGS_PATH)
        if path.exists():
            return json.loads(path.read_text("utf-8"))
    except Exception as e:
        print(f"[ClaudeSettings] Error reading: {e}")
    return {}


def write_settings_file(data: dict) -> bool:
    try:
        path = Path(SETTINGS_PATH)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2) + "\n", "utf-8")
        return True
    except Exception as e:
        print(f"[ClaudeSettings] Error writing: {e}")
        return False


def apply_claude_mode(mode: str) -> dict:
    config_fn = CLAUDE_PROXY_CONFIGS.get(mode)
    if not config_fn:
        return {"ok": False, "error": "Invalid mode"}
    config = config_fn()
    current = read_settings_file()
    merged = {**current, **config, "env": {**current.get("env", {}), **config["env"]}}
    merged["hasCompletedOnboarding"] = current.get("hasCompletedOnboarding", True)
    ok = write_settings_file(merged)
    return {"ok": ok, "mode": mode, "label": mode}
