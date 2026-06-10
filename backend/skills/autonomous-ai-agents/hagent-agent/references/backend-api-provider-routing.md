# Backend API Provider Routing vs CLI Provider Routing

## The divergence

HAgent has **two** provider resolution paths that can give different results:

### 1. CLI path (AIAgent / run_agent.py)

Resolves providers via:
1. Reads `config.yaml` → `model.provider` (e.g. `pekpik-custom`)
2. Looks up `_get_named_custom_provider()` in `hagent_cli/runtime_provider.py` — this reads the named provider block from `config.yaml`
3. Falls back to `_PROVIDER_CONFIGS` (hardcoded dict)
4. Falls through to custom provider table in DB

**Key detail:** The CLI uses `_read_named_provider_config(provider_name)` which reads the named provider block from `config.yaml` under `model.named_providers.<name>`. This is where `pekpik-custom` with its own `base_url`, `api_key`, and `model` lives.

### 2. Backend API path (`/api/hagent-ai/chat/completions` in `api/routers/messages.py`)

Resolves via:
1. `get_provider_config(provider_name, model_override)` in `api/services/provider_config.py`
2. First checks `_PROVIDER_CONFIGS` hardcoded dict — if found, uses that
3. Only if NOT found in hardcoded dict, tries `_provider_from_user_store()` which:
   - Checks `BUILTIN_PROVIDERS` constant
   - Then checks DB `custom_providers` table
4. **Then** calls `_read_named_provider_config(context_key)` to override base_url/api_key/model

**Critical problem:** The named provider read happens AFTER the hardcoded config is selected. So:
- `get_provider_config("pekpik", ...)` → finds `_PROVIDER_CONFIGS["pekpik"]` → uses `.env` values
- `get_provider_config("pekpik-custom", ...)` → NOT in `_PROVIDER_CONFIGS` → falls to `_provider_from_user_store("pekpik-custom")` → tries `BUILTIN_PROVIDERS` (likely not there) → tries DB `custom_providers` (might be there if saved) → then `_read_named_provider_config("pekpik-custom")` → reads named provider from config.yaml

So passing `pekpik-custom` as the provider name to the backend API **does** eventually reach the correct config.yaml block, **IF** the provider is also in the DB's `custom_providers` table (which it might not be — the named provider in config.yaml is separate from DB entries).

## Debugging commands

### Check what the backend API will actually use

```python
cd /Users/nguyenhat/HAgent/backend
python3 -c "
from api.services.provider_config import get_provider_config
for name in ['pekpik', 'pekpik-custom', 'deepseek']:
    try:
        cfg = get_provider_config(name, 'deepseek-chat')
        key_hint = cfg.api_key[:12] + '...' if cfg.api_key else 'NONE'
        print(f'{name}: url={cfg.base_url} key={key_hint} model={cfg.model} type={cfg.type}')
    except Exception as e:
        print(f'{name}: ERROR {e}')
"
```

### Check config.yaml named providers

```bash
grep -A 5 'pekpik-custom\|pekpik:' /Users/nguyenhat/HAgent/backend/config.yaml | head -20
```

### Check DB custom_providers

```python
cd /Users/nguyenhat/HAgent
python3 -c "
import sqlite3
conn = sqlite3.connect('data/hagent.db')
conn.row_factory = sqlite3.Row
for r in conn.execute('SELECT name, base_url, api_key, model, type FROM custom_providers').fetchall():
    key = r['api_key'][:12] + '...' if r['api_key'] else 'NONE'
    print(f'{r[\"name\"]}: model={r[\"model\"]} type={r[\"type\"]} url={r[\"base_url\"][:40] if r[\"base_url\"] else \"NONE\"} key={key}')
conn.close()
"
```

## Fix strategies

### Quick fix (for a single component calling the API)
Pass the full named-provider name (e.g. `pekpik-custom`) as the provider in the API call body, and ensure that either:
- The named provider exists as a `custom_providers` DB entry, OR
- The provider name is unique enough to reach `_read_named_provider_config()` in `get_provider_config()`

### Proper fix (in provider_config.py)
Add a named-provider check EARLY in `get_provider_config()`, before the `_PROVIDER_CONFIGS` lookup:

```python
def get_provider_config(provider_name: str | None, model_override: str | None = None) -> ProviderConfig:
    # Early named provider check — catches pekpik-custom before _PROVIDER_CONFIGS
    if provider_name and '/' in provider_name:
        named_cfg = _read_named_provider_config(provider_name)
        if named_cfg:
            # ... build config from named provider ...
            pass
    # ... existing logic ...
```

Or simpler: make `_PROVIDER_CONFIGS` check run AFTER `_read_named_provider_config`, so a named provider config always overrides the hardcoded one.

### Environment fix
If the issue is just that `.env` has an expired key, update `PEKPIK_API_KEY` in `.env` with a fresh key — this fixes both CLI and API paths.
