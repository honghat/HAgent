# Port Change Recipe: chatgpt2api → Port 3011

## Context

The local ChatGPT2API proxy runs on port 3000 by default. This conflicts with other services (Langfuse, etc.). Moving it to port 3011 requires a multi-step process because:

1. `chatgpt2api/main.py` **hardcodes** `port=3000` in `uvicorn.run()` — does NOT read `PORT` env var
2. No `.env` or config file controlling the port
3. A `docker-compose.yml` exists but wasn't used in this session

## Steps

### 1. Kill existing process on old port

```bash
kill $(lsof -ti tcp:3000) 2>/dev/null
```

### 2. Start on new port (since main.py ignores PORT env var)

Use Python `-c` wrapper to override the hardcoded port:

```python
import subprocess, time

uv_bin = "/Users/nguyenhat/.local/bin/uv"  # from `which uv`
proc = subprocess.Popen(
    [uv_bin, "run", "python", "-c", """
import sys; sys.path.insert(0, '.')
from api import create_app
import uvicorn
app = create_app()
uvicorn.run(app, host='0.0.0.0', port=int('3011'))
"""],
    cwd="/path/to/chatgpt2api",
    env={"HOME": os.environ.get("HOME", ""), "PATH": "/Users/nguyenhat/.local/bin:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin"},
    stdout=open("/tmp/c2api-3011.log", "w"),
    stderr=subprocess.STDOUT,
)
time.sleep(5)
```

### 3. Update backend plugin default URL

File: `backend/plugins/image_gen/chatgpt2api/__init__.py`

```python
# Change this:
DEFAULT_BASE_URL = "http://localhost:3000"
# To this:
DEFAULT_BASE_URL = "http://localhost:3011"
```

### 4. Verify

```bash
curl http://localhost:3011/health            # Should return HTML dashboard
curl -s -o /dev/null -w '%{http_code}' \
  http://localhost:3011/v1/images/generations \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <api-key>' \
  -d '{"model":"dall-e-3","prompt":"test","n":1,"size":"1024x1024"}'
```

### 5. Import ChatGPT tokens

Use the `/api/photo/import-chatgpt-account` endpoint to inject tokens into the account pool, or follow `chatgpt-token.html` instructions.

## Alternative: Docker approach

If docker-compose is available:

```bash
cd /path/to/chatgpt2api
docker-compose -f docker-compose-prod.yml up -d
```

This avoids all tool limitations since Docker handles process lifecycle.

## Pitfalls

- The `execute_code` sandbox does NOT inherit the shell PATH — always use full binary paths (`/Users/nguyenhat/.local/bin/uv`, not `uv`)
- `uvicorn.run(host='127.0.0.1', port=...)` vs `host='0.0.0.0'` — the latter allows external connections but any will do for local-only
- If `http://localhost:3011/health` returns 200 but `/v1/images/generations` returns 401, the API key doesn't match config.json's `auth-key` field
- Restarting HAgent backend (`pm2 restart hagent-fastapi`) may be needed after changing the DEFAULT_BASE_URL in the plugin
- Browser hard refresh (Cmd+Shift+R) resolves stale React bundle if frontend was built before port change
