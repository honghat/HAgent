---
name: gmail-summarizer
description: "Summarize Gmail emails with concise, direct output. Uses Google Workspace API for authentication and email retrieval."
version: 1.0.0
author: Hagent Agent + Teknium
license: MIT
platforms: [macos, linux, windows]
metadata:
  gmail:
    tags: [email, summarization, google-workspace, productivity]
---

# Gmail Email Summarizer

This skill summarizes Gmail inbox content using the Google Workspace API with token-based authentication.

Canonical commands. Use these exact absolute paths; do not guess relative paths:

```bash
GSETUP="python3 /Users/nguyenhat/HAgent/backend/skills/productivity/google-workspace/scripts/setup.py"
GAPI="python3 /Users/nguyenhat/HAgent/backend/skills/productivity/google-workspace/scripts/google_api.py"
```

For multiple authorized Google accounts:

```bash
$GAPI --account honghac404@gmail.com gmail search "in:inbox" --max 5
$GAPI --account honghac404@gmail.com gmail get ID1,ID2
$GAPI --account honghac404@gmail.com gmail mark-read "is:unread" --max 500
```

If the user names an email address, always pass `--account <email>`.
Do not run `$GAPI accounts list` first in that case. Only list accounts when
the user did not name an email or when the command returns unknown account.

## When to Use

- User asks to "summarize recent emails", "show my latest messages", or similar requests involving email content retrieval and summarization.
- User wants a quick overview of their inbox without reading each email individually.

## Workflow

### 1. Check Authentication

First, verify Gmail access via the Google Workspace setup:

```bash
$GSETUP --check
```

**Expected output:** `AUTHENTICATED: Token valid at <path>`

If authentication fails or is missing, follow the error message to set up credentials (see [Google Setup](#google-setup) below).
If the user named a specific email account, skip this check unless the direct
Gmail command fails with an auth error.

### 2. Search for Emails

Use the Gmail search endpoint with an appropriate query (e.g., `"in:inbox"`):

```bash
$GAPI gmail search "in:inbox" --max <N>
```

Replace `<N>` with the desired number of emails (commonly 5 for summaries).

### 3. Fetch Email Content

For each email ID returned, fetch the full content:

```bash
$GAPI gmail get <EMAIL_ID>
```

Multiple emails can be fetched in a single call by comma-separating IDs (e.g., `id1,id2,id3`).

### 4. Summarize Content

Parse the retrieved HTML/text content and extract:

- **Subject** - from email metadata
- **Sender** - formatted name or email address
- **Date** - ISO 8601 or human-readable format
- **Key Content** - main message, excluding UI elements, signatures, etc.
- **Action Items/Links** - relevant URLs or important calls to action

## Formatting Rules ⚠️

**CRITICAL:** Follow user preference for concise, direct output:

- ❌ NO heavy markdown sections with multiple emojis
- ❌ NO verbose introductions ("Here's your email summary!")
- ✅ Use bullet points and tables for clarity
- ✅ Keep each email to 3-5 sentences max
- ✅ Group by category if helpful (🔐 Security, 🤖 AI/ML, etc.)
- ✅ End with a single-line summary of key takeaways

**Example good format:**
```
## 📧 Email Summary

### 1️⃣ Subject: "Important Notice"
- **From:** Support Team <noreply@company.com>
- **Date:** 23/05/2026 - 14:06
- **Summary:** Password reset requested. Click link to verify if not you.

### 🔐 Security Alerts (2 found)
→ Check activity at myaccount.google.com/alerts
```

## Output Template

Use this structure for summaries:

```markdown
## 📧 Email Summary

[Category or priority indicator]

### 1️⃣ **[Subject]**
- **From:** [Sender name/email]
- **Date:** [Human-readable date/time]
- **Summary:** [2-3 sentence plain text summary]
- **Action:** [What user should do, if any]

### [Continue for each email...]

## 📊 Quick View
- Total: [N] emails
- 🔐 Security alerts: [N]
- 🤖 AI/ML content: [N]
- ⚠️ Needs attention: [Y/N]
```

## Google Setup (if needed)

If authentication check fails, set up Gmail access:

```bash
$GSETUP --check  # Verify current status
# If missing credentials:
$GSETUP init     # Interactive setup wizard
```

The token file is located at: `/Users/nguyenhat/HAgent/backend/tokens/google_token.json` (or in Google Workspace credential store).

## Tips & Pitfalls

### Common Issues

| Issue | Solution |
|-------|----------|
| "unauthorized" error | Run `$GSETUP --check` and run `$GSETUP init` to re-authenticate |
| No results from search | Try `"in:inbox"` or broader query like `""` |
| HTML content too long | Focus on extracting text between `<body>` tags, ignore image placeholders |
| Multiple security alerts in one thread | Group them under single entry with count badge (e.g., "🔐 2 alerts") |
| `$GAPI accounts list` returns empty despite having accounts | The `_hagent_home.py` module resolves HAGENT_HOME by looking for `.hagent-home` marker or walking up from script location — NOT from the `$HAGENT_HOME` env var. If the actual token lives under `backend/` (e.g. `backend/tokens/google_token.json`), set `HAGENT_HOME="${HOME}/HAgent/backend"` in the command env: `HAGENT_HOME="${HOME}/HAgent/backend" $GAPI gmail search "in:inbox" --max 5` |
| `--account <email>` fails with "Unknown Google account" | The `--account` flag looks up per-account token files in `$HAGENT_HOME/tokens/google_tokens/` directory. If the default token `tokens/google_token.json` works but per-account tokens don't exist yet, run without `--account` to use the default. Run `$GAPI accounts list` (with the right HAGENT_HOME) to see registered accounts and their `tokenReady` status. |

### Best Practices

1. **Group by category** - Security alerts together, tech/ML news separate from newsletters
2. **Prioritize action items** - Security checks → AI resources → informational content
3. **Keep summaries brief** - User prefers short, simple answers; no walls of text
4. **Include direct links** - Provide myaccount.google.com for security alerts
5. **Date format** - Use "Thứ Bảy, 23/05/2026 - 14:06" (Vietnamese day name preferred)

### Content Extraction Order

When parsing HTML emails:
1. Extract metadata first (subject, from, date, labels)
2. Look for `<body>` section for main content
3. Skip image placeholders (`[image: ...]`) 
4. Focus on text between heading tags and paragraphs
5. Extract links/buttons that are actionable

## Related Skills

- `hagent-agent` - General HAgent configuration, tools management
- Deep research skills for broader web searches beyond email

---\n\n## References

### Setup Files
- `/Users/nguyenhat/HAgent/backend/skills/productivity/google-workspace/scripts/setup.py` - Authentication setup
- `/Users/nguyenhat/HAgent/backend/skills/productivity/google-workspace/scripts/google_api.py` - API client

### Token Locations
- Default: `/Users/nguyenhat/HAgent/backend/tokens/google_token.json`
- Python site-packages: `/Users/nguyenhat/Library/Python/3.9/lib/python/site-packages/google/oauth2/_default_credentials.json`

### Search Queries
| Query | Description |
|-------|-------------|
| `"in:inbox"` | Only inbox messages |
| `"in:starred"` | Starred emails |
| `""` (empty) | All labels |
| `"label:IMPORTANT"` | Important label only |
| `"in:sent"` | Sent messages |

---\n\n### Session-Specific Details

See `references/` for detailed error transcripts, search patterns, and provider quirks discovered during use.

5. **ITviec Job Robot Emails**: When the user receives ITviec Job Robot emails with structured job listings (numbered, employer, salary, skills), use `references/itviec-job-robot-parsing.md` for the extraction pattern and presentation format. These are regular Gmail messages from `itviec+jobrobot+1@itviec.com`.

**Critical Lessons:**

1. **Multi-Account Support**: Gmail can be authenticated via multiple accounts stored in separate token files (e.g., `honghac404@gmail.com.json`, `honghat.thaco_gmail.com.json`). Use `--account <email>` to specify which account when using multi-account setup.

2. **Gitleaks Security**: Git commits containing credentials (tokens in `.json` files with keys like `client_id`, `access_token`) trigger Gitleaks warnings. Solution:
   - Never add credential files to staged changes  
   - Use separate storage for tokens vs code commits
   - See [gitleaks-patterns.md](references/gitleaks-patterns.md) for prevention checklist

3. **OAuth Pitfalls:** See [oauth-setup-flow.md](references/oauth-setup-flow.md) for the complete OAuth token persistence flow and DB registration. After OAuth completes, tokens are automatically saved per-account and the `google_accounts` DB row gets `enabled_for_agent=1`.

4. **Formatting Priority**: User explicitly prefers "short, simple answers — no formatting fluff." Apply concise format immediately unless user requests detailed output.
