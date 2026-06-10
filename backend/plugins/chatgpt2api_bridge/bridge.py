"""ChatGPT2API proxy client.

HAgent KHÔNG tự gọi ChatGPT (Cloudflare/POW chặn).
Bridge này gọi proxy `chatgpt2api` đang chạy native ở 127.0.0.1:3011
(repo basketikun/chatgpt2api, khởi bằng `uv run main.py`).

Account pool & quota do proxy quản lý — HAgent chỉ là caller.
"""

from __future__ import annotations

import base64
import logging
import os
from pathlib import Path
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "http://127.0.0.1:3011"
DEFAULT_AUTH_KEY = "chatgpt2api"


def _base_url() -> str:
    url = os.environ.get("CHATGPT2API_BASE_URL")
    if url and url.strip():
        return url.strip().rstrip("/")
    return DEFAULT_BASE_URL


def _auth_key() -> str:
    return os.environ.get("CHATGPT2API_AUTH_KEY") or DEFAULT_AUTH_KEY


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {_auth_key()}",
        "Content-Type": "application/json",
    }


def _anonymize(token: str) -> str:
    return token[:8] + "..." if token and len(token) > 12 else "***"


# ---------------------------------------------------------------------------
# Proxy client
# ---------------------------------------------------------------------------


class ChatGPT2APIProxy:
    """Thin client cho proxy chatgpt2api."""

    def __init__(self, base_url: Optional[str] = None, auth_key: Optional[str] = None):
        self.base_url = (base_url or _base_url()).rstrip("/")
        self.auth_key = auth_key or _auth_key()

    # ---- Health ----

    def health(self) -> dict:
        try:
            with httpx.Client(timeout=3) as c:
                r = c.get(f"{self.base_url}/v1/models", headers=self._h())
            return {"reachable": r.is_success, "status": r.status_code}
        except Exception as exc:
            return {"reachable": False, "error": str(exc)}

    def _h(self) -> dict:
        return {"Authorization": f"Bearer {self.auth_key}"}

    # ---- Accounts ----

    def list_accounts(self) -> list[dict]:
        try:
            with httpx.Client(timeout=10) as c:
                r = c.get(f"{self.base_url}/api/accounts", headers=self._h())
            if not r.is_success:
                return []
            data = r.json()
            items = data.get("items") if isinstance(data, dict) else data
            return items if isinstance(items, list) else []
        except Exception as exc:
            logger.warning("list_accounts failed: %s", exc)
            return []

    def import_account(
        self, access_token: str, refresh_token: str = "", email_hint: str = ""
    ) -> dict:
        token = (access_token or "").strip()
        if not token:
            return {"success": False, "message": "Empty access_token"}
        payload: dict[str, Any] = {"tokens": [token]}
        try:
            with httpx.Client(timeout=30) as c:
                r = c.post(
                    f"{self.base_url}/api/accounts",
                    json=payload,
                    headers={**self._h(), "Content-Type": "application/json"},
                )
            ok = r.is_success
            return {
                "success": ok,
                "method": "proxy",
                "total_accounts": len(self.list_accounts()),
                "message": "Imported" if ok else r.text[:300],
            }
        except Exception as exc:
            return {"success": False, "message": str(exc)}

    def remove(self, token_prefix: str) -> bool:
        token_prefix = (token_prefix or "").strip()
        if not token_prefix:
            return False
        accts = self.list_accounts()
        match = next(
            (a for a in accts if str(a.get("access_token", "")).startswith(token_prefix)),
            None,
        )
        if not match:
            return False
        try:
            with httpx.Client(timeout=15) as c:
                r = c.request(
                    "DELETE",
                    f"{self.base_url}/api/accounts",
                    json={"tokens": [match["access_token"]]},
                    headers={**self._h(), "Content-Type": "application/json"},
                )
            return r.is_success
        except Exception as exc:
            logger.warning("remove failed: %s", exc)
            return False

    # ---- Image generation ----

    def generate_image(
        self, prompt: str, size: str = "1024x1024", model: str = "gpt-image-2"
    ) -> dict:
        payload = {
            "model": model,
            "prompt": prompt,
            "size": size,
            "n": 1,
            "response_format": "b64_json",
        }
        try:
            with httpx.Client(timeout=300) as c:
                r = c.post(
                    f"{self.base_url}/v1/images/generations",
                    json=payload,
                    headers={**self._h(), "Content-Type": "application/json"},
                )
        except httpx.ConnectError:
            return {
                "success": False,
                "error": (
                    f"Không kết nối được proxy chatgpt2api ở {self.base_url}. "
                    "Chạy: cd ~/HAgent/projects/chatgpt2api && "
                    "nohup .venv/bin/python -m uvicorn 'api:create_app' "
                    "--factory --port 3011 > /tmp/cgi2api.log 2>&1 &"
                ),
                "error_type": "connection_error",
            }
        except Exception as exc:
            return {
                "success": False,
                "error": f"Proxy request failed: {exc}",
                "error_type": "api_error",
            }

        if not r.is_success:
            return {
                "success": False,
                "error": f"Proxy HTTP {r.status_code}: {r.text[:300]}",
                "error_type": "api_error",
            }

        data = r.json()
        items = data.get("data") or []
        if not items:
            return {
                "success": False,
                "error": "Proxy returned no image data",
                "error_type": "empty_response",
            }

        first = items[0]
        b64 = first.get("b64_json")
        url = first.get("url")

        if b64:
            try:
                from agent.image_gen_provider import save_b64_image

                saved = save_b64_image(b64, prefix=f"chatgpt2api_{model}")
                return {
                    "success": True,
                    "image": str(saved),
                    "model": model,
                    "provider": "chatgpt2api",
                }
            except Exception as exc:
                return {
                    "success": False,
                    "error": f"Save image failed: {exc}",
                    "error_type": "io_error",
                }

        if url:
            # URL trỏ về proxy → tải về cache để frontend phục vụ qua /api/photo/file/...
            try:
                with httpx.Client(timeout=60) as c:
                    img = c.get(url, headers=self._h())
                if not img.is_success:
                    return {
                        "success": False,
                        "error": f"Cannot fetch image url: HTTP {img.status_code}",
                        "error_type": "api_error",
                    }
                from agent.image_gen_provider import save_b64_image

                saved = save_b64_image(
                    base64.b64encode(img.content).decode(),
                    prefix=f"chatgpt2api_{model}",
                )
                return {
                    "success": True,
                    "image": str(saved),
                    "model": model,
                    "provider": "chatgpt2api",
                }
            except Exception as exc:
                return {
                    "success": False,
                    "error": f"Fetch url failed: {exc}",
                    "error_type": "api_error",
                }

        return {
            "success": False,
            "error": "Response thiếu cả b64_json lẫn url",
            "error_type": "empty_response",
        }


# ---------------------------------------------------------------------------
# Façade — giữ tương thích với router/photo.py cũ
# ---------------------------------------------------------------------------


class _PoolFacade:
    """Compat layer cho `bridge.pool.remove(...)` / `count()` v.v."""

    def __init__(self, proxy: ChatGPT2APIProxy):
        self._proxy = proxy

    def remove(self, token_prefix: str) -> bool:
        return self._proxy.remove(token_prefix)

    def count(self) -> int:
        return len(self._proxy.list_accounts())


class ChatGPT2APIBridge:
    """Façade cho HAgent — mỏng, ủy quyền cho ChatGPT2APIProxy."""

    def __init__(self, base_url: Optional[str] = None, auth_key: Optional[str] = None):
        self._proxy = ChatGPT2APIProxy(base_url, auth_key)
        self.pool = _PoolFacade(self._proxy)

    # Account ops
    def import_account(
        self, access_token: str, refresh_token: str = "", email_hint: str = ""
    ) -> dict:
        return self._proxy.import_account(access_token, refresh_token, email_hint)

    def list_accounts(self) -> list[dict]:
        items = self._proxy.list_accounts()
        out: list[dict] = []
        for a in items:
            tok = str(a.get("access_token", ""))
            quota = a.get("quota")
            if isinstance(a.get("limits_progress"), list):
                for lim in a["limits_progress"]:
                    if lim.get("feature_name") == "image_gen":
                        quota = lim.get("remaining", quota)
                        break
            out.append(
                {
                    "email": a.get("email", ""),
                    "user_id": a.get("user_id", ""),
                    "type": a.get("type", "free"),
                    "status": a.get("status", "正常"),
                    "token_prefix": _anonymize(tok),
                    "quota": quota,
                    "exp_seconds": 0,
                    "restore_at": a.get("restore_at"),
                    "last_used_at": a.get("last_used_at"),
                }
            )
        return out

    # Image gen
    def generate_image(
        self, prompt: str, size: str = "1024x1024", model: str = "gpt-image-2"
    ) -> dict:
        return self._proxy.generate_image(prompt, size, model)

    # Health
    def verify_setup(self) -> dict:
        h = self._proxy.health()
        accts = self._proxy.list_accounts()
        return {
            "accounts_count": len(accts),
            "has_available": any(a.get("status") in ("正常", "限流") for a in accts),
            "proxy_base_url": self._proxy.base_url,
            "proxy_reachable": h.get("reachable", False),
        }

    def verify_token_health(self, token: str = "") -> dict:
        h = self._proxy.health()
        return {
            "valid": h.get("reachable", False),
            "token_preview": _anonymize(token) if token else "(proxy)",
        }


bridge = ChatGPT2APIBridge()
