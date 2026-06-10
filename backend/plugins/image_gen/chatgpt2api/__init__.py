"""ChatGPT2API image-gen provider — wrapper mỏng quanh `chatgpt2api_bridge`.

Bridge thực gọi proxy native (basketikun/chatgpt2api) ở 127.0.0.1:3011.
Provider này chỉ map model id ↔ aspect ratio + register vào registry.

Selection precedence (first hit wins):
1. ``CHATGPT2API_IMAGE_MODEL`` env var
2. ``image_gen.chatgpt2api.model`` trong ``config.yaml``
3. ``image_gen.model`` trong ``config.yaml`` (nếu là một trong các id dưới)
4. ``gpt-image-2-medium``
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional, Tuple

from agent.image_gen_provider import (
    DEFAULT_ASPECT_RATIO,
    ImageGenProvider,
    error_response,
    resolve_aspect_ratio,
    success_response,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------

# Map model HAgent dropdown → (proxy model id, quality)
_MODELS: Dict[str, Dict[str, Any]] = {
    "auto": {
        "display": "Auto",
        "proxy_id": "auto",
        "speed": "~30s",
        "strengths": "Để ChatGPT chọn pipeline tối ưu",
        "quality": "medium",
    },
    "gpt-image-2-low": {
        "display": "GPT Image 2 (Low)",
        "proxy_id": "gpt-image-2",
        "speed": "~20s",
        "strengths": "Tạo nhanh để thử ý tưởng",
        "quality": "low",
    },
    "gpt-image-2-medium": {
        "display": "GPT Image 2 (Medium)",
        "proxy_id": "gpt-image-2",
        "speed": "~60s",
        "strengths": "Cân bằng — mặc định",
        "quality": "medium",
    },
    "gpt-image-2-high": {
        "display": "GPT Image 2 (High)",
        "proxy_id": "gpt-image-2",
        "speed": "~3min",
        "strengths": "Chi tiết cao nhất qua proxy",
        "quality": "high",
    },
    "gpt-5": {
        "display": "GPT-5 Image",
        "proxy_id": "gpt-5",
        "speed": "~1min",
        "strengths": "Mới nhất từ OpenAI qua proxy",
        "quality": "medium",
    },
    "gpt-5-1": {
        "display": "GPT-5.1 Image",
        "proxy_id": "gpt-5-1",
        "speed": "~1min",
        "strengths": "GPT-5 series v1",
        "quality": "medium",
    },
    "gpt-5-2": {
        "display": "GPT-5.2 Image",
        "proxy_id": "gpt-5-2",
        "speed": "~1min",
        "strengths": "GPT-5 series v2",
        "quality": "medium",
    },
    "gpt-5-3": {
        "display": "GPT-5.3 Image",
        "proxy_id": "gpt-5-3",
        "speed": "~1min",
        "strengths": "GPT-5 series v3",
        "quality": "medium",
    },
    "gpt-5-3-mini": {
        "display": "GPT-5.3 Mini",
        "proxy_id": "gpt-5-3-mini",
        "speed": "~30s",
        "strengths": "v3 nhẹ hơn",
        "quality": "medium",
    },
    "gpt-5-mini": {
        "display": "GPT-5 Mini",
        "proxy_id": "gpt-5-mini",
        "speed": "~30s",
        "strengths": "GPT-5 nhẹ",
        "quality": "medium",
    },
    "codex-gpt-image-2": {
        "display": "Codex GPT Image 2",
        "proxy_id": "codex-gpt-image-2",
        "speed": "~30s",
        "strengths": "Plus/Team/Pro — Codex drawing workspace",
        "quality": "medium",
    },
}

DEFAULT_MODEL = "gpt-image-2-medium"

_SIZES = {
    "landscape": "1536x1024",
    "square": "1024x1024",
    "portrait": "1024x1536",
}


def _load_image_gen_config() -> Dict[str, Any]:
    try:
        from hagent_cli.config import load_config

        cfg = load_config()
        section = cfg.get("image_gen") if isinstance(cfg, dict) else None
        return section if isinstance(section, dict) else {}
    except Exception:
        return {}


def _resolve_model() -> Tuple[str, Dict[str, Any]]:
    env_override = os.environ.get("CHATGPT2API_IMAGE_MODEL")
    if env_override and env_override in _MODELS:
        return env_override, _MODELS[env_override]

    cfg = _load_image_gen_config()
    chatgpt_cfg = cfg.get("chatgpt2api") if isinstance(cfg.get("chatgpt2api"), dict) else {}
    candidate: Optional[str] = None
    if isinstance(chatgpt_cfg, dict):
        v = chatgpt_cfg.get("model")
        if isinstance(v, str) and v in _MODELS:
            candidate = v
    if candidate is None:
        top = cfg.get("model")
        if isinstance(top, str) and top in _MODELS:
            candidate = top

    if candidate is not None:
        return candidate, _MODELS[candidate]
    return DEFAULT_MODEL, _MODELS[DEFAULT_MODEL]


# ---------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------


class ChatGPT2APIImageGenProvider(ImageGenProvider):
    """ChatGPT2API — wrapper qua bridge proxy."""

    @property
    def name(self) -> str:
        return "chatgpt2api"

    @property
    def display_name(self) -> str:
        return "ChatGPT2API"

    def _bridge(self):
        from plugins.chatgpt2api_bridge import bridge as _b

        return _b

    def is_available(self) -> bool:
        try:
            return bool(self._bridge().verify_setup().get("proxy_reachable"))
        except Exception:
            return False

    def list_models(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": mid,
                "display": meta["display"],
                "speed": meta["speed"],
                "strengths": meta["strengths"],
                "price": "ChatGPT subscription",
            }
            for mid, meta in _MODELS.items()
        ]

    def default_model(self) -> Optional[str]:
        return DEFAULT_MODEL

    def get_setup_schema(self) -> Dict[str, Any]:
        return {
            "name": "ChatGPT2API",
            "badge": "proxy",
            "tag": "Cần ChatGPT Plus/Pro/Team token nạp vào pool",
            "env_vars": [
                {
                    "key": "CHATGPT2API_BASE_URL",
                    "prompt": "URL proxy (mặc định http://127.0.0.1:3011)",
                    "url": "",
                },
                {
                    "key": "CHATGPT2API_AUTH_KEY",
                    "prompt": "Auth key (mặc định 'chatgpt2api')",
                    "url": "",
                },
            ],
        }

    def generate(
        self,
        prompt: str,
        aspect_ratio: str = DEFAULT_ASPECT_RATIO,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        prompt = (prompt or "").strip()
        aspect = resolve_aspect_ratio(aspect_ratio)
        if not prompt:
            return error_response(
                error="Prompt không được để trống",
                error_type="invalid_argument",
                provider="chatgpt2api",
                aspect_ratio=aspect,
            )

        # Resolve tier
        requested = kwargs.get("model")
        if isinstance(requested, str) and requested in _MODELS:
            tier_id, meta = requested, _MODELS[requested]
        else:
            tier_id, meta = _resolve_model()

        size = _SIZES.get(aspect, _SIZES["square"])
        proxy_model = meta.get("proxy_id", "gpt-image-2")

        try:
            result = self._bridge().generate_image(
                prompt=prompt, size=size, model=proxy_model
            )
        except Exception as exc:
            logger.exception("Bridge generate failed")
            return error_response(
                error=f"Bridge error: {exc}",
                error_type="api_error",
                provider="chatgpt2api",
                model=tier_id,
                prompt=prompt,
                aspect_ratio=aspect,
            )

        if result.get("success"):
            return success_response(
                image=result["image"],
                model=tier_id,
                prompt=prompt,
                aspect_ratio=aspect,
                provider="chatgpt2api",
                extra={"size": size, "quality": meta.get("quality", "medium")},
            )

        return error_response(
            error=result.get("error", "Bridge generation failed"),
            error_type=result.get("error_type", "api_error"),
            provider="chatgpt2api",
            model=tier_id,
            prompt=prompt,
            aspect_ratio=aspect,
        )


def register(ctx) -> None:
    ctx.register_image_gen_provider(ChatGPT2APIImageGenProvider())
