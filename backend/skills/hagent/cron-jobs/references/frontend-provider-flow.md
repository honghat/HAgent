# Cron job lấy provider/model từ frontend Chat.jsx

## Cách hoạt động

Khi cron job không pin `provider` và `model`, scheduler (`cron/scheduler.py`) gọi `_get_frontend_provider()` để lấy provider/model từ UI.

### Luồng resolve

```
_get_frontend_provider()
  ├─ GET http://localhost:8010/api/auth/provider
  │   → {"provider": "pekpik"}     ← user đã chọn trong Chat.jsx
  │
  └─ GET http://localhost:8010/api/auth/providers
      → [..., {"name": "pekpik", "model": "deepseek-chat", ...}, ...]
      → return ("pekpik", "deepseek-chat")
```

### Chain ưu tiên

**Provider:**
1. `job.provider` (nếu pin cứng)
2. `_get_frontend_provider()` (nếu job.provider rỗng)
3. Fallback: `resolve_runtime_provider()` tự xử lý từ config.yaml/env

**Model:**
1. `job.model` (nếu pin cứng)
2. `_get_frontend_provider()` (model từ provider config)
3. `HAGENT_MODEL` env var
4. `config.yaml > model.default`

## Code

Hàm `_get_frontend_provider()` trong `cron/scheduler.py`:

```python
def _get_frontend_provider() -> tuple[str, str]:
    try:
        import urllib.request, json
        req = urllib.request.Request(
            'http://localhost:8010/api/auth/provider',
            headers={'Accept': 'application/json'},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            provider = str(data.get('provider', '')).strip()
    except Exception as exc:
        logger.debug('Cron: GET /api/auth/provider failed - %s', exc)
        provider = ''

    if provider:
        try:
            req2 = urllib.request.Request(
                'http://localhost:8010/api/auth/providers',
                headers={'Accept': 'application/json'},
            )
            with urllib.request.urlopen(req2, timeout=5) as resp2:
                providers_list = json.loads(resp2.read().decode())
                if isinstance(providers_list, list):
                    for p in providers_list:
                        if p.get('name') == provider:
                            model = str(p.get('model') or p.get('modelStr') or '').strip()
                            return provider, model
        except Exception:
            pass

    return provider, ''
```

## Frontend API layer

Chat.jsx lưu provider qua:
```javascript
// App.jsx
fetch('/api/auth/provider', {
  method: 'PUT',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ provider: p })
})
// → Lưu vào DB user.default_provider
```

Cron không cần token — API `/api/auth/provider` và `/api/auth/providers` dùng anonymous GET (route mở) khi không yêu cầu authentication body. Nếu cần auth, cron sẽ cần token user.

## Cạm bẫy đã fix

- **Empty string vs None**: `job.get("provider")` trả về `""` khi job có `provider: ""`. `resolve_requested_provider` thấy `""` là falsy → fallback config. Fix: `job.get("provider") or None`.
- **model key**: API providers trả về key `"model"` (không phải `"modelStr"`). Đã sửa hàm để đọc cả hai.
- **Timeout**: Nếu FastAPI (port 8010) chưa chạy, `_get_frontend_provider` trả về `("", "")` và fallback config — không crash.
