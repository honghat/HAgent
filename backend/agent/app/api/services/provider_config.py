from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    type: str
    model: str
    base_url: str | None = None
    api_key: str | None = None


_PROVIDER_CONFIGS: dict[str, ProviderConfig] = {
    "gemini": ProviderConfig(
        name="gemini",
        type="gemini",
        base_url=os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"),
        api_key=os.getenv("GEMINI_API_KEY"),
        model=os.getenv("GEMINI_MODEL", "gemini-2.0-flash"),
    ),
    "deepseek": ProviderConfig(
        name="deepseek",
        type="openai",
        base_url="https://api.deepseek.com/v1",
        api_key=os.getenv("DEEPSEEK_API_KEY"),
        model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
    ),
    "cx": ProviderConfig(
        name="cx",
        type="openai",
        base_url=os.getenv("CX_BASE_URL", "http://localhost:20128/v1"),
        api_key=os.getenv("CX_API_KEY", "cx"),
        model=os.getenv("CX_MODEL", "cx/gpt-5.5"),
    ),
    "openai": ProviderConfig(
        name="openai",
        type="openai",
        base_url=os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1",
        api_key=os.getenv("OPENAI_API_KEY"),
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
    ),
    "anthropic": ProviderConfig(
        name="anthropic",
        type="anthropic",
        base_url=os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com"),
        api_key=os.getenv("ANTHROPIC_API_KEY"),
        model=os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20240620"),
    ),
    "ollama": ProviderConfig(
        name="ollama",
        type="openai",
        base_url=os.getenv("OLLAMA_URL", "http://100.69.50.64:11434/v1"),
        api_key=os.getenv("OLLAMA_API_KEY", "ollama"),
        model=os.getenv("OLLAMA_MODEL", "qwen3.5:4b"),
    ),
    "lmstudio": ProviderConfig(
        name="lmstudio",
        type="openai",
        base_url=os.getenv("LM_STUDIO_URL", "http://100.69.50.64:1234/v1"),
        api_key=os.getenv("LM_STUDIO_API_KEY", "lmstudio"),
        model=os.getenv("LM_STUDIO_MODEL", "qwen/qwen3.5-9b"),
    ),
    "llamacpp": ProviderConfig(
        name="llamacpp",
        type="openai",
        base_url=os.getenv("LLAMACPP_URL", "http://100.69.50.64:8080/v1"),
        api_key=os.getenv("LLAMACPP_API_KEY", "llamacpp"),
        model=os.getenv("LLAMACPP_MODEL", "qwen"),
    ),
    "lmstudio_local": ProviderConfig(
        name="lmstudio",
        type="openai",
        base_url=os.getenv("LM_STUDIO_URL2", "http://localhost:1234/v1"),
        api_key=os.getenv("LM_STUDIO_API_KEY", "lmstudio"),
        model=os.getenv("LM_STUDIO_MODEL_LOCAL", "google/gemma-4-e2b"),
    ),
}


def get_provider_config(provider_name: str | None, model_override: str | None = None) -> ProviderConfig:
    if not provider_name:
        config = _PROVIDER_CONFIGS["lmstudio_local"]
    elif provider_name not in _PROVIDER_CONFIGS:
        raise ValueError(f"Provider không khớp frontend hoặc chưa được cấu hình ở backend: {provider_name}")
    else:
        config = _PROVIDER_CONFIGS[provider_name]

    clean_model = " ".join((model_override or "").split()).strip()
    if clean_model and config.name == "cx":
        return ProviderConfig(
            name=config.name,
            type=config.type,
            base_url=config.base_url,
            api_key=config.api_key,
            model=clean_model,
        )
    return config
