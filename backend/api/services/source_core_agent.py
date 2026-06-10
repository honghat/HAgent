from __future__ import annotations

import sys
import re
from pathlib import Path
from typing import Any

import yaml

APP_ROOT = Path(__file__).resolve().parents[2]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

# Source core đã được flatten vào backend/agent/app, nên import run_agent từ app root.
from run_agent import AIAgent  # type: ignore  # noqa: E402
from hagent_constants import get_config_path
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

SMALL_CONTEXT_PROVIDERS = {"lmstudio_local"}
SMALL_CONTEXT_LIMIT = 64_000
SMALL_CONTEXT_DEFAULT_TOOLSETS = [
    "todo",
    "terminal",
    "file",
    "job_hunter",
    "knowledge",
    "finance",
    "web",
    "news",
    "weather",
    "memory",
    "skills",
]

JOB_HUNTER_INTENT_RE = re.compile(
    r"(săn\s*việc|san\s*viec|việc\s*làm|viec\s*lam|job\s*hunt|job\s*hunter|"
    r"\bjd\b|cào\s*job|cao\s*job|cào\s*jd|cao\s*jd|tìm\s*job|tim\s*job|"
    r"match\s*cv|đối\s*chiếu\s*jd|doi\s*chieu\s*jd|ứng\s*tuyển|ung\s*tuyen)",
    re.IGNORECASE,
)

JOB_HUNTER_CONTROL_PROMPT = """[JOB HUNTER CONTROL]
Khi người dùng yêu cầu săn việc, cào job/JD, match CV, đối chiếu JD hoặc ứng tuyển:
- Điều khiển toàn bộ từ agent chat hiện tại bằng tool job_hunter_*; không chỉ bảo người dùng mở tab Săn việc.
- Nếu cần lấy JD mới, gọi job_hunter_scrape. Kết quả cào phải được lưu vào DB canonical `data/hagent.db`, bảng `cached_jobs`, trước khi báo xong.
- Sau khi cào JD, gọi job_hunter_match_new để chấm CV theo nhu cầu cá nhân, rồi job_hunter_top_matches để lấy top JD.
- Báo ngắn gọn số JD quét được, số JD mới, số JD đã xác nhận lưu DB, và 3 JD phù hợp nhất kèm lý do/gap.
- Nếu chưa có CV, nói rõ cần upload CV trước rồi vẫn có thể cào/lưu JD vào DB."""


def _read_tool_preset(name: str, default: list[str]) -> list[str]:
    try:
        config = yaml.safe_load(get_config_path().read_text(encoding="utf-8")) or {}
        if not isinstance(config, dict):
            return list(default)
        presets = config.get("tool_presets")
        if not isinstance(presets, dict):
            return list(default)
        preset = _clean_list(presets.get(name))
        return preset if preset else list(default)
    except Exception:
        return list(default)


def _clip_context_text(text: str, limit: int = 1800) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "\n...[đã rút gọn]"


def _format_wiki_review(
    user_id: str,
    query: str,
    *,
    result_limit: int = 5,
    recent_limit: int = 20,
    content_limit: int = 1400,
) -> str:
    try:
        from api.services.wiki_memory import list_wiki_entries, search_wiki

        results = search_wiki(user_id, query, limit=result_limit)
        recent_entries = list_wiki_entries(user_id, limit=recent_limit)
    except Exception as exc:  # noqa: BLE001
        return f"[WIKI REVIEW]\nKhông đọc được wiki trước lượt này: {exc}"

    lines = ["[WIKI REVIEW]", f"Truy vấn: {query or '(trống)'}"]
    if results:
        lines.append("Kết quả liên quan:")
        for idx, item in enumerate(results, start=1):
            title = item.get("title") or "(không tiêu đề)"
            summary = item.get("summary") or ""
            content = _clip_context_text(item.get("content") or "", content_limit)
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


def _format_memory_review(*, compact: bool = False) -> str:
    try:
        from tools.memory_tool import MemoryStore

        def _memory_limit(value: Any, default: int) -> int:
            try:
                parsed = int(value)
            except (TypeError, ValueError):
                return default
            return parsed if parsed > 0 else default

        try:
            config = yaml.safe_load(get_config_path().read_text(encoding="utf-8")) or {}
            memory_cfg = config.get("memory") if isinstance(config.get("memory"), dict) else {}
        except Exception:
            memory_cfg = {}
        memory_limit = _memory_limit(memory_cfg.get("memory_char_limit"), 12000)
        user_limit = _memory_limit(memory_cfg.get("user_char_limit"), 8000)
        review_limit = _memory_limit(
            memory_cfg.get("review_char_limit"),
            memory_limit + user_limit + 1200,
        )

        store = MemoryStore(
            memory_char_limit=memory_limit,
            user_char_limit=user_limit,
        )
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
        text = "\n\n".join(blocks)
        return _clip_context_text(text, 1800 if compact else review_limit)
    except Exception as exc:  # noqa: BLE001
        return f"[MEMORY REVIEW]\nKhông đọc được memory trước lượt này: {exc}"


def _build_memory_wiki_review_prompt(user_id: str, user_message: str, *, compact: bool = False) -> str:
    return "\n\n".join(
        [
            MEMORY_WIKI_REVIEW_INSTRUCTIONS,
            _format_memory_review(compact=compact),
            _format_wiki_review(
                user_id,
                user_message,
                result_limit=2 if compact else 5,
                recent_limit=5 if compact else 20,
                content_limit=500 if compact else 1400,
            ),
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


def _compact_prefill_messages(history: list[dict], *, max_messages: int = 6, content_limit: int = 1200) -> list[dict]:
    compacted: list[dict] = []
    for item in history[-max_messages:]:
        role = item.get("role")
        content = _sanitize_identity_text(item.get("content") or "")
        if role in {"user", "assistant", "system"} and content:
            compacted.append({"role": role, "content": _clip_context_text(content, content_limit)})
    return compacted


def analyze_with_js_heuristics(text: str) -> list[str]:
    """Port the old JS chat router's quick intent checks into the Python path."""
    checks: list[tuple[str, str]] = [
        (r"(^|\s)(giá\s+vàng|gia\s*vang|vàng|vang|doji|sjc|pnj|gold\s*price)", "Nhận diện yêu cầu giá vàng"),
        (r"(^|\s)(giá\s+bạc|gia\s*bac|bạc|bac|silver\s*price)", "Nhận diện yêu cầu giá bạc"),
        (r"(tỷ\s*giá|ty\s*gia|ngoại\s*tệ|usd|eur|jpy|vietcombank|quy\s*đổi)", "Nhận diện yêu cầu tỷ giá"),
        (r"(tin\s*(tức|tuc|nóng|mới)|thời\s*sự|news|hôm\s*nay|current|today|update)", "Nhận diện yêu cầu tin tức mới"),
        (r"(thời\s*tiết|thoi\s*tiet|weather|nhiệt\s*độ|mưa|nắng|bão)", "Nhận diện yêu cầu thời tiết"),
        (r"(gmail|inbox|email|mail|gửi\s+email|đọc\s+email)", "Nhận diện yêu cầu email"),
        (JOB_HUNTER_INTENT_RE.pattern, "Nhận diện yêu cầu săn việc/JD, sẽ dùng job_hunter tools nếu cần"),
        (r"(google\s*drive|drive|file\s*Drive)", "Nhận diện yêu cầu Google Drive"),
        (r"(wiki|knowledge|kiến\s*thức)", "Nhận diện yêu cầu wiki/knowledge"),
        (r"(tìm\s*kiếm|search|trên\s*web|tra\s*cứu|internet)", "Nhận diện yêu cầu web search"),
        (r"(viết|tạo|code|script|fix\s*bug|debug|sửa\s*lỗi|npm|python|node\s|git\s|deploy|build|test)", "Nhận diện tác vụ coding/thực thi"),
    ]
    matched = [label for pattern, label in checks if re.search(pattern, text or "", re.IGNORECASE)]
    if SHORT_CONFIRMATION_RE.match((text or "").strip()):
        matched.append("Nhận diện xác nhận ngắn, sẽ tiếp tục đề xuất trước đó nếu có")
    return matched


AGENT_MODE_INSTRUCTIONS: dict[str, str] = {
    "jarvis-idle": (
        "[CHẾ ĐỘ JARVIS-IDLE] Bạn đang ở chế độ chờ chủ động kiểu JARVIS. "
        "Trả lời ngắn (<= 3 câu), thân thiện, chủ động hỏi xem có cần nhắc lịch, "
        "việc đang dở, hay học bài hôm nay không. Không phân tích dài dòng nếu chưa được hỏi."
    ),
    "coach": (
        "[CHẾ ĐỘ COACH] Bạn đang dạy/coach. Ưu tiên Socratic: đặt câu hỏi dẫn dắt, "
        "chỉ giảng khi người dùng bí. Mỗi lần đưa tối đa 1 khái niệm mới + 1 ví dụ + 1 bài luyện. "
        "Khen cụ thể khi đúng, sửa nhẹ nhàng khi sai."
    ),
    "voice": (
        "[CHẾ ĐỘ VOICE] Output sẽ được đọc qua TTS, không qua màn hình. "
        "Tuyệt đối không dùng markdown (không **, không #, không emoji, không URL). "
        "Câu ngắn, trò chuyện như nói, tối đa 4 câu/lần."
    ),
    "build": "",
}


def _agent_mode_prompt(mode: str | None) -> str:
    if not mode:
        return ""
    key = mode.strip().lower()
    return AGENT_MODE_INSTRUCTIONS.get(key, "")


def run_source_agent(
    session_id: str,
    user_message: Any,
    provider_name: str | None,
    model_override: str | None = None,
    context_length_override: int | None = None,
    stream_callback=None,
    tool_progress_callback=None,
    thinking_callback=None,
    reasoning_callback=None,
    status_callback=None,
    step_callback=None,
    tool_complete_callback=None,
    agent_mode: str | None = None,
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
    provider_context_length = context_length_override or getattr(cfg, "context_length", None)
    small_context_mode = (
        (effective_provider or "").strip() in SMALL_CONTEXT_PROVIDERS
        or (isinstance(provider_context_length, int) and provider_context_length < SMALL_CONTEXT_LIMIT)
    )
    if small_context_mode:
        prefill_messages = _compact_prefill_messages(history[:-1], max_messages=6, content_limit=1200)
    else:
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
    agent_prompt = _build_agent_prompt(agent_profile, compact=small_context_mode)
    user_id = session.user_id if session else "398f6a8a-8954-4315-8240-df769e664b54"
    review_prompt = _build_memory_wiki_review_prompt(user_id, user_message_text, compact=small_context_mode)
    mode_prompt = _agent_mode_prompt(agent_mode)
    job_hunter_intent = bool(JOB_HUNTER_INTENT_RE.search(user_message_text or ""))
    agent_prompt = "\n\n".join(
        part
        for part in [
            agent_prompt,
            mode_prompt,
            JOB_HUNTER_CONTROL_PROMPT if job_hunter_intent else "",
            review_prompt,
        ]
        if part
    )

    enabled_toolsets = (
        _read_tool_preset("small_model", SMALL_CONTEXT_DEFAULT_TOOLSETS)
        if small_context_mode
        else _read_tool_preset("large_model", [])
    )
    if job_hunter_intent and enabled_toolsets and "job_hunter" not in enabled_toolsets:
        enabled_toolsets = [*enabled_toolsets, "job_hunter"]

    agent = AIAgent(
        base_url=cfg.base_url,
        api_key=cfg.api_key,
        provider=cfg.name,
        model=cfg.model,
        quiet_mode=False,
        prefill_messages=prefill_messages,
        max_iterations=80 if small_context_mode else 500,
        tool_delay=0.2,
        enabled_toolsets=enabled_toolsets or None,
        request_overrides={
            "allow_small_context": small_context_mode,
            "context_length": provider_context_length,
        },
        skip_context_files=small_context_mode,
        skip_memory=small_context_mode,
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
    from api.services.run_control import attach_agent, is_stop_requested
    attach_agent(session_id, agent)

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

    try:
        reply = agent.run_conversation(effective_message, stream_callback=stream_wrapper)
    finally:
        attach_agent(session_id, None)
    if isinstance(reply, dict):
        text = reply.get("final_response")
        if not text and reply.get("error"):
            error_text = str(reply.get("error") or "")
            if "truncated due to output length limit" in error_text.lower():
                text = (
                    "⚠️ Provider đã cắt ngắn phản hồi vì chạm giới hạn độ dài output. "
                    "HAgent đã thử nối tiếp nhưng chưa thu được phần nội dung an toàn để hiển thị. "
                    "Hãy gửi `tiếp tục` hoặc chia nhỏ yêu cầu."
                )
            else:
                text = f"❌ Lỗi: {error_text}"
        text = str(text or "")
        pending_steer = str(reply.get("pending_steer") or "").strip()
        if pending_steer:
            text = (
                f"{text}\n\n"
                "Ghi chú steer đến sau khi lượt trả lời đã hoàn tất, "
                f"nên chưa kịp áp dụng trong lượt này: {pending_steer}"
            ).strip()
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


def _build_agent_prompt(agent_profile: dict | None, *, compact: bool = False) -> str | None:
    parts = [
        "Bạn là HAgent, trợ lý AI chạy trong ứng dụng HAgent của người dùng. "
        "Khi được hỏi bạn là ai, trả lời bạn là HAgent. "
        "Không tự nhận là Hagent Agent và không nói được tạo bởiNous Research."
    ]
    parts.append(
        "Với tác vụ có nhiều bước, đặc biệt là sửa code/UI, debug, kiểm thử, hoặc "
        "người dùng đưa nhiều yêu cầu liên tiếp, hãy dùng tool `todo` để tạo danh sách "
        "việc ngay khi bắt đầu, giữ đúng một việc `in_progress`, và cập nhật `completed` "
        "ngay sau khi xong từng việc. Todo này là dữ liệu cho khung todo trong giao diện chat."
    )
    parts.append(
        "Ngữ cảnh dự án cố định: dự án mặc định cần đọc/sửa là HAgent tại "
        "`/Users/nguyenhat/HAgent`. Khi người dùng nói sửa app, frontend, backend, "
        "workflow, chat, omni, setting/settings hoặc automation mà không chỉ định repo khác, "
        "hãy hiểu đó là yêu cầu thay đổi trong dự án HAgent này. Mọi đường dẫn tương đối "
        "trong tác vụ code mặc định tính từ `/Users/nguyenhat/HAgent`."
    )
    if compact:
        parts.append(
            "Chế độ context nhỏ vẫn phải dùng công cụ khi nhiệm vụ cần dữ liệu thực tế, "
            "đọc/ghi file, chạy lệnh, tra wiki hoặc kiểm chứng. Không trả lời đoán mò "
            "khi đã có tool phù hợp. Với giá vàng, giá bạc, tỷ giá hoặc quy đổi tiền, "
            "ưu tiên gọi tool finance tương ứng trước khi trả lời. Với thời tiết, phải ưu tiên "
            "tool weather/get_weather trước; chỉ dùng web_search nếu tool thời tiết không có hoặc lỗi. "
            "Với tin tức, ưu tiên tool news. Với tra cứu web, wiki và memory, dùng đúng tool tương ứng "
            "nếu có; nếu web_search không khả dụng nhưng terminal có, có thể dùng terminal/curl để lấy "
            "dữ liệu công khai cần thiết. Không tự suy đoán giờ hiện tại, nhiệt độ hiện tại hoặc mốc thời gian "
            "nếu tool chưa trả về dữ liệu đó."
        )
    if not agent_profile:
        return "\n\n".join(parts)
    parts.append(f"Bạn đang chạy trong HAgent profile: {agent_profile.get('name') or agent_profile.get('id')}.")
    description = (agent_profile.get("description") or "").strip()
    if description:
        description = _clip_context_text(description, 500 if compact else 2000)
        parts.append(f"Mô tả agent: {description}")
    soul = (agent_profile.get("soul") or "").strip()
    if soul:
        soul = _clip_context_text(soul, 1200 if compact else 6000)
        parts.append("Chỉ dẫn riêng của agent:\n" + soul)
    skills = _clean_list(agent_profile.get("skills"))
    if skills:
        parts.append(
            "Các skill backend đã gán cho agent này: "
            + ", ".join(skills)
            + ". Khi nhiệm vụ phù hợp, dùng skill_view để nạp skill trước khi làm."
        )
    return "\n\n".join(parts)
