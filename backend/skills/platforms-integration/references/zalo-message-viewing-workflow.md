# Zalo Message Viewing & API Limitations

## ⚠️ Core Limitation

**Zalo API does NOT support reading messages.** Unlike Telegram or Facebook Messenger, Zalo blocks programmatic message polling for security reasons.

```python
# ❌ This pattern WON'T WORK for Zalo:
messages = await api.get_messages(chat_id="...")  # ZalomeError: API not supported

# ✅ Required Pattern: Use browser interface directly
browser.open("https://chat.zalo.me")
# Click tab with new badge ● → Read messages in web interface
```

---

## Recommended Workflow

### Step 1: Authentication (One-Time)

**Method A: Browser Cookies** (Recommended for persistent use) ⭐

```bash
# Chrome DevTools → Application → Cookies → zalome.com tab
# "Copy as curl" from first cookie line
export ZALO_COOKIE_STRING='PHPSESSID=abc; zalome_userid=xxx; _zalo_session=yyy'
echo "$ZALO_COOKIE_STRING" >> ~/.zshrc  # Persist across sessions
```

**Method B: QR Code Scanning** (Quick setup) 🔁

```bash
# Zalo app scan QR at https://zalo.me/qrcode or desktop app menu
# Session-based auth (~30 min validity)
export ZALO_QR_ENABLED=true
```

### Step 2: Send Messages ✅

Use webhook polling adapter:

```bash
cd ~/.hagent/plugins/platforms/omnichannel
python3 send_zalo.py <zalo_number> '<message>'
```

Or gateway command:
```bash
hagent deliver zalo --chat YOUR_NUMBER '<message>'
```

**60s Cooldown Warning**: Zalo blocks rapid fire replies. Implement 60s+ delays between sends.

### Step 3: View Messages (INBOX) 📥

**Required Workflow:**

1. **Run Browser Automation Helper:**
   ```bash
   python ~/.hagent/plugins/platforms/omnichannel/view_zalo_messages.py
   ```

2. **Manual Browser Actions:**
   - Click Zalo tab in browser
   - Look for new message badges (● green/red indicator)
   - Click chat → Messages display at right panel

3. **Alternative: Direct URL:**
   ```bash
   open "https://chat.zalo.me"  # macOS
   # or use your default browser
   ```

---

## Files Reference

| File | Purpose | Usage |
|------|---------|-------|
| `send_zalo.py` | Sending adapter ✅ | `python3 send_zalo.py <num> 'msg'` |
| `view_zalo_messages.py` | Viewing helper ⭐ | Opens browser automation wrapper |
| `read_zalo_messages.py` | ❌ DEPRECATED | API-based reading (doesn't work) |
| `test_zalo_basic.py` | Connectivity check | Verify Zalo auth status |

---

## Platform Comparison Table

| Capability | Telegram | Facebook Messenger | **Zalo** |
|------------|----------|-------------------|----------|
| API Message Reading | ✅ REST endpoints | ✅ Playwright automation | ❌ **Browser-only** |
| API Message Sending | ✅ Bot API | ✅ Send messages | ✅ Webhook polling |
| Real-time Inbox Sync | ✅ Built-in | ✅ Event-driven | ❌ Manual browser check |
| E2EE Support | ✅ Native | ✅ PIN-handled | ✅ QR scan PIN |

---

## Pitfalls to Remember

1. **NO API POLLING**: Don't try `api.get_messages()` for Zalo → Won't work
2. **BADGE SYSTEM**: New messages have green ● badge in chat list
3. **60s DELAY MINIMUM**: Between sends to avoid rate limiting
4. **COOKIES RENEWAL**: Zalo refreshes cookies periodically → Check auth status

---

## Quick Commands Cheat Sheet

```bash
# Send message (works!)
python3 send_zalo.py '0912345678' 'Hello from Telegram! 👋'

# View inbox (opens browser)
python3 view_zalo_messages.py

# Check connection
python3 test_zalo_basic.py

# Verify cookie auth status
python ~/.hagent/plugins/platforms/omnichannel/test_zalo_basic.py
```

---

## Error Messages & Solutions

| Error | Solution |
|-------|----------|
| `ZalomeError: API not supported` | Use browser interface instead |
| `Timeout: 60s elapsed, still no reply token` | Zalo rate limit → wait or use `_keep_typing()` pattern |
| `Login required` | Refresh cookies via browser DevTools |
| `Badge ● not visible` | Check Zalo Desktop App instead |
