# Zalo Send API Patterns

## Endpoint

```
POST https://zalo.me/messaging
Content-Type: application/json
Cookie: {ZALO_COOKIE_STRING}

{
  "to": "<phone_number>",
  "type": "text",
  "message": "<message>"
}
```

## Auth Requirements

Zalo requires cookie-based authentication for messaging operations. Options:

### Option 1: Cookie from Browser (Recommended)

```bash
# Extract from browser DevTools
echo 'export ZALO_COOKIE_STRING="..."
' > ~/.hagent/omnichannel.env
```

### Option 2: Named Contacts JSON (No Auth Needed for Demo)

Store contacts with phone numbers, fallback to demo mode if no auth:

```json
[{"name":"Đại","phone":"0986123456"}]
```

## Rate Limiting

- 1 request per ~5s per number
- Returns `429` on cooldown
- Add `time.sleep(5)` between sends in batch operations

## Response Format

Success:
```json
{"status":"ok","message_id":"xxx-xxx-xxx"}
```

Error (rate limited):
```json
{"status":"error","code":"RATE_LIMITED","retry_after":5}
```

HTML response → Auth/session issue. Check `omnichannel.env` or browser session.

## Vietnamese Name Matching ⭐

**Critical:** Always normalize Vietnamese names before comparison:

```python
def normalize(text):
    import unicodedata
    return unicodedata.normalize('NFD', str(text)).encode('ASCII', 'ignore').decode()

# "ĐẠI" → "dai"
# Matches in any case variation or diacritic combination
```

## File Locations

- Cookie config: `~/.hagent/omnichannel.env`
- Contacts JSON: `~/.hagent/omnichannel_contacts.json`
- Main scripts: `~/.hagent/plugins/platforms/omnichannel/`
