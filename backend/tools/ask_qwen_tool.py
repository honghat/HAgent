"""Tool: ask Qwen (chat.qwen.ai) — uses logged-in Chrome session."""

from tools._browser_llm_base import LLMConfig, register_llm_tool


register_llm_tool(LLMConfig(
    name="ask_qwen",
    url_match=["chat.qwen.ai", "qwen.ai"],
    open_url="https://chat.qwen.ai/",
    input_selectors=[
        'textarea#chat-input',
        'textarea[placeholder*="Qwen"]',
        'textarea[placeholder*="qwen" i]',
        'textarea[placeholder*="问我"]',
        'textarea[placeholder*="问一下"]',
        'textarea[placeholder*="发消息"]',
        'textarea[placeholder*="How can I help"]',
        'textarea.chat-input',
        'textarea.input-textarea',
        'div.input-box textarea',
        'div[class*="chat-input"] textarea',
        'div[class*="ChatInput"] textarea',
        'footer textarea',
        'div[contenteditable="true"][role="textbox"]',
        'main form textarea:not([type="search"])',
    ],
    send_selectors=[
        'button#send-message-button',
        'button[aria-label="Send"]',
        'button[aria-label="发送"]',
        'button[aria-label*="Send message"]',
        'button[aria-label*="发送消息"]',
        'button[data-testid*="send"]',
        'div[role="button"][aria-label*="Send"]',
        'button.send-message-button',
        'button[type="submit"]',
        'form button[type="submit"]',
    ],
    msg_selectors=[
        'div.qwen-markdown',
        'div.markdown-content',
        'div.message-content-wrap',
        'div.message-content',
        'div.assistant-message',
        'div.chat-message-assistant',
        '[data-role="assistant"]',
        '[data-message-role="assistant"]',
        'div.message-item:not(.user)',
        'main [class*="assistant"]:not([class*="avatar"])',
        'main [class*="response"]',
        'main [class*="message-bubble"]',
    ],
    stop_selectors=[
        'button[aria-label*="Stop"]',
        'button[aria-label*="stop" i]',
        'button[aria-label*="停止"]',
        'button[aria-label*="中止"]',
        'button[data-testid*="stop"]',
        'div[role="button"][aria-label*="Stop"]',
        'button.stop-generating',
        'button.stop-generation',
        'main button:has(svg rect)',
    ],
    timeout=180,
    stable_polls_needed=4,
    emoji="🐦",
    description=(
        "Hỏi Qwen (chat.qwen.ai — đã đăng nhập sẵn trong Chrome của user) và "
        "chờ lấy câu trả lời. Dùng AppleScript điều khiển Chrome — yêu cầu "
        "Chrome đã bật 'Allow JavaScript from Apple Events'. Tự quay về tab "
        "HAgent (localhost:3004) sau khi xong. Dùng khi user muốn dùng Qwen "
        "qua subscription thay vì gọi API."
    ),
))
