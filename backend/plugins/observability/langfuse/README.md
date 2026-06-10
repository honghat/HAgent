# Langfuse Observability Plugin

This plugin ships bundled with Hagent but is **opt-in** — it only loads when
you explicitly enable it.

## Enable

Pick one:

```bash
# Interactive: walks you through credentials + SDK install + enable
hagent tools  # → Langfuse Observability

# Manual
pip install langfuse
hagent plugins enable observability/langfuse
```

## Required credentials

Set these in `backend/.env` (or via `hagent tools`):

```bash
HAGENT_LANGFUSE_PUBLIC_KEY=pk-lf-...
HAGENT_LANGFUSE_SECRET_KEY=sk-lf-...
HAGENT_LANGFUSE_BASE_URL=https://cloud.langfuse.com   # or your self-hosted URL
```

Without the SDK or credentials the hooks no-op silently — the plugin fails
open.

## Verify

```bash
hagent plugins list                 # observability/langfuse should show "enabled"
hagent chat -q "hello"              # then check Langfuse for a "Hagent turn" trace
```

## Optional tuning

```bash
HAGENT_LANGFUSE_ENV=production       # environment tag
HAGENT_LANGFUSE_RELEASE=v1.0.0       # release tag
HAGENT_LANGFUSE_SAMPLE_RATE=0.5      # sample 50% of traces
HAGENT_LANGFUSE_MAX_CHARS=12000      # max chars per field (default: 12000)
HAGENT_LANGFUSE_DEBUG=true           # verbose plugin logging
```

## Disable

```bash
hagent plugins disable observability/langfuse
```
