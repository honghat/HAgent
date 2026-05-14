import json
import anthropic
from typing import Optional
from config import ANTHROPIC_API_KEY, CLAUDE_MODEL

async def llm(system: str, user: str, json_mode: bool = False) -> str:
    """Wrapper chuẩn cho Claude API."""
    if not ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY not configured in .env")

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    # Thêm hướng dẫn JSON nếu json_mode=True
    if json_mode and "JSON" not in system.upper():
        system += "\nOutput must be a valid JSON object."

    response = await client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=4000,
        system=system,
        messages=[
            {"role": "user", "content": user}
        ]
    )

    content = response.content[0].text

    if json_mode:
        # Đôi khi Claude thêm text giải thích, ta cần trích xuất JSON
        try:
            start = content.find('{')
            end = content.rfind('}') + 1
            if start != -1 and end > 0:
                return content[start:end]
        except:
            pass

    return content
