# Provider Shadowing — Built-in vs Custom Conflict

## Tóm tắt

Khi `model.provider` trong `backend/config.yaml` có tên trùng với một **built-in provider** (vd: `pekpik`), `_get_named_custom_provider()` bỏ qua custom config của provider đó mặc dù đã có `api_key` và `base_url` trong mục `providers:`.

## Kịch bản thực tế

User có:
```yaml
model:
  provider: pekpik
  default: deepseek-chat
  base_url: https://aiapiv2.pekpik.com/v1

providers:
  pekpik:
    name: Pekpik API
    base_url: https://aiapiv2.pekpik.com/v1
    api_key: sk-TUd...o6BW
    default_model: deepseek-chat
```

Cron job fail với `last_status: error`, không có `last_delivery_error`, agent chết ngay trước khi khởi tạo.

## Debug path

### 1. Xác nhận provider bị shadow

```bash
cd /Users/nguyenhat/HAgent/backend
.venv/bin/python3 scripts/check_pekpik.py
```

Script:
```python
import sys, json
sys.path.insert(0, "/Users/nguyenhat/HAgent/backend")
from hagent_cli import auth
from hagent_cli.runtime_provider import _get_named_custom_provider

# Kiểm tra resolve_provider (built-in hay không)
try:
    r = auth.resolve_provider("pekpik")
    print(f"resolve_provider('pekpik') = {r!r}")
except Exception as e:
    print(f"AuthError: {e}")

# Kiểm tra custom provider lookup
r2 = _get_named_custom_provider("pekpik")
print(f"_get_named_custom_provider('pekpik') = {json.dumps(r2, indent=2, default=str)}")
# → resolve_provider returns "pekpik"
# → _get_named_custom_provider returns None (bị shadow)
```

### 2. Code path shadowing

`hagent_cli/runtime_provider.py`, hàm `_get_named_custom_provider()`:

```python
# Dòng 360-375
if not requested_norm.startswith("custom:"):
    try:
        canonical = auth_mod.resolve_provider(requested_norm)  # returns "pekpik"
    except AuthError:
        pass
    else:
        if (canonical or "").strip().lower() == requested_norm:  # "pekpik" == "pekpik" → True
            return None  # ← SHADOWED!
```

### 3. Root cause chain

1. `resolve_requested_provider("")` → lấy `model.provider` từ config → `"pekpik"`
2. `resolve_runtime_provider(requested="pekpik")` → gọi `_get_named_custom_provider("pekpik")`
3. `_get_named_custom_provider` thấy `pekpik` là built-in → return `None`
4. Fallback về `resolve_provider("pekpik")` → không có api_key → `AuthError: no API key found`
5. `run_job` bắt exception → log error → `mark_job_run(success=False)` → DB ghi error

## Fix

Đổi tên provider trong config.yaml **khác tên built-in**:

```yaml
# Config before (broken)
model:
  provider: pekpik
  default: pekpik/deepseek-chat

providers:
  pekpik:
    name: Pekpik API
    base_url: https://aiapiv2.pekpik.com/v1
    api_key: sk-TUd...o6BW

# Config after (fixed)
model:
  provider: pekpik-custom     # ← đổi tên
  default: pekpik-custom/deepseek-chat  # ← đổi tên

providers:
  pekpik-custom:              # ← key mới
    name: Pekpik Custom       # ← display name mới
    base_url: https://aiapiv2.pekpik.com/v1
    api_key: sk-TUd...o6BW
    default_model: deepseek-chat

# Giữ lại pekpik cũ nếu cần, nhưng không ảnh hưởng
  pekpik:
    name: Pekpik API (Built-in, unused)
    base_url: https://aiapiv2.pekpik.com/v1
    api_key: sk-TUd...o6BW
```

Sau fix:
- `_get_named_custom_provider("pekpik-custom")` → `auth.resolve_provider("pekpik-custom")` **throw AuthError** → `except AuthError: pass` → không shadow → tiếp tục xuống dòng 380 tìm trong `providers:` dict → **tìm thấy** → return config với api_key → cron chạy OK.

## Các built-in provider cần tránh shadow

| Tên | Khi nào shadow xảy ra |
|-----|----------------------|
| `pekpik` | Built-in (resolve_provider returns "pekpik") |
| `lmstudio` | Built-in |
| `ollama` | Built-in |
| `nous` | Built-in |
| `openrouter` | Built-in |
| `deepseek` | Built-in (có canonical check) |
| `anthropic` | Built-in |
| `openai` | Built-in |

Bất kỳ provider nào trong `hagent_cli/auth.py`'s `PROVIDER_NAMES` hoặc `resolve_provider` return chính nó đều bị shadow.

## Tài liệu tham khảo

- `hagent_cli/runtime_provider.py` dòng 350-480 (`_get_named_custom_provider`)
- `hagent_cli/runtime_provider.py` dòng 903-1002 (`resolve_runtime_provider`)
- `cron/scheduler.py` dòng 1378-1408 (provider routing trong cron)

## Tra cứu provider từ DB (`custom_providers` table)

Khi nghi ngờ config.yaml không khớp với DB (vd: API key chỉ có trong UI nhưng không trong file), tra trực tiếp bảng `custom_providers`:

```sql
SELECT * FROM custom_providers;
-- Columns: id, user_id, name, display_name, provider_type, base_url, api_key, default_model, created_at, updated_at, max_tokens
```

Ví dụ output thực tế cho thấy mỗi provider có dòng riêng với `api_key` (đã masked) và `base_url`:

| name | provider_type | base_url | default_model |
|------|-------------|----------|---------------|
| pekpik | openai | https://aiapiv2.pekpik.com/v1 | deepseek-chat |
| deepseek | openai | https://api.deepseek.com | deepseek-v4-flash |
| gemini | gemini | — | gc/gemini-3-pro-preview |

> **Lưu ý:** Cron job **không đọc API key từ DB**. Nó dùng `resolve_runtime_provider()` → `auth.py` → config.yaml. Việc có key trong DB (UI) nhưng không trong config.yaml là nguyên nhân phổ biến khiến job fail mặc dù UI chạy OK.
>
> **Fix:** Copy key từ DB sang config.yaml, hoặc dùng UI để set provider và để cron tự động theo frontend (xem phần "Provider/model tự động theo frontend").
