# CV Generation Provider Resolution

File: `backend/api/routers/cv_generate.py`
Function: `_resolve_provider(user_id, provider, model)`

## Resolution chain (priority order)

1. **Explicit `provider` param** passed by caller (body.provider)
2. **`user.default_provider`** from DB (set via frontend or `/api/auth/provider`)
3. **Agent profile model** — if user has a `default_agent`, and that agent profile has a model that matches a known provider name → use that provider
4. **Hard fallback**: `"cx"` (was `"lmstudio"` before May 2026 fix)

## Where chat UI gets its provider

- Frontend: `localStorage.getItem('hagent_provider')` or `'cx'` default
- Synced to backend: `POST /api/auth/provider` → `user.default_provider`
- `App.jsx` line: `useState(localStorage.getItem('hagent_provider') || 'cx')`

## Current known providers (from `/api/auth/providers`)

| name | label | model |
|------|-------|-------|
| pekpik | Pekpik API | deepseek-chat |
| deepseek | DeepSeek | deepseek-v4-flash |
| ollama | Ollama (Remote) | qwen3.5:4b |
| lmstudio | LM Studio (Remote) | qwen/qwen3.5-9b |
| llamacpp | Llama.cpp (Remote) | qwen |
| lmstudio_local | LM Studio (Local) | qwen/qwen3.5-9b |
| cx | 9router | gh/claude-haiku-4.5 |
| gemini | Gemini | gc/gemini-3-pro-preview |
| openai | OpenAI | gpt-4o-mini |
| anthropic | Anthropic | claude-3-5-sonnet |

## Pitfall

The `_call_llm()` function has a try/except that falls back to original `provider` in `except Exception`:

```python
try:
    resolved_provider, resolved_model = _resolve_provider(user_id, provider, model)
    cfg = get_provider_config(resolved_provider, resolved_model)
except Exception as exc:
    cfg = get_provider_config(provider, model)
```

This masking makes debug harder — if `_resolve_provider` fails, it silently falls back to the (possibly `None`) original param.
