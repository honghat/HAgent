# SPA Serving from FastAPI — Session Notes

## Context

This HAgent fork serves its React SPA directly from the FastAPI backend (port 8011), not from a separate dev server. After `npm run build`, you must mount the built `dist/` directory.

## Key Details from Setup

### Path Resolution

```python
# api/main.py — inside create_app(), after all routers are included
from pathlib import Path
from fastapi.staticfiles import StaticFiles

upload_path = Path(__file__).resolve()  # backend/api/main.py
project_root = upload_path.parents[2]   # /Users/nguyenhat/HAgent
frontend_dist = project_root / "frontend" / "dist"
```

**parents[2]** = repo root (skip `api/` and `backend/`).
**parents[1]** = `backend/` directory — WRONG, won't find `frontend/dist`.

### Mount Order in main.py

```python
# 1. Uploads — always first
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

# 2. All routers
app.include_router(health.router)
app.include_router(...)
# ... all API routes ...
app.include_router(truyencv.router)  # last router

# 3. SPA serving — AFTER all routers
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(...), name="spa_assets")
    app.mount("/audio_cache", StaticFiles(...), name="audio_cache")

    @app.get("/")
    async def serve_spa_root():
        return FileResponse(str(frontend_dist / "index.html"))

    @app.get("/{full_path:path}")
    async def serve_spa_fallback(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("uploads/") or full_path.startswith("audio_cache/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        return FileResponse(str(frontend_dist / "index.html"))

# 4. Startup event — AFTER SPA routes
@app.on_event("startup")
```

### Why catch-all route instead of `StaticFiles(html=True)` on `/`

`app.mount("/", StaticFiles(directory=str(frontend_dist), html=True))` **overrides all API routes** because FastAPI handles mounted apps at the top of the routing chain. The catch-all approach with explicit exclusion of API paths preserves existing route resolution.

### Audio Cache Duplicate Mount

If there's already an `audio_cache` mount earlier in the file, the SPA-serving block's mount of the same path will cause a runtime error. Remove the earlier duplicate. In this codebase the original mounting was:

```python
audio_cache_dir = Path(__file__).resolve().parent / "audio_cache"
audio_cache_dir.mkdir(parents=True, exist_ok=True)
app.mount("/audio_cache", StaticFiles(directory=str(audio_cache_dir)), name="audio_cache")
```

Keep the variable declaration but move the mount to the SPA block.

## Server Restart on macOS

```bash
# Kill on port
lsof -ti :8011 | xargs kill 2>/dev/null

# Start (nohup to survive terminal close)
cd /Users/nguyenhat/HAgent/backend
nohup .venv/bin/python -m uvicorn api.main:app --host 0.0.0.0 --port 8011 > /tmp/hagent_server.log 2>&1 &

# Wait for startup
sleep 3

# Verify
curl -s -o /dev/null -w "root: %{http_code}\n" http://localhost:8011/
curl -s -o /dev/null -w "asset: %{http_code}\n" http://localhost:8011/assets/main-XuQRJUCy.js
curl -s -o /dev/null -w "api: %{http_code}\n" http://localhost:8011/api/truyencv/recent
```
