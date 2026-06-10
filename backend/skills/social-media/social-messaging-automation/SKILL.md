---
name: social-messaging-automation
description: Automate cross-platform message sending/reading across Zalo, Facebook Messenger, Telegram
trigger_conditions: |
  - User wants to send/read messages on Zalo, Facebook Messenger, Telegram
  - Cross-platform messaging automation needed
  - Platform-specific adapters exist but user doesn't want manual configuration each time
references:
  - references/zalo-send-api.md
  - references/message-webhook-patterns.md
  - references/vietnamese-name-normalization.md
  - references/omnichannel-backend-integration.md  # OmniChat unified API server
templates:
  - templates/omnichannel_env.example
scripts: []
category: social-media
---

# 📱 Social Messaging Automation

**Automate cross-platform message sending/reading across Zalo, Facebook Messenger, Telegram with minimal manual steps.**

## Trigger Conditions

Use this skill when:
- User wants to send/read messages on Zalo, Facebook Messenger, Telegram
- Cross-platform messaging automation needed (e.g., Telegram notifications for Zalo messages)
- Platform-specific adapters exist but user doesn't want manual configuration each time
- Webhook patterns or polling needed for real-time message delivery

## Usage Patterns

### Zalo: Name-Based Sending ⭐⭐⭐ (User Preference!)

**IMPORTANT:** User explicitly prefers **NAME-BASED** sending, NOT phone number lookup!

```bash
# Zalo - by NAME ONLY (recommended, no manual number entry)
python3 backend/plugins/platforms/omnichannel/send_name_only.py <name> '<message>'
# Example: python3 send_name_only.py Đại 'Chào bạn!'

# Interactive mode - enter names from config file
python3 backend/plugins/platforms/omnichannel/send_name_only.py

# Zalo - API-based phone number sending (fallback only)
python3 backend/plugins/platforms/omnichannel/send_zalo.py <phone> '<message>'
```

### Telegram Notifications (Zalo→Telegram cross-platform)

```bash
# Set up once, then monitor
python3 backend/plugins/platforms/omnichannel/zalo_telegram_bot.py setup

# Then run in background  
nohup python3 backend/plugins/platforms/omnichannel/zalo_telegram_bot.py monitor >> logs/zalo-tg.log 2>&1 &
```

### View Zalo Messages (Browser Automation)

```bash
python3 backend/plugins/platforms/omnichannel/view_zalo_messages.py
# Opens browser to Zalo UI (already authenticated via stored credentials)
```

## Contacts JSON Config File Pattern ⭐

**Persistent contact store for name-based messaging workflows.**

Store contacts in `backend/omnichannel_contacts.json`:

```bash
cat > backend/omnichannel_contacts.json << 'EOF'
[{"name":"Đại","phone":"0986123456"},{"name":"User Account","phone":"+841234567890"}]
EOF
```

**Then send by name only:**

```bash
python3 backend/plugins/platforms/omnichannel/send_name_only.py Đại 'Chào bạn!'
# → Script finds matching contact and sends via browser automation
```

### Config File Best Practices
- UTF-8 encoded, JSON array format
- Each contact: `{name, display_name (optional), phone}`
- Vietnamese names work with diacritic normalization built-in

---\n\n## 📁 Files Structure

```bash
/Users/nguyenhat/HAgent/backend/plugins/platforms/omnichannel/
├── send_zalo.py                      # Direct phone number sending (API fallback)
├── send_by_name_final.py             # Name-based via contacts.json ⭐
├── send_auto_by_name.py              # Auto-fetch from chat history (experimental)
├── send_name_only.py                 # Browser automation, name-search only ⭐⭐⭐ USER PREFERRED
├── view_zalo_messages.py             # Browser viewer for messages (read-only)
├── read_zalo_messages.py             # Fetch contacts from browser session
├── zalo_telegram_bot.py              # Full monitoring + notification system
├── __init__.py                       # Gateway integration layer
└── README.md                         # Platform docs

/Users/nguyenhat/HAgent/backend/
└── omnichannel_contacts.json         # Persistent contact store ⭐
```

## References

- `references/zalo-send-api.md` - Zalo messaging API patterns, endpoint details
- `references/message-webhook-patterns.md` - Webhook vs polling tradeoffs  
- `references/vietnamese-name-normalization.md` - Diacritic normalization for Vietnamese names
- `references/zalo-ui-search-patterns.md` - Browser UI search for contact chats
- `references/vietnamese-name-normalization.md` - Diacritic normalization for Vietnamese names
- `templates/omnichannel_env.example` - Cookie storage template

## Templates

See: `templates/` for platform-specific env file examples (OAuth tokens, cookie paths)

## Scripts

See: `scripts/` for auto-setup scripts (Telegram bot creation probe, webhook registration helpers)

---

## ⚠️ PITFALLS (CRITICAL - DO NOT IGNORE!)

### 🚫 PAIN POINT #1: USER HATES MANUAL SETUP STEPS

**NEVER say:** "Please run X command to setup @BotFather manually"  
**DO instead:** Create automation script that handles credential acquisition internally

> User says: "ngu ghê, tao cần mày làm chứ mày không có chỉ tao làm"  
> **Lesson:** FULL AUTOMATION PREFERRED. If setup requires manual API calls (like @BotFather), create a wrapper that prompts inline OR auto-discovers existing credentials first.

### 🚫 PAIN POINT #2: "I NEED TO TELL USER TO COPY TOKEN FROM ZALO BROWSER"

**NEVER:** Guide user to F12 → Application → Cookies → Copy as curl  
**DO instead:** Use stored credential files, OAuth tokens, or browser automation (Playwright/Puppeteer) that already has the cookie

> Pattern: Always check for existing credentials FIRST. Only fallback to manual extraction when no stored auth exists AND provide inline prompts within the script itself (not separate instructions).

### 🚫 PAIN POINT #3: ZALO DOESN'T HAVE PUBLIC MESSAGE-READING API

**TRUTH:** Zalo `/messaging` endpoint returns empty or requires private app registration.  
**WORKAROUND:** Use browser automation OR user accepts opening web interface for read-only operations

> **Never promise full bi-directional reading/writing on Zalo without OAuth app.** Be honest about platform limits up front in the skill's docs.

### 🚫 PAIN POINT #4: PHONEBOOK FETCHING FAILS VIA PUBLIC API

**TRUTH:** `/phonebook/` endpoint returns 401 or empty data without OAuth  
**WORKAROUND:** Parse from conversation history, user's local phonebook export, or accept that broadcast-to-all-contacts isn't viable

> **Lesson:** If contact lookup fails via public API, fall back to: (1) user-provided contact list file, (2) recent chat history parsing, (3) name-based browser UI search only

### 🚫 PAIN POINT #5: USER PREFERS NAME-BASED SENDING, NOT PHONE NUMBERS ⭐⭐⭐

**USER EXPLICITLY SAID:** "mày ngu thật, cấm gửi thông qua số điện thoại"  
**LESSON:** Never use phone numbers as primary identifiers. Use name-based matching from `omnichannel_contacts.json` config file instead.

> **Critical:** Contact lookup should prioritize NAME MATCHING over PHONE NUMBER lookups. Browser automation (Playwright) can search UI for contact names directly without needing phone numbers.

### 🚫 PAIN POINT #6: VIETNAMESE NAME MATCHING REQUIRES DIACRITIC NORMALIZATION

**NEVER:** Direct string comparison of Vietnamese names with diacritics  
**DO instead:** Normalize to ASCII by removing diacritics before comparison

```python
def normalize(text):
    import unicodedata
    return unicodedata.normalize('NFD', str(text)).encode('ASCII', 'ignore').decode()

# "Đại" matches "nguyễn hữu đại" because:
# normalize("đại") → "dai"  
# normalize("nguyễn hữu đại") → "nguyen huu dai"
```

> **Critical:** Always use diacritic normalization for Vietnamese name matching. Without it, `find_contact("ĐẠI", contacts)` won't match `"Đại"` in the config file.

---\n\n## 🔧 Platform-Specific Notes

### Zalo

```python
# Cookie-based auth (store in backend/omnichannel.env):
export ZALO_COOKIE_STRING="sessionid=xxx; user_id=yyy"

# Send endpoint: POST /messaging
# Rate limit: 1 request per ~5s per number, or 429 cooldown

# Public API limitations:
# ❌ No contact phonebook access (needs OAuth app)
# ❌ No message read receipt API
# ✅ Sending works with cookie auth
```

### Telegram

```python
# Use existing bot token from backend/telegram_token.json or similar
# Or create new via inline prompt if not exists

# Polling pattern: 15s intervals for real-time
# Webhook pattern: Requires server endpoint hosting (not ideal for local automation)
```

### Facebook Messenger

```python
# Uses fbsbx.com cookies + E2EE PIN handling
# See adapter.py at ~./hagent/plugins/platforms/facebook/adapter.py
```

---

## 📁 Files Structure

```
/Users/nguyenhat/HAgent/backend/plugins/platforms/omnichannel/
├── send_zalo.py                    # Direct phone number sending (PRIMARY)
├── send_by_name_final.py           # Name-based sending with diacritic matching ⭐
├── send_auto_by_name.py            # Auto-fetch from chat history (experimental)
├── view_zalo_messages.py           # Browser viewer for messages (read-only fallback)
├── zalo_telegram_bot.py            # Full monitoring + notification system
├── __init__.py                     # Gateway integration layer
└── README.md                       # Platform docs

/Users/nguyenhat/HAgent/backend/
└── omnichannel_contacts.json       # Persistent contact store ⭐
```

---

## ✅ Recommended Workflow

1. **Check existing credentials** - Load from `backend/omnichannel.env` or similar
2. **Prompt inline if needed** - Don't say "go open browser", embed prompt in script
3. **Use fallback patterns** - If API fails, try alternative (browser viewer, direct URL)
4. **Document platform limits** - Be honest about what's possible on each platform
5. **Batch operations** - Where possible, provide broadcast modes or contact file imports

---

## 🧪 Testing Pattern

For any new adapter:

```bash
# 1. Test cookie load first
python3 test_auth.py

# 2. Test send with known number
python3 send_zalo.py 0986123456 'Test message!'

# 3. Test name-based sending (with diacritic normalization)
python3 send_by_name_final.py Đại 'Chào bạn!'

# 4. Test notification loop (for Zalo→Telegram)
python3 zalo_telegram_bot.py monitor --test-mode
```

---

## 🔗 Related Skills

- `facebook-messenger-messages` - Similar cross-platform messaging pattern
- `platforms-integration` - Unified integration docs for all platforms