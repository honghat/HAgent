"""Web router — search and fetch, delegating to tools/web_tools.py."""

import re
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/web", tags=["web"])


def _import_web_tools():
    import sys
    # web_tools.py has heavy imports; lazy-load on first call
    if "_web_search_fn" not in dir():
        from tools.web_tools import web_search_tool
        return web_search_tool
    return None


@router.get("/search")
async def search(request: Request, q: str = ""):
    if not q:
        raise HTTPException(status_code=400, detail="Query required")
    try:
        from tools.web_tools import web_search_tool
        results = web_search_tool(q, limit=10)
        # Parse the text output into structured results
        lines = results.split("\n")
        parsed = []
        for line in lines:
            if line.startswith("  ") or not line.strip():
                continue
            parsed.append({"title": line.strip(), "url": "", "snippet": ""})
        return {"query": q, "results": parsed[:10]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class FetchBody(BaseModel):
    url: str


@router.post("/fetch")
async def fetch_url(body: FetchBody):
    if not body.url:
        raise HTTPException(status_code=400, detail="URL required")
    try:
        import aiohttp
        async with aiohttp.ClientSession(headers={"User-Agent": "Mozilla/5.0 (compatible; HAgent/1.0)"}) as s:
            async with s.get(body.url, timeout=aiohttp.ClientTimeout(total=10)) as r:
                html = await r.text()
        text = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL)
        text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL)
        text = re.sub(r'<[^>]*>', ' ', text)
        text = re.sub(r'&[^;]+;', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()[:5000]
        return {"url": body.url, "text": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
