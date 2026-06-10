# Production Commit Checklist

## 📊 Environment Detection

### Detect PM2 services on current branch:

```bash
pm2 list | grep -E "hagent-(fastapi|backend)" && echo "🚨 PRODUCTION ENVIRONMENT DETECTED"
```

### Check active deployments:

```bash
git remote -v && git log --oneline -5 --decorate
```

### Verify no secrets in staged files:

```bash
# Quick check with gitleaks
gitleaks detect --source=. --include-staged 2>&1 | grep "Secret found" || echo "✅ No secrets"

# Manual grep for common patterns
git diff --cached | grep "^+.*\(password\|secret\|token\|key\)" | grep -vE "^\+\s*${HAGENT_API_KEY:-}" || true
```

---

## 📋 Pre-commit Gates (Production Only)

Run **ALL** these before `git commit`:

### 1. Frontend Linting (AGENTS.md Rule #4)

```bash
cd frontend && npm run lint
# Must pass with exit code 0
# Exit codes:
#   0 = clean ✅
#   >0 = errors found ❌
```

**Pitfall:** Never skip this for "quick fixes" — production users depend on stable frontend.

---

### 2. Security Scan (AGENTS.md Rule #2)

```bash
git diff --cached --name-status | grep -E "\.(py|js|ts|jsx)$" | xargs -I {} sh -c 'gitleaks detect --source="{}" --include-staged 2>&1 || true'

# If any output shows "Secret found" → unstage immediately:
git restore --staged <file>
```

**Why gitleaks:** Blocks OAuth tokens, API keys, private credentials before they hit git.

---

### 3. Commit Message Language (AGENTS.md Rule #5)

```bash
COMMIT_MSG=$(git commit -m "<message>" 2>&1 | head -1) || true
echo "$COMMIT_MSG" | grep -qE "^[a-zA-Z]+" && echo "❌ COMMIT MESSAGE IN ENGLISH — REJECTED" || echo "✅ Vietnamese message"

# Proper check:
PREPARED_MSG=$(echo "<intended commit message>")
if echo "$PREPARED_MSG" | grep -qE "[A-Z]{2,}"; then
  echo "⚠️ COMMIT MESSAGE CONTAINS ENGLISH — VERIFY BEFORE COMMIT"
fi
```

**Repository convention:** All commit messages in Vietnamese to maintain consistency.

---

### 4. File Size Compliance (AGENTS.md Rule #1)

```bash
# Check all modified files ≤ 2000 lines
git diff --cached --name-only | xargs -I {} sh -c 'LINES=$(wc -l <{}); echo "{}: $LINES lines"; [[ $LINES -gt 2000 ]] && echo "❌ EXCEEDS LIMIT" || echo "✅ OK"'

# If any file > 2000 lines → split before committing
```

**Rationale:** Single-file limits improve reviewability and reduce merge conflict surface.

---

## 🛡️ PM2 Service Health Check

Before committing to production branch:

```bash
# Check logs for new errors (last 100 lines)
tail -n 100 /Users/nguyenhat/.local/share/pm2/hagent-fastapi.log | grep -iE "error|exception" || echo "✅ No recent errors"

tail -n 100 /Users/nguyenhat/.local/share/pm2/hagent-backend.log | grep -iE "error|exception" || echo "✅ No recent errors"
```

**Never commit if:**
- ❌ New error patterns detected in last 5 minutes
- ❌ Deployment failures in production logs
- ❌ User reports issues on connected platforms

---

## 📝 Commit Message Template (Vietnamese)

```
Type: fix: | feat: | refactor: | docs: | chore:

Description (short, Vietnamese):

Body (optional - explain what, why, how).

Pitfalls fixed: [if applicable]
Related issue/PR: #[N] if applicable

Production notes: [brief impact assessment]
```

**Types:**
- `fix:` — Bug fixes for existing features
- `feat:` — New feature/endpoint/tool
- `refactor:` — Code reorganization without behavior change
- `docs:` — Documentation updates
- `chore:` — Build/config changes, dependency updates

---

## ⚠️ Common Pitfalls in Production Branches

| Symptom | Cause | Fix |
|---------|-------|-----|
| Lint errors appear after commit | Skipped `npm run lint` | Always run before commit |
| Commit rejected by gitleaks | Credentials in staged files | `git restore --staged <file>` + remove secrets |
| Commit blocked (wrong language) | English characters in Vietnamese text | Rewrite message in Vietnamese only |
| File too large (>2000 lines) | No size limit check | Split file or skip commit |
| PM2 services failing | Previous commit caused regression | Check logs before merge |
| Wrong files changed | Scope creep during coding | `git diff` → verify scope matches task |

---

## 🚨 Emergency Actions

### Undo a bad commit:

```bash
# Abort staged changes
git reset HEAD~1 && git restore -s HEAD~1

# Or if already pushed to origin (caution!)
git reset --hard HEAD~1  # ⚠️ WARNING: destructive

# Better: revert without pushing
git revert HEAD -m 2  # For merge conflicts only
```

### Check what will be committed:

```bash
git status && git diff --cached --stat
git diff --cached | head -100  # Preview first 100 lines
```

---

## ✅ Sign-off Checklist (Production)

Before running `git commit`:

- [ ] All modified files in staging (`git add -A`)
- [ ] Frontend lint passed (`npm run lint` = exit 0)
- [ ] No secrets detected by gitleaks
- [ ] Commit message in Vietnamese
- [ ] All files ≤ 2000 lines
- [ ] PM2 logs clean (no new errors)
- [ ] Changes within agreed scope
- [ ] User notified for permission (if required)

---

## 📚 References

- AGENTS.md rules: `/Users/nguyenhat/HAgent/AGENTS.md`
- Git commit convention: conventional commits (Vietnamese)
- Security scanning: gitleaks patterns → `backend/skills/gmail-summarizer/references/gitleaks-patterns.md`