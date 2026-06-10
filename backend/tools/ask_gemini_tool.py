"""Tool: ask Gemini (gemini.google.com) — uses logged-in Chrome session."""

from tools._browser_llm_base import LLMConfig, register_llm_tool


register_llm_tool(LLMConfig(
    name="ask_gemini",
    url_match=["gemini.google.com"],
    open_url="https://gemini.google.com/app",
    input_selectors=[
        'rich-textarea div.ql-editor[contenteditable="true"]',
        'div.ql-editor[contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
    ],
    send_selectors=[
        'button[aria-label="Send message"]',
        'button[aria-label*="Send message"]',
        'button.send-button',
        'button[mattooltip*="Send"]',
    ],
    msg_selectors=[
        'message-content.model-response-text',
        'model-response message-content',
        'div.model-response-text',
        '[data-test-id="conversation-turn-response"]',
    ],
    stop_selectors=[
        'button[aria-label*="Stop"]',
        'button.stop',
        'button[aria-label*="stop response"]',
    ],
    timeout=120,
    submit_via_enter=True,
    emoji="✨",
    description=(
        "Hỏi Gemini (gemini.google.com — đã đăng nhập sẵn trong Chrome của user) "
        "và chờ lấy câu trả lời. Dùng AppleScript điều khiển Chrome — yêu cầu "
        "Chrome đã bật 'Allow JavaScript from Apple Events' (View > Developer). "
        "Tự quay về tab HAgent (localhost:3004) sau khi xong. Dùng khi user "
        "muốn dùng subscription Gemini Advanced đã trả tiền thay vì gọi API."
    ),
))
