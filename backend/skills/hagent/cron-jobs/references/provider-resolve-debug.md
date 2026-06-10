# Debug Provider Resolve trong Cron Job

## Cạm bẫy path config.yaml

Cron scheduler (`cron/scheduler.py`) đọc config từ `HAGENT_HOME/config.yaml`, **không phải** `backend/config.yaml`.

```python
# cron/scheduler.py, dòng ~1316
import os
from hagent_constants import get_hagent_home
cfg_path = str(get_hagent_home() / "config.yaml")
# → thường là backend/config.yaml

| `backend/config.yaml` | Cron scheduler | Có thể cũ/thếu provider |
| `backend/config.yaml` | Tools CLI (`hagent config`) | Provider mới |
| `~/HAgent/config.yaml` | (rỗng hoặc không tồn tại) | — |

**Kiểm tra nhanh:**
```bash
python3 -c "from hagent_constants import get_hagent_home; print(get_hagent_home())"
cat $(python3 -c "from hagent_constants import get_hagent_home; print(get_hagent_home())")/config.yaml | grep -A5 '^model:'
diff backend/config.yaml $(python3 -c "from hagent_constants import get_hagent_home; print(get_hagent_home())")/config.yaml 2>/dev/null
```

### Config mẫu từ backend/config.yaml (đã chạy production)

```yaml
model:
  default: pekpik-custom/deepseek-chat
  provider: pekpik-custom
  base_url: https://aiapiv2.pekpik.com/v1
  model: deepseek-chat
  context_length: 1000000

providers:
  pekpik-custom:
    name: Pekpik Custom
    base_url: https://aiapiv2.pekpik.com/v1
    api_key: sk-TUd...o6BW
    default_model: deepseek-chat
  deepseek:
    name: DeepSeek
    base_url: https://api.deepseek.com
    api_key: sk-664...4b0f
    default_model: deepseek-v4-flash
```

## Luồng resolve provider chi tiết (từ debug)

### Code path trong `cron/scheduler.py` (dòng ~1298-1408)

```python
# 1. Lấy provider từ job hoặc frontend
_fe_provider, _fe_model = _get_frontend_provider() if not job.get("provider") else ("", "")
_enforced_provider = job.get("provider") or _fe_provider or ""
# job.provider = "" → job.get("provider") = "" (falsy) → _fe_provider()
# _get_frontend_provider() fail (no 8010) → ("", "") → _enforced_provider = ""

# 2. Gọi resolve_runtime_provider
runtime_kwargs = {
    "requested": _enforced_provider or None,  # "" → None
}
runtime = resolve_runtime_provider(**runtime_kwargs)
```

Khi `requested=None`:
- `resolve_runtime_provider(requested=None)` 
- → `resolve_requested_provider(None)` (runtime_provider.py dòng 299)
- → `if requested and requested.strip()` → False (None là falsy)
- → đọc `model.provider` từ config.yaml → `pekpik-custom`
- → `_get_named_custom_provider("pekpik-custom")` 
- → kiểm tra `auth.resolve_provider("pekpik-custom")` → **nếu không phải built-in** (throw AuthError) → tiếp tục tìm trong `providers:` dict
- → tìm thấy `pekpik-custom` trong dict với `api_key: sk-TUd...o6BW` → dùng được

## Đọc lỗi từ jobs.json

`cron/` module dùng file JSON (`cron/jobs.json`) làm persistent store, **không phải SQLite DB**. Để đọc `last_error`:

```bash
python3 -c "
import json
d = json.load(open('/Users/nguyenhat/HAgent/backend/cron/jobs.json'))
for j in d['jobs']:
    print(f'[{j[\"id\"]}] {j[\"name\"]}')
    print(f'  status: {j.get(\"last_status\",\"?\")}')
    print(f'  error:  {j.get(\"last_error\",\"none\")}')
    print(f'  prov:   {j.get(\"provider\",\"?\")} / model: {j.get(\"model\",\"?\")}')
    print(f'  next:   {j.get(\"next_run_at\",\"?\")}')
    print()
"
```

Output mẫu (lỗi hết tiền DeepSeek):
```
[ec092ec78907] Đọc tin mới 8h sáng
  status: error
  error:  RuntimeError: HTTP 402: Insufficient Balance
  prov:   deepseek / model: deepseek-v4-flash
  next:   2026-05-27T08:00:00+07:00
```

## Các kiểu lỗi provider phổ biến

| last_error | Nguyên nhân | Fix |
|-----------|-------------|-----|
| `HTTP 402: Insufficient Balance` | DeepSeek hết tiền | Nạp tiền / đổi provider |
| `Provider 'X' is set ... but no API key was found` | Provider shadowing (built-in name) | Đổi tên provider (vd: pekpik → pekpik-custom) |
| `AuthError: no API key found` | API key thiếu hoặc không match | Kiểm tra config.yaml > providers > api_key |
| Timeout / ConnectionError | Server LLM không reachable | Kiểm tra server |
| `ModuleNotFoundError: ...` | Thiếu dependency (thường do dùng sai Python) | Luôn dùng `.venv/bin/python3` |

## Script check nhanh

```bash
python3 -c "
from hagent_constants import get_hagent_home
import yaml, os

h = get_hagent_home()
print(f'HAGENT_HOME: {h}')

cfg_path = h / 'config.yaml'
if cfg_path.exists():
    cfg = yaml.safe_load(open(cfg_path)) or {}
    model = cfg.get('model', {})
    print(f'model.provider = {model.get(\"provider\", \"NOT SET\")}')
    print(f'model.default  = {model.get(\"default\", \"NOT SET\")}')
    
    prov = cfg.get('providers', {})
    print(f'providers keys: {list(prov.keys())}')
    
    mp = model.get('provider', '')
    if mp in prov:
        entry = prov[mp]
        key = entry.get('api_key', '')
        print(f'  {mp}: api_key={\"SET\" if key else \"MISSING!\"} ({key[:10]}...)')
    else:
        print(f'  provider \"{mp}\" NOT FOUND in providers dict!')
else:
    print('config.yaml NOT FOUND!')
"
```
