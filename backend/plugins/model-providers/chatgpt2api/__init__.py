"""chatgpt2api proxy provider profile.

Trỏ HAgent agent chat vào proxy native (basketikun/chatgpt2api) ở
http://127.0.0.1:3011 — proxy đã expose OpenAI-compatible /v1/chat/completions,
/v1/models, /v1/responses. Dùng Bearer <auth-key>; mặc định "chatgpt2api".
"""

from __future__ import annotations

import json
import logging
import os
import urllib.request

from providers import register_provider
from providers.base import ProviderProfile

logger = logging.getLogger(__name__)


class ChatGPT2APIProfile(ProviderProfile):
    """OpenAI-compatible profile cho chatgpt2api proxy."""

    def fetch_models(
        self,
        *,
        api_key: str | None = None,
        timeout: float = 5.0,
    ) -> list[str] | None:
        base = (os.environ.get("CHATGPT2API_BASE_URL") or self.base_url).rstrip("/")
        if not base.endswith("/v1"):
            base = base + "/v1"
        key = api_key or os.environ.get("CHATGPT2API_AUTH_KEY") or "chatgpt2api"
        try:
            req = urllib.request.Request(f"{base}/models")
            req.add_header("Authorization", f"Bearer {key}")
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode())
            return [
                m["id"]
                for m in data.get("data", [])
                if isinstance(m, dict) and m.get("id")
            ]
        except Exception as exc:
            logger.debug("fetch_models(chatgpt2api): %s", exc)
            return None


chatgpt2api = ChatGPT2APIProfile(
    name="chatgpt2api",
    aliases=("chatgpt-proxy", "cgpt2api"),
    api_mode="chat_completions",
    env_vars=("CHATGPT2API_AUTH_KEY",),
    display_name="ChatGPT2API (local proxy)",
    description="Local chatgpt2api proxy — chat/image qua tài khoản ChatGPT",
    signup_url="https://github.com/basketikun/chatgpt2api",
    base_url=os.environ.get("CHATGPT2API_BASE_URL", "http://127.0.0.1:3011") + "/v1",
    auth_type="api_key",
    fallback_models=(
        "gpt-5-mini",
        "auto",
        "gpt-5",
        "gpt-5-1",
        "gpt-5-2",
        "gpt-5-3",
        "gpt-5-3-mini",
        "gpt-image-2",
        "codex-gpt-image-2",
    ),
)

register_provider(chatgpt2api)
