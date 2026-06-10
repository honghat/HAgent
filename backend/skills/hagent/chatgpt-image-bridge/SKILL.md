---
name: chatgpt-image-bridge
description: >-
  Local ChatGPT Image Generation Bridge — kết nối tài khoản ChatGPT Plus/Pro/Team
  không cần Docker, dùng account pool JSON + gọi thẳng ChatGPT backend API.
  Xử lý toàn bộ pipeline: import token → account pool → gọi API → cache ảnh.
category: hagent
triggers:
  - user hỏi "tạo ảnh", "photo tab", "ChatGPT2API", "gpt-image-2", "gpt-5"
  - user muốn import ChatGPT access token
  - user gặp lỗi "No image generation provider" trên Photo tab
  - user cần bridge ChatGPT image gen không Docker
---

# ChatGPT Image Generation Bridge

## Architecture

```
User → Chrome localStorage (accessToken)
         ↓ paste token
    chatgpt-token.html → POST /api/photo/import-chatgpt-account
         ↓
    api/bridges/account_pool.py  →  chatgpt2api_accounts.json (JSON store)
         ↓ round-robin
    plugins/chatgpt2api/__init__.py (bridge singleton)
         ↓
    POST https://chatgpt.com/backend-api/imggen2
         ↓
    ảnh lưu vào $HAGENT_HOME/cache/images/
```

**Không yêu cầu Docker, không clone ChatGPT2API repo.**

## File Structure

| File | Vai trò |
|------|---------|
| `backend/api/bridges/account_pool.py` | Module quản lý pool: import, list, get_next_account, call_chatgpt_image_api |
| `backend/plugins/chatgpt2api/__init__.py` | Plugin bridge — expose singleton `bridge`, function `register(ctx)` |
| `backend/plugins/image_gen/chatgpt2api/__init__.py` | ImageGenProvider — thử bridge trước, fallback proxy Docker |
| `backend/api/routers/photo.py` | FastAPI router: generate, models, history, import-chatgpt-account, extract-token |
| `frontend/public/chatgpt-token.html` | Trang lấy token — Chrome F12 → copy accessToken |

## Setup Steps

### 1. Import ChatGPT access token

Mở `chatgpt.com` đã login → F12 → Console:

```javascript
copy(localStorage.getItem('accessToken'))
```

Dán token qua:
- **Photo tab → Tài khoản → Mở trang kết nối ChatGPT**
- Hoặc API trực tiếp: `POST /api/photo/import-chatgpt-account`

### 2. Config

Trong `backend/config.yaml`:

```yaml
image_gen:
  provider: chatgpt2api
```

### 3. Verify

```bash
# Kiểm tra provider available
curl http://localhost:8010/api/photo/models

# Kiểm tra account đã import
curl http://localhost:8010/api/photo/accounts

# Tạo ảnh
curl -X POST http://localhost:8010/api/photo/generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"a cat wearing a hat","aspect_ratio":"square"}'
```

## API Endpoints (all under `/api/photo/`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/models` | Danh sách model (gpt-image-2-low/medium/high, gpt-5, codex-gpt-image-2) |
| POST | `/generate` | Tạo ảnh — body: `{prompt, model?, aspect_ratio?}` |
| POST | `/import-chatgpt-account` | Import token — body: `{access_token, refresh_token?, email_hint?}` |
| GET | `/accounts` | Danh sách account đã import |
| POST | `/extract-token` | AppleScript lấy token từ Chrome (macOS) |
| GET | `/history` | Lịch sử ảnh đã tạo |

## Provider Chain (in `chatgpt2api/__init__.py`)

1. **Local bridge** (account pool) → gọi `https://chatgpt.com/backend-api/imggen2` trực tiếp
2. **Proxy fallback** → Docker container `http://localhost:3000/v1/images/generations`

Bridge ưu tiên, nếu không có account mới fallback proxy.

## Account Pool Details

- File: `$HAGENT_HOME/chatgpt2api_accounts.json` (thường là `~/HAgent/chatgpt2api_accounts.json`)
- De-duplicate bằng prefix 24 ký tự đầu của token
- Round-robin: chọn account có `last_used_at` xa nhất
- Token được gắn Bearer trực tiếp vào request `https://chatgpt.com/backend-api/imggen2`

## Các Model Có Sẵn

| Model ID | Display | Quality |
|----------|---------|---------|
| `gpt-image-2-low` | GPT Image 2 (Low) | low — ~20s |
| `gpt-image-2-medium` | GPT Image 2 (Medium) | medium — ~60s (default) |
| `gpt-image-2-high` | GPT Image 2 (High) | high — ~3min |
| `gpt-5` | GPT-5 Image | medium — ~1min |
| `codex-gpt-image-2` | Codex GPT Image 2 | medium — ~30s |

## References

- `references/chatgpt2api-docker-deploy.md` — Hướng dẫn deploy **upstream chatgpt2api** (Docker-based) với Web UI, account pool management, register bot. Dùng khi cần full project thay vì bridge lightweight.

## Pitfalls

### Docker Desktop Daemon Chưa Chạy
- `docker info` trả về "Server:\nfailed to connect" → cần mở Docker Desktop app
- `docker compose` command not found → cài `brew install docker-compose`
- Docker Desktop v29 trên Mac có thể không tự start daemon



### Provider không available → 503
- **Nguyên nhân**: `image_gen.provider` chưa set trong config.yaml
- **Fix**: Thêm `image_gen.provider: chatgpt2api`

### Token import thành công nhưng generate lỗi "No account available"
- **Nguyên nhân**: Bridge plugin chưa được load hoặc import sai path
- **Check**: File `plugins/chatgpt2api/__init__.py` phải tồn tại, import `from plugins.chatgpt2api import bridge as _b`
- **Trước đây lỗi**: `from plugins.chatgpt2api_bridge import bridge as _b` — file không tồn tại

### `npx vite build` timeout trong tool loop
- **Nguyên nhân**: Bash tool foreground detection lock
- **Fix**: Dùng `pnpm build` thay vì `npx vite build` hoặc `npm run build`

### Port change (3000 → 3011)
- `chatgpt2api/main.py` hardcodes `port=3000` in `uvicorn.run()` — does NOT read `PORT` env var
- Use Python `-c` wrapper subprocess to override (see `references/port-change-recipe-3011.md`)
- After port change, update `DEFAULT_BASE_URL` in `plugins/image_gen/chatgpt2api/__init__.py`
- Restart HAgent backend (`pm2 restart hagent-fastapi`) + hard refresh browser
- Alternative: `docker-compose -f docker-compose-prod.yml up -d` bypasses all tool limitations

