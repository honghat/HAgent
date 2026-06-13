#!/usr/bin/env python3
"""Portal độc lập "Video đàn tranh" trên cổng cũ (8007).

- Serve giao diện lồng tiếng (index.html) — CHỈ tính năng video, không lộ phần khác của HAgent.
- Proxy mọi /api/* → FastAPI HAgent (:8010) để app dùng chung backend + đăng nhập riêng.

Chạy bằng venv backend (có starlette + httpx). PM2 quản lý.
"""

from __future__ import annotations

import os
from pathlib import Path

import httpx
import uvicorn
from starlette.applications import Starlette
from starlette.background import BackgroundTask
from starlette.responses import FileResponse, Response, StreamingResponse
from starlette.routing import Route

LISTEN_HOST = os.getenv("PORTAL_LISTEN_HOST", "0.0.0.0")
LISTEN_PORT = int(os.getenv("PORTAL_LISTEN_PORT", "8007"))
TARGET = os.getenv("PORTAL_TARGET", "http://127.0.0.1:8010")
INDEX = Path(__file__).resolve().parent / "index.html"

_client = httpx.AsyncClient(base_url=TARGET, timeout=None)

# Hop-by-hop headers không chuyển tiếp
_DROP_REQ = {"host", "content-length", "transfer-encoding", "connection"}
_DROP_RES = {"transfer-encoding", "connection"}


async def proxy(request):
    fwd_headers = {k: v for k, v in request.headers.items() if k.lower() not in _DROP_REQ}
    req = _client.build_request(
        request.method,
        request.url.path,
        params=request.query_params,
        headers=fwd_headers,
        content=request.stream(),
    )
    resp = await _client.send(req, stream=True)
    out_headers = {k: v for k, v in resp.headers.items() if k.lower() not in _DROP_RES}
    return StreamingResponse(
        resp.aiter_raw(),
        status_code=resp.status_code,
        headers=out_headers,
        background=BackgroundTask(resp.aclose),
    )


async def index(request):
    return FileResponse(str(INDEX))


app = Starlette(routes=[
    Route("/api/{path:path}", proxy, methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]),
    Route("/", index),
    Route("/{path:path}", index),
])


if __name__ == "__main__":
    uvicorn.run(app, host=LISTEN_HOST, port=LISTEN_PORT, log_level="warning")
