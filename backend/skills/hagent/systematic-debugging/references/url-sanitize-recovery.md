# URL Sanitize Recovery — `Invalid non-printable ASCII character in URL`

## Symptom

Log shows repeated `httpx.InvalidURL: Invalid non-printable ASCII character in URL, '\n' at position 10.`
affecting multiple subsystems: session summarization, web_search, TTS, or any auxiliary LLM call.

The error happens deep in httpx / OpenAI SDK client creation, not in the caller's own code.

## Root Cause

A `base_url` string somewhere in the client-creation chain contains a non-printable character
(typically trailing `\n`) that httpx rejects when constructing `URLPattern` mounts.

## Why It Happens in HAgent

The HAgent backend has multiple URL normalization points:

| Function | File | Purpose |
|----------|------|---------|
| `_to_openai_base_url()` | `auxiliary_client.py:446` | Normalize Anthropic→OpenAI URL; strips `\n` |
| `_extract_url_query_params()` | `auxiliary_client.py:117` | Strip query params; now sanitizes `\n` |
| `_validate_base_url()` | `auxiliary_client.py:1635` | Check port validity — does NOT sanitize |
| `resolve_runtime_provider()` | `runtime_provider.py:919` | Returns base_url from config/env |
| `_get_named_custom_provider()` | `runtime_provider.py:350` | Reads base_url from providers dict |
| `_try_custom_endpoint()` | `auxiliary_client.py:1653` | Uses resolve_custom_runtime base_url |

The typical call chain:

```
async_call_llm()
  → _resolve_task_provider_model() → returns "auto"
  → _get_cached_client("auto")
    → resolve_provider_client("auto", ...)
      → _resolve_auto() Step 1 or Step 2
        → resolve_provider_client("pekpik" or "nous" or "custom", ...)
          → client = OpenAI(api_key=..., base_url=...) ← FAILS HERE
```

## Where \n Comes From

Provenance of the offending character is hard to pin down because it's intermittent.
Likely sources (in order of probability):

1. **PM2 / .env corruption** — An env var like `OPENAI_BASE_URL` gets a trailing newline
   from a shell parsing artifact (e.g. missing quotes in `ecosystem.config.js`).
2. **Config YAML parsing artifact** — A multi-line string in `config.yaml` that gets
   folded into a single base_url value.
3. **Race condition in client cache** (`_get_cached_client`) — Two threads build clients
   concurrently; one produces a corrupted cache entry that poisons subsequent lookups.
   Cache keys incorporate `main_runtime` dict which is assembled from config reads;
   a partial read during YAML reload could produce a dict whose values contain garbage.
4. **Session persistence corruption** — When hagent serializes/deserializes session state
   (tool outputs, cached provider configs across agent restarts), a control character
   can get embedded.

## Specific Subsystem Recovery

### 1. Session summarization failing → auxiliary "auto" provider

**What happens:** `session_search_tool.py:_summarize_session` calls `async_call_llm(task="session_search")`
→ no per-task config → returns `"auto"` → `_resolve_auto → Step 1 (main provider)`. If the main
provider route fails with `InvalidURL` and Step 2 also fails, the `except Exception` at line 249
logs the warning after 3 attempts and returns None → session summaries stop working until the
process is restarted.

**Diagnostic:**
```python
# Can the main provider build a client?
from agent.auxiliary_client import resolve_provider_client
client, model = resolve_provider_client("pekpik", "deepseek-chat", async_mode=False)
# → raises InvalidURL if issue is present
```

**Fix:** Restart the agent process (`pm2 restart hagent-agent` or equivalent). The cache is
in-memory only, so a restart clears any corrupted entries. If the error persists, check
config and env vars for literal `\n` characters.

### 2. Web search failing

**What happens:** `web_search` tool calls `async_call_llm` under the hood for search
rephrasing/classification. Same chain as above.

**Fix:** Same — restart the process. Also verify SearXNG is healthy (port 8888).

### 3. TTS server error

The TTS error log line `Lỗi TTS server (http://127.0.0.1:5002/tts)` is a separate issue:
it shows the server IS reachable (405 Method Not Allowed ≠ connection refused) but the
caller is sending the wrong HTTP method. The `Invalid non-printable ASCII` part of the
log line may be a red herring from a different concurrent call that happened to log
nearby. Verify TTS works independently:

```bash
# TTS server status
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5002/tts
# 405 = alive but needs POST; 000 = server down
```

## Permanent Fixes Applied (2026-05-27)

1. **`_to_openai_base_url()`** — Added `''.join(c for c in url if c.isprintable() or c in url_chars)`
   before `rstrip('/')`. Catches `\n` that survives `.strip()`.
2. **`_extract_url_query_params()`** — Same sanitize before `urlparse()`.

These cover all code paths that build `base_url=` for the OpenAI SDK client.

### Verified Working

```python
url_bad = "https://aiapiv2.pekpik.com/v1\n"
# _to_openai_base_url(url_bad) → "https://aiapiv2.pekpik.com/v1" (stripped \n)
# _extract_url_query_params(url_bad) → ("https://aiapiv2.pekpik.com/v1", None) (stripped \n)
```

## Related

- `hagent-agent` skill for PM2 restart commands
- `pm2-service-restart-loop` skill for restart-loop vs crash diagnosis
- Django SECRET_KEY / environment variable corruption patterns (same concept)
