# ChatGPT2API — Docker Deploy (Upstream Project)

Source: https://github.com/basketikun/chatgpt2api

## Overview

ChatGPT2API là project độc lập (không phải bridge plugin của HAgent), biến ChatGPT thành OpenAI-compatible image generation API + account pool manager + online drawing UI.

HAgent's `chatgpt-image-bridge` skill là implementation **lightweight** (no Docker, gọi trực tiếp `chatgpt.com/backend-api/imggen2`). Nếu muốn dùng **full project** (có Web UI, account pool management, register bot), cần deploy chatgpt2api gốc.

## Docker Deploy

```bash
git clone https://github.com/basketikun/chatgpt2api.git
cd chatgpt2api
# config.json: set auth-key
docker compose up -d
```

- Web panel: `http://localhost:3000`
- API: `http://localhost:3000/v1`
- Data dir: `./data`

## Config Overrides

```yaml
# docker-compose.yml environment
CHATGPT2API_AUTH_KEY=your_secret_key  # overrides config.json
STORAGE_BACKEND=sqlite                 # json | sqlite | postgres | git
```

## Config Fields (config.json)

| Field | Default | Notes |
|-------|---------|-------|
| `auth-key` | `chatgpt2api` | **Bắt buộc set** |
| `refresh_account_interval_minute` | 60 | |
| `image_retention_days` | 15 | |
| `image_poll_timeout_secs` | 120 | |
| `auto_remove_rate_limited_accounts` | false | |
| `auto_remove_invalid_accounts` | true | |
| `image_account_concurrency` | 3 | |
| `image_poll_interval_secs` | 10 | |
| `proxy` | `""` | HTTP proxy |
| `base_url` | `""` | ChatGPT base URL |
| `image_storage.enabled` | false | WebDAV / local |
| `backup.enabled` | false | Cloudflare R2 / other |

## Image Models (API)

- `gpt-image-2` — ChatGPT native image gen
- `codex-gpt-image-2` — Codex canvas (Plus/Team/Pro only)
- `auto`, `gpt-5`, `gpt-5-1`, `gpt-5-2`, `gpt-5-3`, `gpt-5-3-mini`, `gpt-5-mini`

## Endpoints

- `POST /v1/images/generations` — image generation
- `POST /v1/images/edits` — image editing
- `POST /v1/chat/completions` — image-scoped chat
- `POST /v1/responses` — responses API
- `GET /v1/models` — model list

## Docker Desktop on Mac

Cần **mở Docker Desktop app** trước (daemon không tự động start). 

```bash
# Check daemon running
docker info | grep -i "Server"

# Nếu chưa chạy: mở Docker Desktop.app từ Finder hoặc:
open -a Docker
```

`docker compose` có thể không có sẵn nếu Docker Desktop không cài CLI plugin. Fix:

```bash
# Install compose plugin manually (brew)
brew install docker-compose
# Hoặc dùng docker-compose (standalone)
```

## Port Change Note

`main.py` hardcodes `port=3000` in `uvicorn.run()`. Để đổi port:
- Wrap bằng Python subprocess override
- Hoặc edit `main.py` trực tiếp

## Local Dev (no Docker)

```bash
# Backend
uv sync
uv run main.py

# Frontend
cd web
bun install
bun run dev
```
