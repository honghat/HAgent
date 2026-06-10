"""Pre-LLM compression for large textual tool outputs.

This module trims low-value tokens before tool output is injected into the
model context:
- HTML to Markdown-ish text
- repeated-line dedupe
- long URL references inside prose
- head/tail truncation for very large text

Compression is enabled by default via ``HAGENT_TOKEN_COMPRESS=1``. Small
strings pass through unchanged.
"""
from __future__ import annotations

import os
import re
from typing import Any


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off", ""}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return max(0, value)


ENABLED = _env_bool("HAGENT_TOKEN_COMPRESS", True)
MIN_LEN = _env_int("HAGENT_TOKEN_COMPRESS_MIN_LEN", 2000)
MAX_LEN = _env_int("HAGENT_TOKEN_COMPRESS_MAX_LEN", 20000)
URL_MIN = _env_int("HAGENT_TOKEN_COMPRESS_URL_MIN", 60)

_URL_RE = re.compile(r"https?://[^\s\"'<>)\]]+")
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_MULTI_BLANK_RE = re.compile(r"\n{3,}")
_TRAILING_SPACE_RE = re.compile(r"[ \t]+\n")
_HTML_DETECT_RE = re.compile(r"<(html|body|div|p|h[1-6]|table|tr|td|article|section|nav)\b", re.I)

# Only these JSON keys are treated as model-facing prose. This avoids corrupting
# structured payload values such as URLs, file paths, IDs, and base64 blobs.
_TEXT_KEYS = {
    "body",
    "content",
    "html",
    "log",
    "markdown",
    "message",
    "output",
    "result",
    "stderr",
    "stdout",
    "summary",
    "text",
    "transcript",
}
_SKIP_KEYS = {
    "audio",
    "base64",
    "blob",
    "data_url",
    "file",
    "file_path",
    "id",
    "image",
    "image_url",
    "path",
    "source_url",
    "thumbnail",
    "token",
    "url",
    "video",
    "video_url",
}


def _key_name(key: Any) -> str:
    return str(key).strip().lower()


def _is_text_key(key: Any) -> bool:
    name = _key_name(key)
    if name in _SKIP_KEYS:
        return False
    if name in _TEXT_KEYS:
        return True
    return any(part in name for part in ("content", "markdown", "output", "summary", "text"))


def _looks_like_html(text: str) -> bool:
    return bool(_HTML_DETECT_RE.search(text[:6000]))


def _html_to_md(text: str) -> str:
    text = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", "", text, flags=re.I | re.S)
    text = re.sub(r"<h1[^>]*>(.*?)</h1>", r"\n\n# \1\n", text, flags=re.I | re.S)
    text = re.sub(r"<h2[^>]*>(.*?)</h2>", r"\n\n## \1\n", text, flags=re.I | re.S)
    text = re.sub(r"<h3[^>]*>(.*?)</h3>", r"\n\n### \1\n", text, flags=re.I | re.S)
    text = re.sub(r"<li[^>]*>(.*?)</li>", r"- \1\n", text, flags=re.I | re.S)
    text = re.sub(r"<a[^>]*href=\"([^\"]+)\"[^>]*>(.*?)</a>", r"[\2](\1)", text, flags=re.I | re.S)
    text = re.sub(r"<br[^>]*>", "\n", text, flags=re.I)
    text = re.sub(r"</p>", "\n\n", text, flags=re.I)
    text = _HTML_TAG_RE.sub("", text)
    return (
        text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )


def _dedupe_lines(text: str) -> str:
    out: list[str] = []
    prev: str | None = None
    for line in text.split("\n"):
        stripped = line.strip()
        if stripped and stripped == prev:
            continue
        out.append(line)
        prev = stripped or None
    return "\n".join(out)


def _shorten_urls(text: str) -> tuple[str, list[str]]:
    seen: dict[str, int] = {}
    refs: list[str] = []

    def replace(match: re.Match[str]) -> str:
        url = match.group(0)
        if len(url) <= URL_MIN:
            return url
        if url not in seen:
            seen[url] = len(refs) + 1
            refs.append(url)
        return f"[link{seen[url]}]"

    return _URL_RE.sub(replace, text), refs


def _head_tail_truncate(text: str, max_len: int) -> str:
    if max_len <= 0 or len(text) <= max_len:
        return text
    marker = f"\n\n[... shortened {len(text) - max_len} chars ...]\n\n"
    head_len = max(0, (max_len - len(marker)) // 2)
    tail_len = max(0, max_len - len(marker) - head_len)
    return f"{text[:head_len]}{marker}{text[-tail_len:] if tail_len else ''}"


def compress(text: str, *, min_len: int | None = None, max_len: int | None = None) -> str:
    """Compress one text string, returning the original when disabled or short."""
    if not ENABLED or not isinstance(text, str) or not text:
        return text
    threshold = MIN_LEN if min_len is None else min_len
    if len(text) < threshold:
        return text

    out = _html_to_md(text) if _looks_like_html(text) else text
    out = _TRAILING_SPACE_RE.sub("\n", out)
    out = _MULTI_BLANK_RE.sub("\n\n", out)
    out = _dedupe_lines(out)
    out, refs = _shorten_urls(out)
    out = _head_tail_truncate(out, MAX_LEN if max_len is None else max_len)

    if refs:
        ref_block = "\n".join(f"[link{i + 1}]: {url}" for i, url in enumerate(refs))
        out = f"{out.rstrip()}\n\n{ref_block}"
    return out.strip()


def compress_payload(payload: Any, *, _parent_key: Any = None) -> Any:
    """Compress prose-like fields in dict/list payloads without changing shape."""
    if not ENABLED:
        return payload
    if isinstance(payload, str):
        if _parent_key is None or _is_text_key(_parent_key):
            return compress(payload)
        return payload
    if isinstance(payload, dict):
        return {key: compress_payload(value, _parent_key=key) for key, value in payload.items()}
    if isinstance(payload, list):
        return [compress_payload(item, _parent_key=_parent_key) for item in payload]
    return payload


def stats(original: str, compressed: str) -> dict[str, int]:
    return {
        "original_chars": len(original),
        "compressed_chars": len(compressed),
        "saved_chars": max(0, len(original) - len(compressed)),
        "ratio_pct": round(100 * (1 - len(compressed) / max(1, len(original)))),
    }


if __name__ == "__main__":
    html = """
    <html><body>
    <h1>Title</h1>
    <p>Some text with <a href="https://example.com/very/long/path/that/exceeds/threshold/here">link</a>.</p>
    <p>Some text with <a href="https://example.com/very/long/path/that/exceeds/threshold/here">link</a>.</p>
    <ul><li>Item 1</li><li>Item 2</li></ul>
    <script>tracker();</script>
    """ * 50
    out = compress(html, min_len=100, max_len=2000)
    print(f"{len(html)} -> {len(out)} ({stats(html, out)})")
    print("---")
    print(out[:500])
