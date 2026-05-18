from __future__ import annotations

import sys
import re
from pathlib import Path
from typing import Any

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

MEMORY_WIKI_REVIEW_INSTRUCTIONS = """Bắt buộc trước khi trả lời:
- Rà soát khối MEMORY/USER PROFILE và WIKI REVIEW bên dưới.
- Dùng thông tin trong đó khi liên quan đến câu hỏi hoặc hành động hiện tại.
- Nếu wiki không có mục khớp trực tiếp, vẫn xem danh sách mục gần đây để nhận diện kiến thức có sẵn.
- Không bịa rằng đã có dữ liệu trong memory/wiki nếu khối review không cung cấp.
- Nếu dữ liệu memory/wiki mâu thuẫn với kết quả tool hoặc nguồn mới hơn, ưu tiên kết quả đã kiểm chứng mới hơn và nói ngắn gọn lý do."""


def _clip_context_text(text: str, limit: int = 1800) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "\n...[đã rút gọn]"


def _format_wiki_review(user_id: str, query: str) -> str:
    try:
        from api.services.wiki_memory import list_wiki_entries, search_wiki

        results = search_wiki(user_id, query, limit=5)
        recent_entries = list_wiki_entries(user_id, limit=20)
    except Exception as exc:  # noqa: BLE001
        return f"[WIKI REVIEW]\nKhông đọc được wiki trước lượt này: {exc}"

    lines = ["[WIKI REVIEW]", f"Truy vấn: {query or '(trống)'}"]
    if results:
        lines.append("Kết quả liên quan:")
        for idx, item in enumerate(results, start=1):
            title = item.get("title") or "(không tiêu đề)"
            summary = item.get("summary") or ""
            content = _clip_context_text(item.get("content") or "", 1400)
            updated_at = item.get("updated_at") or ""
            lines.append(
                f"{idx}. {title}\n"
                f"   Cập nhật: {updated_at}\n"
                f"   Tóm tắt: {summary}\n"
                f"   Nội dung: {content}"
            )
    else:
        lines.append("Không có kết quả wiki khớp trực tiếp.")

    if recent_entries:
        recent_titles = []
        result_ids = {item.get("id") for item in results}
        for item in recent_entries:
            marker = "khớp" if item.get("id") in result_ids else "gần đây"
            recent_titles.append(f"- {item.get('title') or '(không tiêu đề)'} ({marker}, {item.get('updated_at') or 'không rõ ngày'})")
        lines.append("Mục wiki đã rà soát:")
        lines.extend(recent_titles)
    else:
        lines.append("Wiki hiện chưa có mục nào.")

    return "\n".join(lines)


def _format_memory_review() -> str:
    try:
        from tools.memory_tool import MemoryStore

        store = MemoryStore()
        store.load_from_disk()
        blocks = []
        memory_block = store.format_for_system_prompt("memory")
        user_block = store.format_for_system_prompt("user")
        if memory_block:
            blocks.append(memory_block)
        else:
            blocks.append("[MEMORY]\nChưa có mục MEMORY.md.")
        if user_block:
            blocks.append(user_block)
        else:
            blocks.append("[USER PROFILE]\nChưa có mục USER.md.")
        return "\n\n".join(blocks)
    except Exception as exc:  # noqa: BLE001
        return f"[MEMORY REVIEW]\nKhông đọc được memory trước lượt này: {exc}"


def _build_memory_wiki_review_prompt(user_id: str, user_message: str) -> str:
    return "\n\n".join(
        [
            MEMORY_WIKI_REVIEW_INSTRUCTIONS,
            _format_memory_review(),
            _format_wiki_review(user_id, user_message),
        ]
    )


def _content_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        chunks: list[str] = []
        image_count = 0
        for part in content:
            if not isinstance(part, dict):
                continue
            ptype = part.get("type")
            if ptype in {"text", "input_text"}:
                chunks.append(str(part.get("text") or ""))
            elif ptype in {"image_url", "input_image", "image"}:
                image_count += 1
        text = "\n".join(chunk for chunk in chunks if chunk).strip()
        if image_count:
            text = (text + "\n\n" if text else "") + f"[{image_count} ảnh được đính kèm]"
        return text
    return str(content or "")


def _sanitize_identity_text(content: Any) -> str:
    content = _content_text(content)
    return (
        (content or "")
        .replace("Tôi là Hagent Agent, một trợ lý AI thông minh được tạo ra bởiNous Research.", "Tôi là HAgent, trợ lý AI chạy trong ứng dụng HAgent của bạn.")
        .replace("Hagent Agent, an intelligent AI assistant created byNous Research", "HAgent, an intelligent AI assistant running inside the user's HAgent app")
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
    user_message: Any,
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
    user_message_text = _content_text(user_message)
    effective_message = (
        _build_continuation_turn(user_message_text, sanitized_history)
        if isinstance(user_message, str)
        else user_message
    )
    agent_prompt = _build_agent_prompt(agent_profile)
    user_id = session.user_id if session else "398f6a8a-8954-4315-8240-df769e664b54"
    if thinking_callback:
        thinking_callback("Rà soát bộ nhớ và wiki trước khi trả lời.")
    review_prompt = _build_memory_wiki_review_prompt(user_id, user_message_text)
    agent_prompt = "\n\n".join(part for part in [agent_prompt, review_prompt] if part)

    enabled_toolsets = _clean_list((agent_profile or {}).get("tool_groups"))

    agent = AIAgent(
        base_url=cfg.base_url,
        api_key=cfg.api_key,
        provider=cfg.name,
        model=cfg.model,
        quiet_mode=False,
        prefill_messages=prefill_messages,
        max_iterations=500,
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

    # Wrap callbacks to check for stop requests
    from api.services.run_control import is_stop_requested

    def check_stop():
        if is_stop_requested(session_id):
            agent.interrupt("Xử lý đã bị dừng theo yêu cầu của người dùng.")

    # Wrap the callbacks that are called frequently during the run
    original_thinking = agent.thinking_callback
    def thinking_wrapper(content):
        check_stop()
        if original_thinking: original_thinking(content)
    agent.thinking_callback = thinking_wrapper

    original_tool_progress = agent.tool_progress_callback
    def tool_progress_wrapper(event_name, tool_name, preview=None, args=None, **kwargs):
        check_stop()
        if original_tool_progress: original_tool_progress(event_name, tool_name, preview, args, **kwargs)
    agent.tool_progress_callback = tool_progress_wrapper

    original_step = agent.step_callback
    def step_wrapper(iteration, prev_tools):
        check_stop()
        if original_step: original_step(iteration, prev_tools)
    agent.step_callback = step_wrapper

    def stream_wrapper(delta):
        check_stop()
        if stream_callback: stream_callback(delta)

    reply = agent.run_conversation(effective_message, stream_callback=stream_wrapper)
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
        "Không tự nhận là Hagent Agent và không nói được tạo bởiNous Research."
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
