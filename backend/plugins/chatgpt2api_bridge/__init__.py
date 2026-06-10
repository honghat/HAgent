"""ChatGPT2API proxy bridge cho HAgent.

Gọi proxy native (basketikun/chatgpt2api) ở http://127.0.0.1:3011,
KHÔNG tự gọi ChatGPT (Cloudflare/POW chặn).
"""

from .bridge import ChatGPT2APIBridge, ChatGPT2APIProxy, bridge

__all__ = ["ChatGPT2APIBridge", "ChatGPT2APIProxy", "bridge"]
