# Session Debug Log — May 27 2026

## Problem

`PhotoTab` không hiển thị ảnh, "No image generation provider".

## Root Cause Chain

1. `backend/api/bridges/` — thư mục **không tồn tại**
2. 2 file trống (0 byte): `chatgpt_bridge.py`, `account_pool.py`
3. `plugins/image_gen/chatgpt2api/__init__.py` dòng 57:
   ```python
   from plugins.chatgpt2api_bridge import bridge as _b  # ← file không tồn tại
   ```
4. `config.yaml` không có section `image_gen:`

## Steps Taken

### 1. Tạo `api/bridges/account_pool.py`

Module chứa:
- `import_account()`, `list_accounts()`, `get_next_account()`, `remove_account()`
- `call_chatgpt_image_api()` — gọi `https://chatgpt.com/backend-api/imggen2` trực tiếp
- Account pool JSON: `$HAGENT_HOME/chatgpt2api_accounts.json`

### 2. Tạo `plugins/chatgpt2api/__init__.py`

Bridge singleton class `ChatGPT2APIBridge`:
- `generate_image()` → `pool.call_chatgpt_image_api()`
- `import_account()` → `pool.import_account()`
- `register(ctx)` → `ctx.register_bridge("chatgpt2api", bridge)`

### 3. Sửa import trong provider

```python
# OLD (file not found):
from plugins.chatgpt2api_bridge import bridge as _b

# NEW:
from plugins.chatgpt2api import bridge as _b
```

### 4. Thêm `image_gen:` vào config.yaml

```yaml
image_gen:
  provider: chatgpt2api
```

### 5. Tạo `frontend/public/chatgpt-token.html`

Trang UI thuần cho user paste token. Gọi `POST /api/photo/import-chatgpt-account`.

## Key Lessons

- Bridge plugin không load = provider không available = 503
- Import path phải khớp module structure thực tế
- `config.yaml` phải có `image_gen.provider` — không auto-detect từ plugin
- `pnpm build` > `npx vite build` (tránh tool loop với foreground detection)
