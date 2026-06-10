---
name: chatgpt2api-ops
description: >-
  Operate the chatgpt2api project — build frontend (Next.js), serve backend
  (uvicorn) and frontend (serve/npx), Docker setup management, and
  health-check. Covers the full lifecycle: kill old processes, rebuild, copy
  frontend to web_dist, start services on correct ports, and Docker-based
  authentication/login.
category: hagent
triggers:
  - user mentions "chatgpt2api", "cổng chatgpt", "3011", "3012"
  - user asks to restart, reload, rebuild, or redeploy chatgpt2api
  - user says "mở chatgpt2api", "start chatgpt2api", "làm đồ ngu"
  - health check fails on port 3011 or 3012
  - user needs frontend rebuilt after code changes
  - user says "chưa login được", "không đăng nhập được" regarding chatgpt2api
---

# chatgpt2api Operations

## Architecture

```
chatgpt2api/
├── main.py              ← FastAPI backend (uvicorn)
├── web/                 ← Next.js frontend
│   ├── out/             ← Static build output
│   └── package.json     ← pnpm
├── web_dist/            ← Copied static files served by backend
├── .venv/               ← Python virtualenv
├── docker-compose-prod.yml  ← Docker alternative (bypasses tool limits)
└── web_dist/            ← Backend serves frontend from here
```

- **Backend**: Port **3011** — uvicorn `main:app`, serves API + static frontend
- **Frontend**: Port **3012** — `npx serve out -p 3012` for standalone frontend
- The backend also serves `web_dist/` as static files on 3011

## Full Restart Sequence

### 1. Kill old processes

```bash
lsof -ti:3011 -ti:3012 | xargs kill -9 2>/dev/null
```

Verify: `lsof -ti:3011 -ti:3012` returns nothing.

### 2. Rebuild frontend

```bash
cd /Users/nguyenhat/HAgent/chatgpt2api/web
pnpm build
```

`pnpm build` avoids the bash tool foreground-detection loop that `npx vite build` triggers (see Pitfalls).

### 3. Copy build output to web_dist

```bash
cd /Users/nguyenhat/HAgent/chatgpt2api
rm -rf web_dist
cp -r web/out web_dist
```

WARNING: If `cp` fails on first attempt, retry with separate commands — `cp -r web/out web_dist` and verify `ls -d web_dist` returns the directory.

### 4. Start Backend (port 3011)

Use **background** terminal mode:

```bash
cd /Users/nguyenhat/HAgent/chatgpt2api
source .venv/bin/activate && PORT=3011 uvicorn main:app --host 0.0.0.0 --port 3011
```

Wait ~2 seconds, then verify: `curl -so /dev/null -w "%{http_code}" http://localhost:3011`

### 5. Start Frontend (port 3012)

Also background mode:

```bash
cd /Users/nguyenhat/HAgent/chatgpt2api/web
npx serve out -p 3012
```

Wait ~3 seconds, verify: `curl -so /dev/null -w "%{http_code}" http://localhost:3012`

### 6. Notify user

| Service | Port | Status |
|---------|------|--------|
| Backend API | 3011 | ✅ |
| Frontend | 3012 | ✅ |

Health dashboard: `http://localhost:3011/health`
Frontend: `http://localhost:3012`

## Quick Service Check

```bash
# Backend health (returns HTML dashboard)
curl -s http://localhost:3011/health | head -1

# Frontend static
curl -so /dev/null -w "%{http_code}" http://localhost:3012
```

## Docker Alternative

If bash tool backgrounding becomes problematic, use Docker:

```bash
cd /Users/nguyenhat/HAgent/chatgpt2api
docker-compose -f docker-compose-prod.yml up -d
```

This starts both backend + frontend as containers, avoiding all bash background tool limitations.

## Pitfalls

### Bash background detection loop
- **Problem**: `uvicorn main:app &` triggers "Foreground command uses '&' backgrounding" error.
- **Fix**: Always use `background=true` in terminal calls for long-lived processes. The `sleep + curl` health-check MUST be in a **separate** bash call. Do NOT `&` background within a non-background terminal call.
- **Last resort** (when `terminal(background=true)` fails with `name '_gse' is not defined`): Use `execute_code` + `subprocess.Popen`:
  ```python
  import subprocess, time, os
  proc = subprocess.Popen(
      ["npx", "serve", "web_dist", "-p", "3012", "--cors"],
      cwd="/Users/nguyenhat/HAgent/chatgpt2api",
      stdout=open("/tmp/serve3012.log", "w"),
      stderr=subprocess.STDOUT,
      preexec_fn=os.setsid  # detach from sandbox
  )
  time.sleep(3)
  # Verify: curl -s -o /dev/null -w '%{http_code}' http://localhost:3012
  ```
  See `command-execution-workarounds` skill → Failure Pattern 9 for full pattern.

### web_dist copy fails (atomic vs simple)
- **Problem**: The safe atomic rename (`cp -r web/out web_dist.tmp && rm -rf web_dist && mv web_dist.tmp web_dist`) fails with `mv: rename web_dist.tmp to web_dist: No such file or directory` on the first `cp` failure.
- **Root cause**: Bash tool returns early on intermediate errors in a chain. If `cp` exits non-zero (e.g. out of disk, `mkdir -p` missing parent), subsequent `&&` short-circuits and the `mv` has nothing to rename.
- **Fix**: Use simple approach: `rm -rf web_dist && cp -r web/out web_dist`. If it errors, retry exactly as written. Do NOT use the atomic temp-dir pattern in bash tool chains.

### Port 3011/3012 not fully cleared
- **Problem**: After `kill -9`, sometimes processes linger.
- **Fix**: Wait 1 second after kill, then recheck with `lsof`. Consider killing by PID list individually if the tool returns stderr about no process found.

### pnpm build fails
- **Problem**: `pnpm build` errored on first attempt during one session.
- **Fix**: Retry once. If still fails, check disk space and node_modules integrity.

### User frustration pattern
- If the user says "mày chưa làm đồ ngu" or similar, they expected the full flow to work on first attempt. The most common failure point is getting stuck on step 4 or 5 due to bash background tools. Prefer Docker fallback if the session has already hit a tool loop.

## Related Skills

- **chatgpt-image-bridge** — covers token import, image generation, and some shared pitfalls about pnpm build and port 3011 changes.

## Reference Files

- `references/docker-setup-auth.md` — Docker-based setup (port 3000, container image), Authentication via `Authorization: Bearer` header, Web UI login flow, common mistakes.
