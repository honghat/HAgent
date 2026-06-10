from __future__ import annotations

import json
from urllib import error, request

from api.services.provider_config import get_provider_config

SYSTEM_PROMPT = (
    "Bạn là HAgent, trợ lý AI tiếng Việt, trả lời rõ ràng, trực tiếp, hữu ích. "
    "Nếu thiếu dữ liệu, nói ngắn gọn điều còn thiếu thay vì bịa."
)


def _build_messages(history: list[dict], user_message: str, user_id: str | None = None) -> list[dict]:
    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for item in history[-12:]:
        role = item.get("role")
        content = item.get("content") or ""
        if role in {"user", "assistant", "system"} and content:
            messages.append({"role": role, "content": content})
    try:
        from agent.personal_context import build_personal_context

        personal_context = build_personal_context(user_message, user_id=user_id)
    except Exception:
        personal_context = ""
    content = user_message
    if personal_context:
        content = f"{user_message}\n\n{personal_context}"
    messages.append({"role": "user", "content": content})
    return messages


def generate_reply(
    history: list[dict],
    user_message: str,
    provider_name: str | None,
    model_override: str | None = None,
    user_id: str | None = None,
) -> tuple[str, dict]:
    cfg = get_provider_config(provider_name, model_override)
    if cfg.type != "openai":
        raise RuntimeError(f"Provider chưa được hỗ trợ trong backend mới: {cfg.name}")
    if not cfg.base_url:
        raise RuntimeError(f"Provider chưa có base URL: {cfg.name}")
    if not cfg.api_key:
        raise RuntimeError(f"Provider chưa có API key: {cfg.name}")

    payload = {
        "model": cfg.model,
        "messages": _build_messages(history, user_message, user_id=user_id),
        "temperature": 0.7,
    }
    req = request.Request(
        f"{cfg.base_url.rstrip('/')}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cfg.api_key}",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=90) as response:
            data = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Lỗi provider {cfg.name}: HTTP {exc.code} - {body[:300]}") from exc
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Không gọi được provider {cfg.name}: {exc}") from exc

    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    usage = data.get("usage") or {}
    if not content:
        raise RuntimeError(f"Provider {cfg.name} không trả về nội dung hợp lệ")
    return content, usage
