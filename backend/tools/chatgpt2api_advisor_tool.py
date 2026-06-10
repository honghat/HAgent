"""Tool: ask_chatgpt2api — hỏi ChatGPT qua proxy chatgpt2api local (port 3011).

Khác với ask_chatgpt (điều khiển Chrome qua AppleScript), tool này gọi thẳng
HTTP API → nhanh hơn ~10x, không cần Chrome bật, không cần AppleScript
permission. Dùng làm "model giáo sư" cho coding agent.

Dùng khi executor (Claude/Pekpik) cần xin tư vấn từ ChatGPT cho:
- Refactor code phức tạp
- Debug bug khó
- Đề xuất kiến trúc
- Review code, lý luận sâu
"""

from __future__ import annotations

import os

import httpx

from tools.registry import registry, tool_error, tool_result


PROXY_BASE = os.environ.get("CHATGPT2API_BASE_URL", "http://127.0.0.1:3011").rstrip("/")
PROXY_KEY = os.environ.get("CHATGPT2API_AUTH_KEY") or "chatgpt2api"
DEFAULT_MODEL = os.environ.get("CHATGPT2API_ADVISOR_MODEL", "gpt-5-mini")

ADVISOR_SYSTEM = (
    "Bạn là 'giáo sư' — chuyên gia đưa lời khuyên ngắn gọn, có cấu trúc, "
    "thực dụng cho lập trình viên đang triển khai code thực tế. "
    "Trả lời tiếng Việt, súc tích, có ví dụ code khi cần. "
    "Không hỏi lại, không giáo điều — đưa hướng đi cụ thể nhất có thể "
    "dựa trên context được cung cấp."
)


def ask_chatgpt2api(args, **kwargs):
    question = (args.get("question") or "").strip()
    if not question:
        return tool_error("Missing 'question'")

    context = (args.get("context") or "").strip()
    model = (args.get("model") or DEFAULT_MODEL).strip()
    timeout = int(args.get("timeout") or 120)

    user_content = question if not context else f"{question}\n\n--- CONTEXT ---\n{context}"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": ADVISOR_SYSTEM},
            {"role": "user", "content": user_content},
        ],
        "stream": False,
    }

    try:
        with httpx.Client(timeout=timeout) as client:
            r = client.post(
                f"{PROXY_BASE}/v1/chat/completions",
                json=payload,
                headers={
                    "Authorization": f"Bearer {PROXY_KEY}",
                    "Content-Type": "application/json",
                },
            )
    except httpx.ConnectError:
        return tool_error(
            f"Không kết nối được proxy chatgpt2api ở {PROXY_BASE}. "
            "Khởi động: cd ~/HAgent/projects/chatgpt2api && "
            ".venv/bin/python -m uvicorn 'api:create_app' --factory --port 3011"
        )
    except Exception as exc:
        return tool_error(f"Proxy request failed: {exc}")

    if not r.is_success:
        return tool_error(f"Proxy HTTP {r.status_code}: {r.text[:300]}")

    data = r.json()
    choices = data.get("choices") or []
    if not choices:
        return tool_error("Proxy trả response rỗng (choices=[])")

    content = (choices[0].get("message") or {}).get("content") or ""
    if not content.strip():
        return tool_error(
            f"Model {model} trả content rỗng. Thử model khác như 'gpt-5-3-mini' hoặc 'auto'."
        )

    usage = data.get("usage") or {}
    return tool_result({
        "answer": content.strip(),
        "model": model,
        "tokens_in": usage.get("prompt_tokens"),
        "tokens_out": usage.get("completion_tokens"),
    })


registry.register(
    name="ask_chatgpt2api",
    toolset="delegation",
    schema={
        "name": "ask_chatgpt2api",
        "description": (
            "Hỏi ChatGPT qua proxy local chatgpt2api (port 3011) để xin tư vấn "
            "khi gặp task khó. Dùng làm 'model giáo sư' cho executor (Claude/Pekpik) "
            "khi cần lý luận sâu: refactor lớn, debug phức tạp, kiến trúc, review. "
            "KHÔNG cần Chrome — gọi HTTP trực tiếp, nhanh ~5s/lượt. "
            "Sau khi nhận answer, EXECUTOR phải tự thi hành (read/patch/bash), "
            "không paste text suông cho user."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "Câu hỏi cụ thể cần ChatGPT tư vấn.",
                },
                "context": {
                    "type": "string",
                    "description": "Optional: code/file content/error trace để ChatGPT hiểu ngữ cảnh.",
                },
                "model": {
                    "type": "string",
                    "description": "Model id (mặc định gpt-5-mini). Chọn 'gpt-5-3-mini' hoặc 'auto' nếu mini không trả.",
                },
                "timeout": {
                    "type": "integer",
                    "description": "Giây tối đa chờ trả lời (mặc định 120).",
                },
            },
            "required": ["question"],
        },
    },
    handler=ask_chatgpt2api,
    description="Hỏi ChatGPT qua proxy chatgpt2api local — model giáo sư cho executor.",
    emoji="🎓",
)
