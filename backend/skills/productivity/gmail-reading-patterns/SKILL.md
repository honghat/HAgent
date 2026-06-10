---
name: gmail-reading-patterns
description: "Email reading, summarization, and pattern documentation for Gmail via Google Workspace API."
version: 1.0.0
author: Hagent Agent
license: MIT
platforms: [macos, linux, windows]
metadata:
  email:
    tags: [gmail, summarization, google-workspace, security-alerts, attachments]
---

# Gmail Reading & Summarization Patterns

This skill documents the proven workflow for reading and summarizing Gmail emails using Google Workspace API scripts.

## Canonical Commands

```bash
GSETUP="python3 backend/skills/productivity/google-workspace/scripts/setup.py"
GAPI="python3 backend/skills/productivity/google-workspace/scripts/google_api.py"
```

## When to Use

- User requests "đọc email", "summarize emails", or "show unread messages"
- User wants quick inbox overview without reading each email individually
- Security alerts need attention and classification
- Creator/tutorial emails with attachments need content extraction

## Workflow

### 1. Check Authentication

First, verify Gmail access:

```bash
$GSETUP --check
```

**Expected output:** `AUTHENTICATED: Token valid at <path>`

If missing, follow setup wizard or use alternative auth (OAuth).

### 2. Search for Unread Emails

```bash
$GAPI gmail search "is:unread" --max 10
```

Returns thread IDs for unread emails.

### 3. Fetch Email Content

```bash
$GAPI gmail get <thread_id>
```

Pass comma-separated IDs to fetch multiple emails at once.

## Key Email Categories

### 🔐 Security Alerts (HIGH Priority)

**Characteristics:**
- From: `no-reply@accounts.google.com`
- Subject contains "Cảnh báo bảo mật", "Security Alert"
- Mentions domain that accessed account (e.g., `hatai.io.vn`)

**Required Links to Extract:**
1. Activity check: `myaccount.google.com/alerts/<thread_id>`
2. Connection management: `myaccount.google.com/connections/overview/<thread_id>`

**Response Pattern:**
```markdown
### 🔐 Security Alert: [domain] accessed your account
- **From:** Google <no-reply@accounts.google.com>
- **Date:** [extracted date]
- **Alert:** [domain] was allowed to access your Google data
- **Verify here:** myaccount.google.com/alerts/<thread_id>
- **Manage access:** myaccount.google.com/connections/overview/<thread_id>
→ **ACTION REQUIRED**: Please verify this wasn't you
```

### 📚 Tutorial/Creator Emails (MEDIUM Priority)

**Characteristics:**
- From: Patreon creators, YouTube channels (`@creator.patreon.com`)
- Subject contains tutorial/course title
- Contains video links and/or downloadable attachments

**Content Structure:**
- Video embed or link (`https://youtu.be/...`)
- Attachment section with JSON/config files
- Platform-specific content (ComfyUI workflows, etc.)

**Response Pattern:**
```markdown
### 📚 Tutorial: [Subject]
- **From:** [Creator name] <creator@patreon.com>
- **Date:** [extracted date]
- **Resource:** Untwisting RoPE Complete ComfyUI Tutorial
- **Video:** https://youtu.be/XspNd80PADY

**Attachments (3 files)**:
  - flux2_klein_9b.json — Flux-2 Klein model config
  - qwen_image_edit_2511.json — Qwen model edit config  
  - z_image_turbo-UntwistingROPE.json — Z-Image Turbo config
```

### 📊 Daily Digest (LOW Priority)

Auto-generated summaries from HAgent summarizer service. Lower priority unless contains new information.

## Content Extraction Rules

1. **Extract metadata first**: subject, from, date, labels
2. **Look for `<body>` section** — skip image placeholders `[image: ...]`
3. **Focus on text content** between heading/paragraph tags
4. **Extract actionable links** — buttons, CTAs, important URLs
5. **Group attachments** under clear heading with file descriptions

## Summary Format Template

```markdown
## 📧 Email Summary

### 1️⃣ [Subject]
- **From:** [Sender name/email]
- **Date:** [Human-readable date/time]
- **Category:** 🔐 Security | 🤖 AI/ML | 📚 Tutorial | 📊 Digest
- **Summary:** [2-3 sentence plain text summary]

**Attachments (if any)**:
  - file1.ext — brief description
  - file2.ext

**Links**:
  → https://example.com/link1
  → https://example.com/link2
```

## Pitfalls & Gotchas

### ❌ Never Assume Disconnection
If `$GAPI gmail get` succeeds, inbox is readable immediately. Don't decide Gmail is disconnected from `auth.json` just because a script error occurred.

### ✅ HTML Parsing Order
When content is truncated or malformed:
1. Extract subject from metadata JSON (`"subject": "..."`)
2. Extract from/from/date from headers
3. Parse HTML body for main text
4. Skip image placeholders and UI elements
5. Focus on heading tags (h1-h6) and paragraph tags

### ✅ Multi-Account Handling
If multiple accounts configured:
- Check token paths under `$HAGENT_HOME/tokens/google_tokens/`
- Use `--account <email>` when needed
- See `gmail-summarizer/SKILL.md` for full multi-account guide

## Setup (if needed)

### Authentication Check
```bash
$GSETUP --check  # Verify current status
# If missing credentials:
$GSETUP init     # Interactive setup wizard
```

Token location: `/Users/nguyenhat/HAgent/backend/tokens/google_token.json`

### Multi-Account Setup
For multiple Google accounts:
- Tokens stored in `$HAGENT_HOME/tokens/google_tokens/<email>.json`
- Use `--account <email>` to specify account

## Examples from Session

### Security Alert Example
```json
{
  "subject": "Cảnh báo bảo mật",
  "from": "Google <no-reply@accounts.google.com>",
  "body_summary": "Cho phép hatai.io.vn truy cập tài khoản Google. Đề xuất kiểm tra quyền truy cập."
}
```

### Tutorial Email Example
```json
{
  "subject": "Untwisting RoPE Complete ComfyUI Tutorial...",
  "attachments": [
    "flux2_klein_9b.json",
    "qwen_image_edit_2511.json",
    "z_image_turbo-UntwistingROPE.json"
  ],
  "video_link": "https://youtu.be/XspNd80PADY"
}
```

## References

- `/Users/nguyenhat/HAgent/backend/skills/productivity/google-workspace/scripts/setup.py` — Authentication setup
- `/Users/nguyenhat/HAgent/backend/skills/productivity/google-workspace/scripts/google_api.py` — API client
- `gmail-summarizer/SKILL.md` — Full authentication setup and search patterns

---

**Related Skills**: `gmail-summarizer`, `hagent-agent` (general configuration)