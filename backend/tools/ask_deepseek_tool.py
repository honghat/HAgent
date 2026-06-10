"""Tool: ask DeepSeek (chat.deepseek.com) — uses logged-in Chrome session."""

from tools._browser_llm_base import LLMConfig, register_llm_tool


register_llm_tool(LLMConfig(
    name="ask_deepseek",
    url_match=["chat.deepseek.com", "deepseek.com"],
    open_url="https://chat.deepseek.com/",
    input_selectors=[
        'textarea#chat-input',
        'textarea[placeholder*="Message DeepSeek"]',
        'textarea[placeholder*="给 DeepSeek"]',
        'textarea[placeholder*="发送给 DeepSeek"]',
        'textarea[placeholder*="DeepSeek 发送"]',
        'div.chat-input-area textarea',
        'footer textarea',
        'div[class*="chat-input"] textarea',
        'div[class*="ChatInput"] textarea',
        'main form textarea:not([placeholder*="Search" i]):not([placeholder*="搜索"])',
    ],
    send_selectors=[
        'div[class*="chat-input"] div.ds-icon-button__hover-bg',
        'footer div.ds-icon-button__hover-bg',
        'div.ds-icon-button:has(svg) div.ds-icon-button__hover-bg',
        'div.ds-icon-button__hover-bg',
        'div[role="button"][aria-disabled="false"]:has(svg)',
        'button[aria-label*="Send message"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="发送"]',
        'div.chat-input-area div[role="button"]',
        'footer div[role="button"]',
        'button[type="submit"]',
    ],
    msg_selectors=[
        'div.ds-markdown',
        'div.markdown',
        '[data-role="assistant"]',
        'main [class*="assistant"]',
        'main [class*="response"]',
        'main [class*="message"]',
    ],
    stop_selectors=[
        'div[role="button"][aria-label*="Stop"]',
        'button[aria-label*="Stop"]',
        'button[aria-label*="停止"]',
    ],
    timeout=120,
    submit_via_enter=True,
    emoji="🐋",
    description=(
        "Hỏi DeepSeek (chat.deepseek.com — đã đăng nhập sẵn trong Chrome của "
        "user) và chờ lấy câu trả lời. Dùng AppleScript điều khiển Chrome — "
        "yêu cầu Chrome đã bật 'Allow JavaScript from Apple Events'. Tự quay "
        "về tab HAgent (localhost:3004) sau khi xong. Dùng khi user muốn dùng "
        "DeepSeek qua web thay vì gọi API."
    ),
))
