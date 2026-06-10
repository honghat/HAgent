"""Tool: image_chatgpt2api — tạo ảnh qua proxy chatgpt2api (gpt-image-2/gpt-5).

Wrapper mỏng quanh `plugins.chatgpt2api_bridge.bridge.generate_image`. Khác với
`image_generate` chung (route theo provider config), tool này LUÔN ép qua
chatgpt2api proxy ở 127.0.0.1:3011 dùng tài khoản ChatGPT Plus đã import.

Dùng khi user muốn dạng vẽ kiểu ChatGPT (gpt-image-2, gpt-5 image series)
không phụ thuộc ComfyUI/Fal.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from tools.registry import registry, tool_error, tool_result

logger = logging.getLogger(__name__)


SIZE_MAP = {
    "landscape": "1536x1024",
    "16:9": "1536x1024",
    "wide": "1536x1024",
    "square": "1024x1024",
    "1:1": "1024x1024",
    "portrait": "1024x1536",
    "9:16": "1024x1536",
    "tall": "1024x1536",
}


def _resolve_size(size: str) -> str:
    if not size:
        return "1024x1024"
    s = size.strip().lower()
    if s in SIZE_MAP:
        return SIZE_MAP[s]
    if "x" in s and all(p.isdigit() for p in s.split("x")):
        return s
    return "1024x1024"


def image_chatgpt2api(args: dict, **kwargs: Any) -> dict:
    prompt = (args.get("prompt") or "").strip()
    if not prompt:
        return tool_error("Missing 'prompt'")

    size = _resolve_size(args.get("size") or args.get("aspect_ratio") or "square")
    model = (args.get("model") or "gpt-image-2").strip()

    try:
        from plugins.chatgpt2api_bridge import bridge
    except Exception as exc:
        return tool_error(f"chatgpt2api_bridge không nạp được: {exc}")

    try:
        result = bridge.generate_image(prompt=prompt, size=size, model=model)
    except Exception as exc:
        logger.exception("bridge.generate_image failed")
        return tool_error(f"Bridge error: {exc}")

    if not result.get("success"):
        return tool_error(result.get("error") or "Generation failed")

    image_path = result.get("image") or ""
    return tool_result({
        "image_path": image_path,
        "image_name": Path(image_path).name if image_path else "",
        "model": result.get("model") or model,
        "size": size,
        "prompt": prompt,
        "provider": "chatgpt2api",
    })


registry.register(
    name="image_chatgpt2api",
    toolset="image_gen",
    schema={
        "name": "image_chatgpt2api",
        "description": (
            "Tạo ảnh qua proxy chatgpt2api (port 3011) dùng tài khoản ChatGPT "
            "Plus đã import. Khác image_generate chung — tool này LUÔN ép "
            "đường chatgpt2api, không phụ thuộc provider config. Dùng khi user "
            "muốn ảnh phong cách ChatGPT (gpt-image-2, gpt-5 series) hoặc khi "
            "muốn dùng quota ChatGPT thay vì credit Fal/ComfyUI. "
            "Kết quả trả về image_path nằm trong $HAGENT_HOME/cache/images/."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Mô tả ảnh muốn tạo.",
                },
                "size": {
                    "type": "string",
                    "description": (
                        "Kích thước/aspect: 'square'/'1:1' (1024x1024, mặc định), "
                        "'landscape'/'16:9' (1536x1024), 'portrait'/'9:16' "
                        "(1024x1536), hoặc string '<W>x<H>' tuỳ ý."
                    ),
                },
                "model": {
                    "type": "string",
                    "description": (
                        "Model id chatgpt2api: 'gpt-image-2' (default), 'gpt-5', "
                        "'gpt-5-1', 'gpt-5-2', 'gpt-5-3', 'gpt-5-3-mini', "
                        "'gpt-5-mini', 'codex-gpt-image-2', 'auto'."
                    ),
                },
            },
            "required": ["prompt"],
        },
    },
    handler=image_chatgpt2api,
    description="Tạo ảnh qua proxy chatgpt2api (ép dùng tài khoản ChatGPT Plus).",
    emoji="🎨",
)
