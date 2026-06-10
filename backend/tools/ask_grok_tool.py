"""Tool: ask Grok (grok.com) — uses logged-in Chrome session."""

from tools._browser_llm_base import LLMConfig, register_llm_tool


register_llm_tool(LLMConfig(
    name="ask_grok",
    url_match=["grok.com"],
    open_url="https://grok.com/",
    input_selectors=[
        'textarea[aria-label="Ask Grok anything"]',
        'textarea[aria-label*="Ask Grok"]',
        'textarea[placeholder*="Grok"]',
        'textarea[placeholder*="Ask"]',
        'div[contenteditable="true"][data-lexical-editor="true"]',
        'div[contenteditable="true"]',
        'main textarea',
        'textarea',
    ],
    send_selectors=[
        'button[aria-label="Submit"]',
        'button[aria-label="Send message"]',
        'button[aria-label*="Send"]',
        'button[data-testid="send-button"]',
        'button[data-testid*="submit"]',
        'button[type="submit"]',
        'form button[type="submit"]',
    ],
    msg_selectors=[
        'div.response-content-markdown',
        'div.response-content',
        'div.message-bubble.assistant div.markdown',
        'div.message-bubble.assistant div.prose',
        'div[class*="message-bubble"][class*="assistant"]',
        '[data-message-author-role="assistant"] .markdown',
        '[data-message-author-role="assistant"]',
        'article[data-message-author-role="assistant"]',
        'div.message.assistant',
        'main div.prose',
        'main [class*="response"][class*="content"]',
    ],
    stop_selectors=[
        'button[aria-label="Stop generating"]',
        'button[aria-label*="Stop generating"]',
        'button[aria-label*="Stop"]',
        'button[aria-label*="stop"]',
        'button[data-testid="stop-button"]',
        'button[data-testid*="stop"]',
        'button[aria-label*="Cancel"]',
        'main button:has(svg[data-icon="stop"])',
        'main button:has(rect)',
    ],
    timeout=180,
    in_progress_patterns=[
        r"^\d+\s*sources?\s*$",
        r"^\d+\s*nguồn\s*$",
        r"^thinking\b",
        r"^analyzing\b",
        r"^researching\b",
        r"^searching\b",
        r"^reading\b",
        r"^deepsearch\b",
        r"^working\b",
        r"^browsing\b",
        r"^found\s+\d+\s+(results?|sources?)",
        r"^reasoning\b",
    ],
    min_text_length=30,
    stable_polls_needed=2,
    emoji="🦾",
    description=(
        "Hỏi Grok (grok.com — đã đăng nhập sẵn trong Chrome của user) và chờ "
        "lấy câu trả lời. Dùng AppleScript điều khiển Chrome — yêu cầu Chrome "
        "đã bật 'Allow JavaScript from Apple Events'. Tự quay về tab HAgent "
        "(localhost:3004) sau khi xong. Dùng khi user muốn dùng subscription "
        "Grok đã trả tiền thay vì gọi API."
    ),
))
