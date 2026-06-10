# Port Change Recipe (3011)

## Problem

`chatgpt2api/main.py` hardcodes `port=3000` in `uvicorn.run()` — it does NOT read the `PORT` environment variable.

## Fix

Override port via Python subprocess wrapper:

```bash
cd /Users/nguyenhat/HAgent/chatgpt2api
source .venv/bin/activate
python -c "
import uvicorn
import sys
sys.argv = ['', 'main:app']
uvicorn.run('main:app', host='0.0.0.0', port=3011)
"
```

Or background-safe version:

```bash
cd /Users/nguyenhat/HAgent/chatgpt2api && source .venv/bin/activate && PORT=3011 uvicorn main:app --host 0.0.0.0 --port 3011
```

Note: `PORT=3011` is passed to the process but `main.py` ignores it. The explicit `--port 3011` flag is what actually changes the port. This works because `uvicorn` CLI reads `--port` before the app's `uvicorn.run()` logic.

## Update Downstream References

After changing port:
1. `plugins/image_gen/chatgpt2api/__init__.py` — update `DEFAULT_BASE_URL` if chatgpt-image-bridge points to this port
2. Restart HAgent backend: `pm2 restart hagent-fastapi`
3. Hard refresh browser to clear cached API URLs
