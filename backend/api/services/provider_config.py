from __future__ import annotations

import os
from dataclasses import dataclass
from ipaddress import ip_address
from typing import Any
from urllib.parse import urlparse

# Try to import yaml; fallback to json if not available
try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False
    import json

from hagent_constants import get_config_path, get_env_path


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    type: str
    model: str
    base_url: str | None = None
    api_key: str | None = None
    context_length: int | None = None


_FRONTEND_DEFAULT_MODELS = {
    "deepseek": "deepseek-chat",
    "ollama": "qwen3.5:4b",
    "lmstudio": "qwen/qwen3.5-9b",
    "llamacpp": "qwen",
    "lmstudio_local": "google/gemma-4-e2b",
    "cx": "cx/gpt-5.5",
    "pekpik": "smart-chat",
    "gemini": "gemini-2.0-flash",
    "openai": "gpt-4o-mini",
    "anthropic": "claude-3-5-sonnet",
    "chatgpt2api": "gpt-5-mini",
}


def _read_context_overrides() -> dict[str, Any]:
    try:
        path = get_config_path()
        if not path.exists():
            return {}
        content = path.read_text(encoding="utf-8")
        if HAS_YAML:
            data = yaml.safe_load(content) or {}
        else:
            data = json.loads(content) or {}
        if not isinstance(data, dict):
            return {}
        raw = data.get("model_context_lengths") or data.get("provider_context_lengths") or {}
        return raw if isinstance(raw, dict) else {}
    except Exception:
        return {}


def _as_int(value: Any) -> int | None:
    if value in (None, "") or isinstance(value, bool):
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _env_int(*names: str) -> int | None:
    for name in names:
        parsed = _as_int(os.getenv(name))
        if parsed:
            return parsed
    return None


def _env_value(name: str) -> str | None:
    value = os.getenv(name)
    if value:
        return value
    try:
        path = get_env_path()
        if not path.exists():
            return None
        for raw_line in path.read_text(encoding="utf-8-sig", errors="replace").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, raw_value = line.partition("=")
            if key.strip() == name:
                return raw_value.strip().strip("\"'") or None
    except Exception:
        return None
    return None


def _read_model_config() -> dict[str, Any]:
    try:
        path = get_config_path()
        if not path.exists():
            return {}
        content = path.read_text(encoding="utf-8")
        if HAS_YAML:
            data = yaml.safe_load(content) or {}
        else:
            data = json.loads(content) or {}
        if not isinstance(data, dict):
            return {}
        model_cfg = data.get("model") or {}
        return model_cfg if isinstance(model_cfg, dict) else {}
    except Exception:
        return {}


def _read_named_provider_config(provider_name: str) -> dict[str, Any]:
    try:
        path = get_config_path()
        if not path.exists():
            return {}
        content = path.read_text(encoding="utf-8")
        if HAS_YAML:
            data = yaml.safe_load(content) or {}
        else:
            data = json.loads(content) or {}
        if not isinstance(data, dict):
            return {}
        providers = data.get("providers") or {}
        if not isinstance(providers, dict):
            return {}
        provider_cfg = providers.get(provider_name) or {}
        return provider_cfg if isinstance(provider_cfg, dict) else {}
    except Exception:
        return {}


def _clean_str(value: Any) -> str:
    return str(value or "").strip()


def _base_url_allows_missing_api_key(base_url: str | None) -> bool:
    parsed = urlparse(base_url or "")
    host = (parsed.hostname or "").strip().lower()
    if not host:
        return False
    if host in {"localhost"} or host.endswith(".local"):
        return True
    try:
        return not ip_address(host).is_global
    except ValueError:
        return False


def _frontend_default_model(provider_name: str) -> str:
    return _FRONTEND_DEFAULT_MODELS.get(provider_name, "")


def _stale_default_models(provider_name: str) -> set[str]:
    provider_default = _PROVIDER_CONFIGS.get(provider_name)
    return {
        value
        for value in {
            _clean_str(provider_default.model if provider_default else ""),
            _frontend_default_model(provider_name),
        }
        if value
    }


def _context_length_for(provider: str, model: str, default: int | None = None) -> int | None:
    overrides = _read_context_overrides()
    provider_block = overrides.get(provider)
    if isinstance(provider_block, dict):
        for key in (model, model.lower(), "default"):
            parsed = _as_int(provider_block.get(key))
            if parsed:
                return parsed
    parsed = _as_int(overrides.get(f"{provider}:{model}")) or _as_int(overrides.get(provider))
    if parsed:
        return parsed
    env_provider = provider.upper().replace("-", "_")
    return _env_int(f"HAGENT_CONTEXT_LENGTH_{env_provider}") or default


_PROVIDER_CONFIGS: dict[str, ProviderConfig] = {
    "gemini": ProviderConfig(
        name="gemini",
        type="gemini",
        base_url=os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"),
        api_key=_env_value("GEMINI_API_KEY"),
        model=os.getenv("GEMINI_MODEL", "gemini-2.0-flash"),
    ),
    "pekpik": ProviderConfig(
        name="pekpik",
        type="openai",
        base_url=os.getenv("PEKPIK_BASE_URL", "https://aiapiv2.pekpik.com/v1"),
        api_key=_env_value("PEKPIK_API_KEY"),
        model=os.getenv("PEKPIK_MODEL", "smart-chat"),
        context_length=_context_length_for("pekpik", os.getenv("PEKPIK_MODEL", "smart-chat"), 1_000_000),
    ),
    "deepseek": ProviderConfig(
        name="deepseek",
        type="openai",
        base_url="https://api.deepseek.com/v1",
        api_key=_env_value("DEEPSEEK_API_KEY"),
        model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
        context_length=_context_length_for("deepseek", os.getenv("DEEPSEEK_MODEL", "deepseek-chat"), 1_000_000),
    ),
    "cx": ProviderConfig(
        name="cx",
        type="openai",
        base_url=os.getenv("CX_BASE_URL", "http://localhost:20128/v1"),
        api_key=_env_value("CX_API_KEY") or "cx",
        model=os.getenv("CX_MODEL", "cx/gpt-5.5"),
        context_length=_context_length_for("cx", os.getenv("CX_MODEL", "cx/gpt-5.5"), 1_050_000),
    ),
    "openai": ProviderConfig(
        name="openai",
        type="openai",
        base_url=os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1",
        api_key=_env_value("OPENAI_API_KEY"),
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        context_length=_context_length_for("openai", os.getenv("OPENAI_MODEL", "gpt-4o-mini"), 128_000),
    ),
    "anthropic": ProviderConfig(
        name="anthropic",
        type="anthropic",
        base_url=os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com"),
        api_key=_env_value("ANTHROPIC_API_KEY"),
        model=os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20240620"),
        context_length=_context_length_for("anthropic", os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20240620"), 200_000),
    ),
    "ollama": ProviderConfig(
        name="ollama",
        type="openai",
        base_url=os.getenv("OLLAMA_URL", "http://100.69.50.64:11434/v1"),
        api_key=_env_value("OLLAMA_API_KEY") or "ollama",
        model=os.getenv("OLLAMA_MODEL", "qwen3.5:4b"),
        context_length=_context_length_for("ollama", os.getenv("OLLAMA_MODEL", "qwen3.5:4b"), _env_int("OLLAMA_CONTEXT_LENGTH", "OLLAMA_NUM_CTX") or 32_768),
    ),
    "lmstudio": ProviderConfig(
        name="lmstudio",
        type="openai",
        base_url=os.getenv("LM_STUDIO_URL", "http://100.69.50.64:1234/v1"),
        api_key=_env_value("LM_STUDIO_API_KEY") or "lmstudio",
        model=os.getenv("LM_STUDIO_MODEL", "qwen/qwen3.5-9b"),
        context_length=_context_length_for("lmstudio", os.getenv("LM_STUDIO_MODEL", "qwen/qwen3.5-9b"), _env_int("LM_STUDIO_CONTEXT_LENGTH") or 65_536),
    ),
    "llamacpp": ProviderConfig(
        name="llamacpp",
        type="openai",
        base_url=os.getenv("LLAMACPP_URL", "http://100.69.50.64:8080/v1"),
        api_key=_env_value("LLAMACPP_API_KEY") or "llamacpp",
        model=os.getenv("LLAMACPP_MODEL", "qwen"),
        context_length=_context_length_for("llamacpp", os.getenv("LLAMACPP_MODEL", "qwen"), _env_int("LLAMACPP_CONTEXT_LENGTH") or 8_192),
    ),
    "lmstudio_local": ProviderConfig(
        name="lmstudio",
        type="openai",
        base_url=os.getenv("LM_STUDIO_URL2", "http://localhost:1234/v1"),
        api_key=_env_value("LM_STUDIO_API_KEY") or "lmstudio",
        model=os.getenv("LM_STUDIO_MODEL_LOCAL", "google/gemma-4-e2b"),
        context_length=_context_length_for("lmstudio_local", os.getenv("LM_STUDIO_MODEL_LOCAL", "google/gemma-4-e2b"), _env_int("LM_STUDIO_CONTEXT_LENGTH_LOCAL", "LM_STUDIO_CONTEXT_LENGTH2") or 8_192),
    ),
    "chatgpt2api": ProviderConfig(
        name="chatgpt2api",
        type="openai",
        base_url=os.getenv("CHATGPT2API_BRIDGE_URL", "http://127.0.0.1:8010/api/chat-bridge/v1"),
        api_key=_env_value("CHATGPT2API_AUTH_KEY") or "chatgpt2api",
        model=os.getenv("CHATGPT2API_MODEL", "gpt-5-mini"),
        context_length=_context_length_for("chatgpt2api", os.getenv("CHATGPT2API_MODEL", "gpt-5-mini"), 128_000),
    ),
}


def _provider_from_user_store(provider_name: str) -> ProviderConfig | None:
    """Đồng bộ với /api/auth/providers: lấy BUILTIN_PROVIDERS + api_key user lưu trong DB."""
    try:
        from api.services.user_store import BUILTIN_PROVIDERS, get_connection, DEFAULT_USERNAME
    except Exception:
        return None
    builtin = next((p for p in BUILTIN_PROVIDERS if p.get("name") == provider_name), None)
    base_url = builtin.get("baseURL", "") if builtin else ""
    model = builtin.get("model", "") if builtin else ""
    p_type = builtin.get("type", "openai") if builtin else "openai"
    ctx = builtin.get("contextLength") if builtin else None
    api_key = ""
    try:
        with get_connection() as conn:
            uid_row = conn.execute("SELECT id FROM users WHERE username = ?", (DEFAULT_USERNAME,)).fetchone()
            uid = uid_row["id"] if uid_row else DEFAULT_USERNAME
            row = conn.execute(
                "SELECT base_url, api_key, model, type, context_length FROM custom_providers WHERE user_id = ? AND name = ?",
                (uid, provider_name),
            ).fetchone()
        if row:
            base_url = row["base_url"] or base_url
            model = row["model"] or model
            p_type = row["type"] or p_type
            api_key = row["api_key"] or ""
            if row["context_length"]:
                ctx = row["context_length"]
    except Exception:
        pass
    if not builtin and not api_key and not base_url:
        return None
    return ProviderConfig(
        name=provider_name,
        type=p_type,
        base_url=base_url or None,
        api_key=api_key or None,
        model=model or "",
        context_length=_as_int(ctx),
    )


def get_provider_config(provider_name: str | None, model_override: str | None = None) -> ProviderConfig:
    if not provider_name:
        config = _PROVIDER_CONFIGS["lmstudio"]
    elif provider_name in _PROVIDER_CONFIGS:
        config = _PROVIDER_CONFIGS[provider_name]
    else:
        config = _provider_from_user_store(provider_name)
        if config is None:
            raise ValueError(f"Provider không khớp frontend hoặc chưa được cấu hình ở backend: {provider_name}")

    context_key = provider_name or config.name
    named_provider_cfg = _read_named_provider_config(context_key)
    if named_provider_cfg:
        named_model = (
            _clean_str(named_provider_cfg.get("default_model"))
            or _clean_str(named_provider_cfg.get("model"))
        )
        config = ProviderConfig(
            name=config.name,
            type=_clean_str(named_provider_cfg.get("type")) or config.type,
            base_url=(
                _clean_str(named_provider_cfg.get("base_url"))
                or _clean_str(named_provider_cfg.get("baseURL"))
                or config.base_url
            ),
            api_key=_clean_str(named_provider_cfg.get("api_key")) or config.api_key,
            model=named_model or config.model,
            context_length=(
                _as_int(named_provider_cfg.get("context_length"))
                or _context_length_for(context_key, named_model or config.model, config.context_length)
            ),
        )

    model_cfg = _read_model_config()
    selected_provider = _clean_str(model_cfg.get("provider")).lower()
    config_model = ""
    if selected_provider and selected_provider == context_key and context_key != "pekpik":
        # A named provider block (providers.<name>) is the source of truth for
        # endpoint credentials.  model.base_url/model.api_key are legacy global
        # fields and can be stale after switching providers in the UI.
        base_url = config.base_url if named_provider_cfg else (_clean_str(model_cfg.get("base_url")) or config.base_url)
        api_key = config.api_key if named_provider_cfg else (_clean_str(model_cfg.get("api_key")) or config.api_key)
        if not api_key and _base_url_allows_missing_api_key(base_url):
            api_key = "no-key-required"
        config_model = _clean_str(model_cfg.get("model")) or _clean_str(model_cfg.get("default"))
        context_length = _as_int(model_cfg.get("context_length")) or _context_length_for(
            context_key,
            config_model or config.model,
            config.context_length,
        )
        config = ProviderConfig(
            name=config.name,
            type=config.type,
            base_url=base_url,
            api_key=api_key or None,
            model=config_model or config.model,
            context_length=context_length,
        )

    clean_model = " ".join((model_override or "").split()).strip()
    if config_model and clean_model and clean_model != config_model:
        if clean_model in _stale_default_models(context_key):
            clean_model = ""
    if clean_model and config.type == "openai":
        return ProviderConfig(
            name=config.name,
            type=config.type,
            base_url=config.base_url,
            api_key=config.api_key,
            model=clean_model,
            context_length=_context_length_for(context_key, clean_model, config.context_length),
        )
    return config
