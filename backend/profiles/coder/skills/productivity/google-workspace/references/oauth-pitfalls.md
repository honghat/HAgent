# Google OAuth Pitfalls & Fixes

Session-specific knowledge from recent setups: Gmail/Calendar/Drive/Sheets/Docs via Hagent-managed OAuth.

## Common Error Patterns

### 1. Redirect URI Mismatch — "Error 400: redirect_uri_mismatch"

**Cause**: OAuth client created without `http://localhost:1` registered as authorized redirect URI.

**Fix**:
1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Find the desktop OAuth client and click ⋮ (more actions) → **Edit**
3. Under **Authorized redirect URIs**, add: `http://localhost:1`
4. Save, then download fresh JSON file

> This error is **NOT** a permission issue — it's purely configuration.

---

### 2. "Command not found" / "No such file or directory" with gws CLI

**Cause**: `gws` binary not installed OR PATH doesn't include its location.

**Fix Options**:

**Option A (Recommended)**: Use Python script directly
```bash
GAPI="python ${HAGENT_HOME}/skills/productivity/google-workspace/scripts/google_api.py"
$GAPI gmail search "is:unread" --max 10
```

**Option B**: Install gws package
```bash
uv pip install gws
```
Then run via `uv run gws` or add to PATH.

---

### 3. Path expansion errors (~ vs absolute path)

**Symptom**: Script says file doesn't exist even though you can see it in Finder.

**Fix**: Always use **tilde-expanded paths** in Python scripts:
```python
from pathlib import Path
home = Path.home()
token_path = home / ".hagent" / "google_token.json"
# NOT: "/Users/nguyenhat/hagent/google_token.json"
```

The `_hagent_home.py` helper handles this correctly. Don't hardcode full paths.

---

### 4. Token exists but API calls fail with "NOT_AUTHENTICATED"

**Cause**: `google_api.py` not picking up credentials from `~/.hagent/google_token.json`.

**Fix**:
1. Verify token file exists: `ls ~/.hagent/google_token.json`
2. Check scopes in token (should include `gmail.readonly`, `calendar`, etc.)
3. If only read-only, re-auth with full scopes for write operations
4. Revoke and re-authorize: `$GSETUP --revoke` then redo Steps 3-5

---

### 5. gws_bridge.py fails with ImportError/ModuleNotFound

**Cause**: `gws` package not installed OR not on sys.path.

**Fix**:
```bash
uv pip install gws
# Or if using system Python:
pip install gws
```

Verify installation:
```bash
uv run python -c "import gws; print(gws.__version__)"
```

---

## Working Setup Flow (Tested Pattern)

The sequence that reliably works on macOS/Linux:

1. **Client secret** → `$GSETUP --client-secret PATH`
2. **Auth URL** → `$GSETUP --auth-url` (sends full URL to user)
3. **User approves** → Copies redirected URL with code from `http://localhost:1/?code=...`
4. **Exchange code** → `$GSETUP --auth-code "THE_CODE_OR_FULL_URL"`
5. **Verify** → `$GSETUP --check` should print `AUTHENTICATED`

After Step 5, use `google_api.py` for all operations — it auto-loads token from `~/.hagent/google_token.json`.

---

## OAuth Scopes Reference

The OAuth flow grants these scopes automatically:

- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/documents`
- `https://www.googleapis.com/auth/contacts.readonly`

To narrow scopes (for minimal access), use:
```bash
$GSETUP --auth-url --services email,calendar
# or
$GSETUP --auth-url --services calendar,drive,sheets,docs
```

---

## Revoking and Re-Auth

Always revoke before changing scopes or re-authing fresh:

```bash
$GSETUP --revoke
# Then redo Steps 3-5 above
```

Token location: `~/.hagent/google_token.json` (auto-refreshes)
Secret location: `~/.hagent/google_client_secret.json`

---

## Advanced Protection Accounts

If user has **Advanced Protection** enabled (requires hardware security key):

1. Workspace admin must add OAuth client ID to org's allowed apps list
2. Or use Gmail App Password approach via `himalaya` skill instead

Check if account uses Advanced Protection: "Are you sure?" + "You probably don't" = normal setup continues.