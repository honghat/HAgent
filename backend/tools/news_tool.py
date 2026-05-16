"""News tools ported from JS: VnExpress, DanTri."""

import re
from typing import Dict, Any
import aiohttp
from .registry import registry

VNEXPRESS_URL = "https://vnexpress.net/"
DANTRI_URL = "https://dantri.com.vn/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
}


async def _fetch_vnexpress():
    try:
        async with aiohttp.ClientSession(headers=HEADERS) as s:
            async with s.get(VNEXPRESS_URL, timeout=aiohttp.ClientTimeout(total=10)) as r:
                html = await r.text()
    except Exception:
        return "Khong the lay tin tuc tu VnExpress."
    articles = []
    seen = set()
    for m in re.finditer(r'<article[^>]*>.*?<\/article>', html, re.DOTALL):
        block = m.group()
        link = re.search(r'href="(https://vnexpress\.net/[^"]+)"[^>]*>(.*?)<\/a>', block, re.DOTALL)
        if not link:
            continue
        url = link.group(1)
        if url in seen:
            continue
        seen.add(url)
        title = re.sub(r'<[^>]*>', '', link.group(2)).strip()
        if not title or len(title) < 10:
            continue
        desc = re.search(r'<p[^>]*class="[^"]*description[^"]*"[^>]*>(.*?)<\/p>', block, re.DOTALL)
        snippet = re.sub(r'<[^>]*>', '', desc.group(1)).strip() if desc else ""
        cat = ""
        cm = re.search(r'<span[^>]*class="[^"]*location[^"]*"[^>]*>(.*?)<\/span>', block, re.DOTALL)
        if cm:
            cat = re.sub(r'<[^>]*>', '', cm.group(1)).strip()
        articles.append(f"{len(articles)+1}. **{title}**{f' [{cat}]' if cat else ''}\n   {url}{chr(10) + '   ' + snippet if snippet else ''}")
        if len(articles) >= 20:
            break

    if not articles:
        for m in re.finditer(r'<a[^>]*href="(https://vnexpress\.net/[^"]+)"[^>]*>.*?<\/a>', html, re.DOTALL):
            url = m.group(1)
            if url in seen:
                continue
            seen.add(url)
            text = re.sub(r'<[^>]*>', '', m.group()).strip()
            if not text or len(text) < 15:
                continue
            articles.append(f"{len(articles)+1}. **{text}**\n   {url}")
            if len(articles) >= 15:
                break

    if not articles:
        return "Khong the lay tin tuc tu VnExpress."
    return "\n\n".join(articles)


async def _fetch_dantri():
    try:
        async with aiohttp.ClientSession(headers=HEADERS) as s:
            async with s.get(DANTRI_URL, timeout=aiohttp.ClientTimeout(total=10)) as r:
                html = await r.text()
    except Exception:
        return "Khong the lay tin tuc tu Dan tri."
    articles = []
    seen = set()
    for m in re.finditer(r'<a[^>]*href="(https://dantri\.com\.vn/[^"]+)"[^>]*>.*?<\/a>', html, re.DOTALL):
        url = m.group(1)
        if url in seen:
            continue
        seen.add(url)
        text = re.sub(r'<[^>]*>', '', m.group()).strip()
        if not text or len(text) < 15:
            continue
        articles.append(f"{len(articles)+1}. **{text}**\n   {url}")
        if len(articles) >= 20:
            break

    if not articles:
        return "Khong the lay tin tuc tu Dan tri."
    return "\n\n".join(articles)


async def _handle_get_vnexpress_news(args: Dict[str, Any], **kwargs) -> str:
    return await _fetch_vnexpress()


async def _handle_get_dantri_news(args: Dict[str, Any], **kwargs) -> str:
    return await _fetch_dantri()


registry.register(
    name="get_vnexpress_news",
    toolset="news",
    schema={
        "name": "get_vnexpress_news",
        "description": "Lay tin tuc moi nhat tu VnExpress.vn. Dung khi hoi tin tuc, thoi su, su kien.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    handler=_handle_get_vnexpress_news,
    is_async=True,
    emoji="📰",
)

registry.register(
    name="get_dantri_news",
    toolset="news",
    schema={
        "name": "get_dantri_news",
        "description": "Lay tin tuc moi nhat tu DanTri.com.vn. Dung khi hoi tin nong, su kien noi bat.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    handler=_handle_get_dantri_news,
    is_async=True,
    emoji="📰",
)
