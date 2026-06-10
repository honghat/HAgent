# Wrapped Error Debug — Cron Job Edition

## Problem

When a cron job fails, `last_error` in `jobs.json` often shows a **wrapped/misleading message** like:

```
RuntimeError: Provider 'pekpik' is set in config.yaml but no API key was found.
```

But the real cause is completely different — expired API key (HTTP 401), syntax error in an imported module, etc.

## Root Cause

`cron/scheduler.py` line 1406-1408 wraps ALL exceptions:
```python
except Exception as exc:
    message = format_runtime_provider_error(exc)
    raise RuntimeError(message) from exc
```

`format_runtime_provider_error` is just `str(error)` for non-AuthError, so if an upstream module throws a generic error during import/resolve, the wrapper re-raises it as `RuntimeError` with a generic message.

## Quick Diagnostic Script

Save as `scripts/debug_cron_provider.py`:

```python
#!/usr/bin/env python3
"""Trace resolve_runtime_provider to find real error behind wrapped messages."""
import sys, os, json
os.environ['HAGENT_HOME'] = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(os.environ['HAGENT_HOME']))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.environ['HAGENT_HOME'], '.env'), override=True, encoding='utf-8')

import hagent_cli.runtime_provider as rp
_orig_resolve = rp.resolve_runtime_provider

def _traced_resolve(**kwargs):
    print(f"Called with: {kwargs}", flush=True)
    try:
        result = _orig_resolve(**kwargs)
        print(f"Result: provider={result.get('provider')}, "
              f"api_key={'SET' if result.get('api_key') else 'EMPTY'}, "
              f"base_url={result.get('base_url')}, "
              f"model={result.get('model')}, "
              f"source={result.get('source')}", flush=True)
        return result
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", flush=True)
        import traceback; traceback.print_exc()
        raise

rp.resolve_runtime_provider = _traced_resolve

# Test with different requested values
for req in ['', 'pekpik-custom', 'pekpik', 'deepseek']:
    print(f"\n--- requested={repr(req)} ---", flush=True)
    try:
        rp.resolve_runtime_provider(requested=req or None)
    except Exception as e:
        print(f"  Caught: {e}", flush=True)
```

Run:
```bash
cd /Users/nguyenhat/HAgent/backend && .venv/bin/python3 scripts/debug_cron_provider.py
```

## Session Transcript (2026-05-26)

Problem: Cron job "Đọc tin mới 8h sáng" showed `last_error`:
```
RuntimeError: Provider 'pekpik' is set in config.yaml but no API key was found.
```

**Actual cause:** API key `sk-fN3...50jW` was expired (HTTP 401: 无效的令牌).

**Upstream trigger:** `nous_subscription.py` line 37 had syntax error (`classNousFeatureState:` instead of `class NousFeatureState:`) which caused import errors during toolset resolution. The import failure cascaded into a generic provider error.

**Fix:**
1. Fix syntax error: `s/classNousFeatureState:/class NousFeatureState:/`
2. Fix syntax error: `s/classNousSubscriptionFeatures:/class NousSubscriptionFeatures:/`
3. Get a fresh API key for the provider

**Lesson learned:** Always check for Python syntax errors in imported files FIRST when seeing "Cron toolset resolution failed, falling back to full default toolset" in the output. The import cascade can produce misleading downstream errors.
