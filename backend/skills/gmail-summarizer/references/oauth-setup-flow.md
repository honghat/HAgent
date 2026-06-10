# OAuth Setup Flow & Token Persistence

## The Problem (Fixed April 2026)

After `setup.py --auth-code CODE` completes:

| Before Fix | After Fix |
|------------|-----------|
| ✅ Token saved to `google_token.json` | ✅ Token saved to `google_token.json` |
| ❌ No per-account copy | ✅ Copy saved to `google_tokens/<email>.json` |
| ❌ No DB update | ✅ Upsert `google_accounts` with `enabled_for_agent=1` |
| ❌ `is_active` defaults to `0` | ✅ `last_status='connected'` set immediately |

**Symptom:** `$GAPI accounts list` shows an entry but `tokenReady=false` and
agent can't read/write emails for that account.

## The Fix

In `backend/skills/productivity/google-workspace/scripts/setup.py`,
`exchange_auth_code()` now calls `_persist_account_after_oauth()` after saving
the token.

### What `_persist_account_after_oauth()` does:

1. Loads the saved token from `google_token.json`
2. Calls Gmail API `users.getProfile` to get the authenticated email address
3. Creates per-account token at `google_tokens/<sanitized-email>.json`
4. Upserts into `google_accounts` table with:
   - `enabled_for_agent = 1`
   - `is_default = 0`
   - `last_status = 'connected'`

### Graceful degradation

If Gmail API call fails (network, quota, etc.), the function silently returns.
The default `google_token.json` still works — the agent just loses multi-account
support until the next OAuth re-run.

## Related Files

- **setup.py:** `exchange_auth_code()` (line ~337) → `_persist_account_after_oauth()` (line ~422)
- **google_api.py:** `_account_rows()` (line ~91) reads from `google_accounts` table
- **DB:** `HAGENT_HOME/../data/hagent.db` — table `google_accounts`

## Test Checklist

After running `--auth-code`:

```bash
# 1. Per-account token exists
ls -la "$HAGENT_HOME/google_tokens/"  # should have <email>.json

# 2. Account shows up with tokenReady=true
HAGENT_HOME="$HAGENT_HOME" python3 google_api.py accounts list
# → "tokenReady": true, "enabledForAgent": true

# 3. Can read emails for that account
HAGENT_HOME="$HAGENT_HOME" python3 google_api.py --account <email> gmail search "in:inbox" --max 3
```
