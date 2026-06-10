# FastAPI Global Exception Handler — Crash Prevention

## Problem

When a FastAPI route handler or middleware raises an **unhandled exception** (e.g., `openai.AuthenticationError`, network timeout, assertion error), uvicorn's default behavior is to **kill the worker process**. If PM2 or a watchdog is running, this triggers a restart loop.

Common unhandled exceptions that crash production FastAPI servers:

| Exception | Typical Cause |
|-----------|--------------|
| `openai.AuthenticationError` | API key expired / revoked (HTTP 401) |
| `openai.RateLimitError` | Rate limit exceeded (HTTP 429) |
| `openai.APIConnectionError` | Network timeout to upstream API |
| `httpx.ConnectError` | Proxy / DNS failure |
| `json.JSONDecodeError` | Malformed upstream response |
| `KeyError` / `IndexError` | Missing data in LLM response |
| `asyncio.TimeoutError` | Long-running coroutine exceeds deadline |

## Solution: Global Exception Handler

Add this to your FastAPI app factory **immediately after** `add_middleware`:

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import logging
import traceback

def create_app() -> FastAPI:
    app = FastAPI(title="My API", version="0.1.0")
    # ... middleware ...

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logging.error(
            "Unhandled exception on %s %s: %s\n%s",
            request.method,
            request.url.path,
            exc,
            traceback.format_exc(),
        )
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal server error: {type(exc).__name__}"},
        )

    # ... routers, static files, startup events ...
    return app
```

## How It Works

- **Before handler:** any exception not caught by a `try/except` → uvicorn sees an unhandled exception → logs the traceback → **terminates the worker** → PM2/watchdog sees the worker gone → restarts it.
- **After handler:** any exception → the handler catches it → logs the full traceback → returns a 500 JSON response → **the server process stays alive** → PM2 sees `uptime > 0` → no restart.

## Important Notes

- This does NOT fix the underlying error (token expired, upstream down). It **prevents the crash** so you have time to diagnose and fix without a restart storm.
- The handler uses `traceback.format_exc()` to capture the full stack trace. This is critical — `str(exc)` alone is often not enough.
- For debugging, route-specific `try/except` is better (can return meaningful error messages). The global handler is a safety net, not a replacement.
- In production, consider sending the traceback to a logging service (Sentry, Datadog) rather than just `logging.error`.

## Integration with PM2 Restart Loop Diagnosis

When investigating a restart storm, check:

1. **`pm2 logs <service-name> --lines 200 | grep "Error\|Traceback"`** — if you see actual Python tracebacks before the `Shutting down` lines, the process is CRASHING (not just being restarted).

2. **Without global handler:** one bad request → process dies → restart → another bad request → process dies → repeats at request frequency = PM2 restart frequency.

3. **With global handler:** same bad request → process logs error + returns 500 → process lives → next request also gets 500 but no restart → PM2 uptime remains healthy → no restart loop.
