"""
Account Pool — local JSON-backed storage for ChatGPT access tokens.

Replaces the ChatGPT2API Docker account pool with a flat-file JSON store
that the bridge and plugin can both read/write without any external service.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from hagent_constants import get_token_file_path

logger = logging.getLogger(__name__)

ACCOUNTS_FILE = get_token_file_path("chatgpt2api_accounts.json")


# ---------------------------------------------------------------------------
# Account helpers
# ---------------------------------------------------------------------------


def _ensure_file():
    ACCOUNTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not ACCOUNTS_FILE.exists():
        ACCOUNTS_FILE.write_text("[]")


def _read() -> List[Dict[str, Any]]:
    _ensure_file()
    try:
        return json.loads(ACCOUNTS_FILE.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Corrupt accounts file, resetting: %s", exc)
        ACCOUNTS_FILE.write_text("[]")
        return []


def _write(accounts: List[Dict[str, Any]]) -> None:
    ACCOUNTS_FILE.write_text(
        json.dumps(accounts, indent=2, ensure_ascii=False)
    )


def import_account(
    access_token: str,
    refresh_token: str = "",
    email_hint: str = "",
) -> Dict[str, Any]:
    accounts = _read()
    now = datetime.now(timezone.utc).isoformat()

    # De-duplicate by token prefix (first 24 chars)
    prefix = access_token[:24]
    accounts = [a for a in accounts if not a.get("token", "").startswith(prefix)]

    accounts.append({
        "token": access_token,
        "refresh_token": refresh_token,
        "email_hint": email_hint,
        "imported_at": now,
        "last_used_at": None,
        "status": "active",
        "quota_remaining": None,
        "recovery_at": None,
    })

    _write(accounts)
    logger.info("Account imported (pool size: %d)", len(accounts))

    return {
        "success": True,
        "total_accounts": len(accounts),
    }


def list_accounts() -> List[Dict[str, Any]]:
    accounts = _read()
    return [
        {
            "email_hint": a.get("email_hint", ""),
            "imported_at": a.get("imported_at", ""),
            "last_used_at": a.get("last_used_at"),
            "token_prefix": a.get("token", "")[:12] + "...",
            "status": a.get("status", "active"),
            "quota_remaining": a.get("quota_remaining"),
            "recovery_at": a.get("recovery_at"),
            "is_active": a.get("status", "active") == "active",
        }
        for a in accounts
        if a.get("token")
    ]


def get_next_account() -> Optional[Dict[str, Any]]:
    """Return the next usable account.

    Skip rate-limited (until recovery_at passes) and invalid accounts.
    Round-robin via oldest last_used_at among the rest.
    """
    accounts = _read()
    now = datetime.now(timezone.utc).isoformat()

    # Auto-clear expired rate-limit
    changed = False
    for a in accounts:
        if a.get("status") == "rate_limited" and a.get("recovery_at"):
            if a["recovery_at"] <= now:
                a["status"] = "active"
                a["recovery_at"] = None
                changed = True
    if changed:
        _write(accounts)

    valid = [
        a for a in accounts
        if a.get("token") and a.get("status", "active") == "active"
    ]
    if not valid:
        return None

    best = min(valid, key=lambda a: a.get("last_used_at") or "1970-01-01")

    for a in accounts:
        if a.get("token") == best.get("token"):
            a["last_used_at"] = now
            break
    _write(accounts)

    return best


def mark_rate_limited(token_prefix: str, recovery_seconds: int = 3600) -> bool:
    """Mark account as rate-limited until now + recovery_seconds."""
    from datetime import timedelta
    accounts = _read()
    until = (datetime.now(timezone.utc) + timedelta(seconds=int(recovery_seconds))).isoformat()
    hit = False
    for a in accounts:
        if a.get("token", "").startswith(token_prefix):
            a["status"] = "rate_limited"
            a["recovery_at"] = until
            hit = True
    if hit:
        _write(accounts)
    return hit


def mark_invalid(token_prefix: str) -> bool:
    """Mark account as invalid (auto-evict on 401)."""
    accounts = _read()
    before = len(accounts)
    accounts = [a for a in accounts if not a.get("token", "").startswith(token_prefix)]
    _write(accounts)
    return len(accounts) < before


def remove_account(token_prefix: str) -> bool:
    accounts = _read()
    before = len(accounts)
    accounts = [a for a in accounts if not a.get("token", "").startswith(token_prefix)]
    _write(accounts)
    return len(accounts) < before


def total_accounts() -> int:
    return len(_read())


# ---------------------------------------------------------------------------
# Direct ChatGPT API call (no proxy / no Docker)
# ---------------------------------------------------------------------------


def call_chatgpt_image_api(
    prompt: str,
    size: str = "1024x1024",
    model: str = "gpt-image-2",
) -> Dict[str, Any]:
    """
    Call the ChatGPT backend-api directly using an access token from the pool.

    This hits ``https://chatgpt.com/backend-api/imggen/...`` directly,
    exactly like the browser does, but with a raw HTTP call.

    Returns the same shape as the provider ``generate()`` expects.
    """
    import httpx

    account = get_next_account()
    if account is None:
        return {
            "success": False,
            "error": "No ChatGPT account available. Import an access token first.",
            "error_type": "no_account",
        }

    token = account["token"]
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "*/*",
        "Origin": "https://chatgpt.com",
        "Referer": "https://chatgpt.com/",
    }

    payload = {
        "prompt": prompt,
        "model": model,
        "size": size,
        "n": 1,
    }

    try:
        with httpx.Client(timeout=180) as client:
            resp = client.post(
                "https://chatgpt.com/backend-api/imggen2",
                json=payload,
                headers=headers,
            )
            # Debug: log response shape
            logger.info(
                "ChatGPT image gen: status=%d, headers=%s, body=%s",
                resp.status_code,
                dict(resp.headers),
                resp.text[:500],
            )
            resp.raise_for_status()
            data = resp.json()

        # ChatGPT backend-api returns images differently from OpenAI format
        # It usually has a "data" key with list of { "b64_json": ... }
        images = data.get("data", data.get("images", []))
        if not images:
            return {
                "success": False,
                "error": "ChatGPT returned empty image data",
                "error_type": "empty_response",
            }

        first = images[0]
        b64 = first.get("b64_json") or first.get("image") or first.get("data")
        url = first.get("url") or first.get("src")

        if b64:
            from agent.image_gen_provider import save_b64_image
            saved = save_b64_image(b64, prefix="chatgpt2api_direct")
            return {"success": True, "image": str(saved)}
        elif url:
            return {"success": True, "image": url}
        else:
            return {
                "success": False,
                "error": "Unexpected response shape from ChatGPT API",
                "error_type": "api_error",
                "raw": str(data)[:500],
            }

    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        prefix = token[:24]
        if status in (401, 403):
            mark_invalid(prefix)
        elif status == 429:
            retry_after = 3600
            try:
                ra = exc.response.headers.get("Retry-After")
                if ra:
                    retry_after = int(float(ra))
            except Exception:
                pass
            mark_rate_limited(prefix, retry_after)
        return {
            "success": False,
            "error": f"ChatGPT API HTTP {status}",
            "error_type": "api_error",
            "detail": exc.response.text[:500],
        }
    except httpx.ConnectError:
        return {
            "success": False,
            "error": "Cannot connect to chatgpt.com — check your network",
            "error_type": "connection_error",
        }
    except Exception as exc:
        return {
            "success": False,
            "error": f"ChatGPT direct call failed: {exc}",
            "error_type": "api_error",
        }
