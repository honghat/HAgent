from __future__ import annotations

import sys
import re
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[2]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

# Source core đã được flatten vào backend/agent/app, nên import run_agent từ app root.
from run_agent import AIAgent  # type: ignore  # noqa: E402
from api.services.agent_profiles import get_agent_profile
from api.services.provider_config import get_provider_config
from api.services.session_store import get_session, list_messages


SHORT_CONFIRMATION_RE = re.compile(
    r"^(ok|okay|oke|yes|y|ừ|uh|uhm|được|duoc|đúng|dung|rồi|roi|tiếp|tiep|"
    r"chạy đi|chay di|làm đi|lam di|go|continue|rerun|run again|chạy lại|chay lai|"
    r"làm lại|lam lai)$",
    re.IGNORECASE,
)


def _sanitize_identity_text(content: str) -> str:
    return (
        (content or "")
        .replace("Tôi là Hagent Agent, một trợ lý AI thông minh được tạo ra bởi Nous Research.", "Tôi là HAgent, trợ lý AI chạy trong ứng dụng HAgent của bạn.")
        .replace("Hagent Agent, an intelligent AI assistant created by Nous Research", "HAgent, an intelligent AI assistant running inside the user's HAgent app")
        .replace("Hagent Agent", "HAgent")
        .replace("Nous Research", "HAgent")
    )


def _build_continuation_turn(text: str, history: list[dict], platform: str = "chat") -> str:
    clean_text = (text or "").strip()
    if not SHORT_CONFIRMATION_RE.match(clean_text):
        return clean_text

    last_assistant = next(
        (
            item
            for item in reversed(history)
            if item.get("role") == "assistant" and (item.get("content") or "").strip()
        ),
        None,
    )
    if not last_assistant:
        return clean_text

    tag = platform.upper()
    return "\n".join(
        [
            f"[{tag}_CONFIRMATION] {clean_text}",
            "The user is confirming or approving the immediately preceding assistant proposal.",
            "Continue the proposed action using tools when needed.",
            "Do not answer with a social acknowledgement only if there is still an actionable task.",
            "",
            f"[Previous assistant message]\n{last_assistant.get('content')}",
        ]
    )


def analyze_with_js_heuristics(text: str) -> list[str]:
    """Port the old JS chat router's quick intent checks into the Python path."""
    checks: list[tuple[str, str]] = [
        (r"(^|\s)(giá\s+vàng|gia\s*vang|vàng|vang|doji|sjc|pnj|gold\s*price)", "Nhận diện yêu cầu giá vàng"),
        (r"(^|\s)(giá\s+bạc|gia\s*bac|bạc|bac|silver\s*price)", "Nhận diện yêu cầu giá bạc"),
        (r"(tỷ\s*giá|ty\s*gia|ngoại\s*tệ|usd|eur|jpy|vietcombank|quy\s*đổi)", "Nhận diện yêu cầu tỷ giá"),
        (r"(tin\s*(tức|tuc|nóng|mới)|thời\s*sự|news|hôm\s*nay|current|today|update)", "Nhận diện yêu cầu tin tức mới"),
        (r"(thời\s*tiết|thoi\s*tiet|weather|nhiệt\s*độ|mưa|nắng|bão)", "Nhận diện yêu cầu thời tiết"),
        (r"(gmail|inbox|email|mail|gửi\s+email|đọc\s+email)", "Nhận diện yêu cầu email"),
        (r"(google\s*drive|drive|file\s*Drive)", "Nhận diện yêu cầu Google Drive"),
        (r"(wiki|knowledge|kiến\s*thức)", "Nhận diện yêu cầu wiki/knowledge"),
        (r"(tìm\s*kiếm|search|trên\s*web|tra\s*cứu|internet)", "Nhận diện yêu cầu web search"),
        (r"(viết|tạo|code|script|fix\s*bug|debug|sửa\s*lỗi|npm|python|node\s|git\s|deploy|build|test)", "Nhận diện tác vụ coding/thực thi"),
    ]
    matched = [label for pattern, label in checks if re.search(pattern, text or "", re.IGNORECASE)]
    if SHORT_CONFIRMATION_RE.match((text or "").strip()):
        matched.append("Nhận diện xác nhận ngắn, sẽ tiếp tục đề xuất trước đó nếu có")
    return matched


def run_source_agent(
    session_id: str,
    user_message: str,
    provider_name: str | None,
    model_override: str | None = None,
    stream_callback=None,
    tool_progress_callback=None,
    thinking_callback=None,
    reasoning_callback=None,
    status_callback=None,
    step_callback=None,
    tool_complete_callback=None,
) -> tuple[str, dict]:
    session = get_session(session_id)
    agent_profile = get_agent_profile(session.agent_id if session else None)
    effective_provider = provider_name
    effective_model_override = model_override
    agent_model = (agent_profile or {}).get("model") or ""
    if agent_model and agent_model not in {"local", "default"}:
        if agent_model in {"gemini", "deepseek", "cx", "openai", "anthropic", "ollama", "lmstudio", "llamacpp", "lmstudio_local"}:
            effective_provider = agent_model
            effective_model_override = None
        elif not effective_model_override:
            effective_model_override = agent_model

    cfg = get_provider_config(effective_provider, effective_model_override)
    history = list_messages(session_id)
    prefill_messages = []
    for item in history[:-1]:
        role = item.get("role")
        content = _sanitize_identity_text(item.get("content") or "")
        if role in {"user", "assistant", "system"} and content:
            prefill_messages.append({"role": role, "content": content})

    sanitized_history = [{**item, "content": _sanitize_identity_text(item.get("content") or "")} for item in history]
    effective_message = _build_continuation_turn(user_message, sanitized_history)
    agent_prompt = _build_agent_prompt(agent_profile)
    enabled_toolsets = _clean_list((agent_profile or {}).get("tool_groups"))

    agent = AIAgent(
        base_url=cfg.base_url,
        api_key=cfg.api_key,
        provider=cfg.name,
        model=cfg.model,
        quiet_mode=False,
        prefill_messages=prefill_messages,
        max_iterations=8,
        tool_delay=0.2,
        enabled_toolsets=enabled_toolsets or None,
        ephemeral_system_prompt=agent_prompt,
        platform="web",
        session_id=session_id,
        tool_progress_callback=tool_progress_callback,
        tool_complete_callback=tool_complete_callback,
        thinking_callback=thinking_callback,
        reasoning_callback=reasoning_callback,
        status_callback=status_callback,
        step_callback=step_callback,
    )
    reply = agent.run_conversation(effective_message, stream_callback=stream_callback)
    if isinstance(reply, dict):
        text = reply.get("final_response")
        if not text and reply.get("error"):
            text = f"❌ Lỗi: {reply.get('error')}"
        text = str(text or "")
        usage = {
            "prompt_tokens": reply.get("prompt_tokens", 0),
            "completion_tokens": reply.get("completion_tokens", 0),
            "total_tokens": reply.get("total_tokens", 0),
        }
        return text, usage
    elif isinstance(reply, tuple):
        text = str(reply[0])
        usage = reply[1] if len(reply) > 1 and isinstance(reply[1], dict) else {}
        return text, usage
    return str(reply), {}


def _clean_list(value) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _build_agent_prompt(agent_profile: dict | None) -> str | None:
    parts = [
        "Bạn là HAgent, trợ lý AI chạy trong ứng dụng HAgent của người dùng. "
        "Khi được hỏi bạn là ai, trả lời bạn là HAgent. "
        "Không tự nhận là Hagent Agent và không nói được tạo bởi Nous Research."
    ]
    if not agent_profile:
        return "\n\n".join(parts)
    parts.append(f"Bạn đang chạy trong HAgent profile: {agent_profile.get('name') or agent_profile.get('id')}.")
    description = (agent_profile.get("description") or "").strip()
    if description:
        parts.append(f"Mô tả agent: {description}")
    soul = (agent_profile.get("soul") or "").strip()
    if soul:
        parts.append("Chỉ dẫn riêng của agent:\n" + soul)
    skills = _clean_list(agent_profile.get("skills"))
    if skills:
        parts.append(
            "Các skill backend đã gán cho agent này: "
            + ", ".join(skills)
            + ". Khi nhiệm vụ phù hợp, dùng skill_view để nạp skill trước khi làm."
        )
    return "\n\n".join(parts)
