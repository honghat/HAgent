"""Summarize completed sessions to reduce context overhead on rotation."""

from __future__ import annotations

import json
import os

from api.services.provider_config import get_provider_config
from api.services.session_store import list_messages, update_session_summary

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None  # type: ignore


_SUMMARY_PROMPT = """Bạn là chuyên gia tóm tắt hội thoại. Hãy tóm tắt cuộc trò chuyện sau đây giữa người dùng và trợ lý HAgent.

Yêu cầu:
- Tóm tắt ngắn gọn bằng tiếng Việt, tối đa 200 từ
- Nêu rõ chủ đề chính (main topic) của cuộc trò chuyện
- Liệt kê các hành động đã thực hiện (nếu có): gọi API, đọc file, search, etc.
- Liệt kê kết quả/output đã đạt được
- Nếu có thông tin quan trọng hoặc quyết định đã được đưa ra, ghi lại

Định dạng output (chỉ trả về JSON, không markdown, không giải thích thêm):
{{
  "topic": "chủ đề chính",
  "summary": "tóm tắt ngắn gọn",
  "actions": ["hành động 1", "hành động 2"],
  "results": ["kết quả 1", "kết quả 2"],
  "key_info": "thông tin/quyết định quan trọng (nếu có)"
}}

Cuộc trò chuyện:
"""


def _call_llm_for_summary(messages_text: str, provider_name: str = "cx") -> dict | None:
    """Call an LLM to summarize a conversation."""
    if OpenAI is None:
        return None

    try:
        cfg = get_provider_config(provider_name)
        if not cfg.base_url or not cfg.api_key:
            return None

        client = OpenAI(base_url=cfg.base_url, api_key=cfg.api_key)
        response = client.chat.completions.create(
            model=cfg.model,
            messages=[
                {"role": "system", "content": "You are a conversation summarizer. Always respond in JSON."},
                {"role": "user", "content": _SUMMARY_PROMPT + messages_text},
            ],
            temperature=0.3,
            max_tokens=500,
            response_format={"type": "json_object"},
        )
        text = response.choices[0].message.content
        if text:
            return json.loads(text)
    except Exception:
        return None
    return None


def _format_messages_for_summary(session_id: str) -> str:
    """Format session messages into a text block for summarization."""
    msgs = list_messages(session_id)
    parts = []
    for m in msgs:
        role = "Người dùng" if m.get("role") == "user" else "Trợ lý"
        content = (m.get("content") or "").strip()
        if content:
            parts.append(f"[{role}]: {content[:500]}")
    return "\n\n".join(parts)


def _generate_title(messages_text: str, provider_name: str = "cx") -> str | None:
    """Generate a concise title from the conversation."""
    if OpenAI is None:
        return None
    try:
        cfg = get_provider_config(provider_name)
        client = OpenAI(base_url=cfg.base_url, api_key=cfg.api_key)
        response = client.chat.completions.create(
            model=cfg.model,
            messages=[
                {"role": "system", "content": "Generate a very short Vietnamese title (max 6 words) for this conversation. Return ONLY the title, no quotes, no extra text."},
                {"role": "user", "content": messages_text[:2000]},
            ],
            temperature=0.3,
            max_tokens=30,
        )
        return response.choices[0].message.content.strip().strip('"\'')
    except Exception:
        return None


_ROTATION_MESSAGE = """📋 **Phiên trước đã được tóm tắt và lưu lại.**

Chủ đề: {topic}
Tóm tắt: {summary}

{actions_str}{results_str}{info_str}
---

Phiên này tiếp nối phiên trước. Hãy tiếp tục hỗ trợ người dùng dựa trên ngữ cảnh đã có."""


def summarize_and_rotate(session_id: str, provider_name: str | None = None) -> str | None:
    """Summarize the session, store summary, and create a child session.
    
    Returns the new session_id if rotation happened, None otherwise.
    """
    from api.services.session_store import count_session_messages, create_child_session, get_session

    msg_count = count_session_messages(session_id)
    # Only rotate if we have meaningful conversation (at least 3 exchanges = 6 messages)
    if msg_count < 6:
        return None

    session = get_session(session_id)
    if not session:
        return None

    # Try summarization with provider, fallback to env provider
    summary_provider = provider_name or os.getenv("HAGENT_SUMMARY_PROVIDER", "cx")
    messages_text = _format_messages_for_summary(session_id)

    result = _call_llm_for_summary(messages_text, summary_provider)
    if not result:
        # Try fallback provider
        alt_provider = "lmstudio" if summary_provider != "lmstudio" else "cx"
        result = _call_llm_for_summary(messages_text, alt_provider)

    if result:
        summary_text = json.dumps(result, ensure_ascii=False)
        update_session_summary(session_id, summary_text)
    else:
        # Fallback: simple text summary
        summary_text = messages_text[:1000]
        update_session_summary(session_id, json.dumps({
            "topic": session.title,
            "summary": summary_text[:200],
            "actions": [],
            "results": [],
            "key_info": "",
        }, ensure_ascii=False))

    # Create child session
    title = session.title
    new_title = _generate_title(messages_text, summary_provider)
    child = create_child_session(session_id, new_title or title)

    return child.session_id


def build_rotation_message(session_id: str) -> str | None:
    """Build a user-facing message explaining the rotation with summary context."""
    from api.services.session_store import get_session_summary
    summary_json = get_session_summary(session_id)
    if not summary_json:
        return None
    try:
        data = json.loads(summary_json)
    except (json.JSONDecodeError, TypeError):
        return None

    topic = data.get("topic", "không xác định")
    summary = data.get("summary", "")
    actions = data.get("actions", [])
    results = data.get("results", [])
    key_info = data.get("key_info", "")

    actions_str = ""
    if actions:
        items = "\n".join(f"  • {a}" for a in actions)
        actions_str = f"Hành động đã thực hiện:\n{items}\n\n"

    results_str = ""
    if results:
        items = "\n".join(f"  • {r}" for r in results)
        results_str = f"Kết quả:\n{items}\n\n"

    info_str = ""
    if key_info:
        info_str = f"Thông tin quan trọng: {key_info}\n\n"

    return _ROTATION_MESSAGE.format(
        topic=topic,
        summary=summary,
        actions_str=actions_str,
        results_str=results_str,
        info_str=info_str,
    )
