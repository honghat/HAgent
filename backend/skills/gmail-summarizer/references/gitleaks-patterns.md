## 🔒 Gitleaks Credential Detection

### What Happened

Git hooks blocked commit with message:
```
❌ gitleaks phát hiện secret trong staged changes.
Gỡ secret khỏi commit, hoặc thêm vào .gitleaksignore nếu là false positive.
```

### Root Cause

Gitleaks scans staged changes for secrets including:
- OAuth tokens in `.json` credential files
- Client IDs, client secrets, access tokens  
- Any string with high entropy patterns

In this session, files like `google_tokens/honghac404_gmail.com.json` triggered the block.

### Solution Pattern

1. **Immediate Fix**: Unstage sensitive files before committing
   ```bash
   git reset HEAD sensitive_folder/
   # Then commit without those files
   ```

2. **Alternative for Dev Environments**: Add to `.gitleaksignore` with comment explaining why:
   ```
   google_tokens/*  # Local dev tokens, not production credentials
   ```

3. **Best Practice**: Separate credential management from code commits
   - Code + dependencies → commit normally
   - Credentials → manage via env vars, separate storage, or secret management tools

### Detection Rules

Gitleaks catches:
- Files containing `client_id`, `access_token`, `refresh_token`
- High-entropy strings that look like API keys
- Any JSON/YAML files with credential-like content

### Prevention Checklist

Before committing to staging area:
- [ ] Review staged files in `.json`, `.env`, `.yaml` for secrets
- [ ] Run `git diff --cached | grep -E '(token|secret|key)'` if available  
- [ ] Use `.gitleaksignore` sparingly and document each entry

---

## 📧 OAuth Pitfalls Reference

See full documentation in `../oauth-pitfalls.md`. Key lessons:
- Do not inspect `auth.json` for Gmail readiness (use `$GSETUP --check`)
- If user names an email, use `--account <email>` without listing accounts first
- Keep token files separate from code repository when possible

---

## 🔧 Multi-Account Gmail Setup

Supported account pattern discovered:
```bash
google_tokens/honghac404_gmail.com.json
google_tokens/honghat.thaco_gmail.com.json  
google_tokens/tetete40412a2_gmail.com.json
```

Usage:
```bash
$GAPI --account honghac404@gmail.com gmail search "in:inbox" --max 5
$GAPI --account honghat.thaco@gmail.com gmail mark-read "is:unread" --max 500
```