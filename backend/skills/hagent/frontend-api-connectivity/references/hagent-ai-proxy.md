# `/api/hagent-ai/chat/completions` Proxy

> Proxy endpoint in `backend/api/routers/messages.py:93`

## Request Format

```json
{
  "provider": "pekpik",
  "model": "deepseek-chat",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "temperature": 0.5
}
```

## Critical Rules

1. **`provider` and `model` are SEPARATE fields.** Do NOT combine them (e.g. `"pekpik-custom/deepseek-chat"` as `model`). The backend's `get_provider_config(provider_name, model_override)` needs them split.

2. **`provider` must be a recognized name.** Valid options:
   - Built-in providers defined in `_PROVIDER_CONFIGS` inside `backend/api/services/provider_config.py` (e.g. `pekpik`, `openrouter`, `lmstudio`, `openai`, `anthropic`, `deepseek`)
   - Custom providers saved in the `custom_providers` DB table (via the providers management UI or API)

3. **If `provider` is `null`/absent**, the proxy falls back to `lmstudio` by default.

4. **`model` alone is not enough** — without a matching provider, the lookup will default to lmstudio's model.

## Response Format (OpenAI-compatible)

```json
{
  "choices": [
    {
      "message": {
        "content": "Kịch bản video..."
      }
    }
  ]
}
```

Access via `data.choices[0].message.content`.

## Common Error: "Provider không khớp frontend"

```
400: Provider không khớp frontend hoặc chưa được cấu hình ở backend: pekpik-custom
```

**Cause**: Frontend sent `provider: "pekpik-custom"` which is not in `_PROVIDER_CONFIGS` and not in the `custom_providers` DB table.

**Fix**: Either:
- Change to a known provider name (e.g. `pekpik`)
- Or save `pekpik-custom` as a custom provider in the DB first

## Provider Lookup Chain

```
get_provider_config(provider_name, model_override)
  → _PROVIDER_CONFIGS[provider_name]        # built-in dict
    → _provider_from_user_store(provider_name)  # DB custom_providers table
      → ValueError("không khớp frontend")
```
