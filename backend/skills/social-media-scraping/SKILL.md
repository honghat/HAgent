---
name: social-media-scraping
description: "Facebook, Zalo, Telegram, Shopee scraping patterns and limitations. Covers browser automation vs official API tradeoffs for group feeds, inbox monitoring, order notifications, and content extraction."
version: 1.0.0
author: HatNguyen/Hat Nguyen
platforms: [linux, macos, windows]
tags: [scraping, facebook, zalo, telegram, shopee, anti-scraping]
---

# Social Media Scraping Patterns & Limitations

## Overview

This skill covers **content scraping** from social media platforms (Facebook groups, Zalo inbox, Telegram channels) using browser automation vs official APIs. Differentiates between:
- ✅ **Navigation**: Successfully load pages and see titles/metadata
- ❌ **Content Reading**: Blocked by anti-scraping without proper auth/proxy

## Platform-Specific Limitations Matrix

| Platform | Feed Navigation | Content Reading | API Polling | Auth Method | Notes |
|----------|-----------------|-----------------|-------------|-------------|-------|
| **Facebook Groups** | ✅ Works | ❌ Blocked* | ❌ Not supported | Cookies/Proxy | Requires Graph API/residential proxy |
| **Facebook Messenger Threads** | ✅ Works | ✅ Via cookies | ✅ Graph API | fbsbx.com cookies | - |
| **Zalo (Web/App)** | ⚠️ Badge detection | ✅ Manual only | ❌ No polling | Browser interface | See zalo-message-viewing-workflow.md |
| **Telegram Channels** | ✅ Native API | ✅ Full content | ✅ Polling | Bot token | Best for high-frequency needs |
| **Shopee.vn** | ⚠️ Captcha screen | ✅ After bypass | ❌ Not supported | Skip button | Click "bỏ qua nội dung chính" to bypass |

\* Facebook Groups block content even with valid session cookies. Requires Graph API or residential proxies + automation.

\* Facebook Groups specifically block content extraction even with valid session cookies. Requires Graph API or residential proxies + automation.

---

## Platform A: Facebook Groups

### Limitation 1: Content Blocked Without Proxy 🚨

Browser automation tools (`browser_*` commands) can **navigate** to groups but **CANNOT READ POST CONTENT** due to bot detection/anti-scraping when not using residential proxies or proper auth cookies.

**What works**:
- ✅ Opening `https://facebook.com/groups/<groupname>` successfully
- ✅ Seeing group info, member counts, descriptions
- ✅ Getting post metadata (author names like "John Doe", timestamps like "7 giờ", "3 giờ")
- ✅ Clicking links and following navigation paths

**What fails**:
- ❌ **Reading actual post text bodies** — content hidden by FB's bot detection
- ❌ **Extracting images/media content** — blocked without proper auth/proxy
- ❌ **Loading comment threads fully** — requires Graph API access token
- ❌ **Parsing video embeds/carousels** — need OAuth scopes

### Critical Distinction: Facebook Groups vs Messenger

| Feature | Facebook Groups | Messenger Threads |
|---------|-----------------|-------------------|
| Feed navigation | ✅ Works | ✅ Works |
| Post content reading | ❌ Blocked (bot detection) | ✅ Via cookies/auth |
| Comment threads | ❌ Graph API only | ✅ Via cookies |
| Required for content | Residential proxy OR Graph API | fbsbx.com cookies |

**🚨 Why this matters**: When Facebook group feed doesn't display post content, it's **Facebook-specific protection**, not a browser tool limitation. This is different from Zalo's "no API message reading" (which lacks polling capability entirely).

### Limitation 2: Cookie Auth Insufficient

Even with full login cookies (`c_user`, `ux`, `datr`), Facebook still blocks group feed content extraction for automation tools without:
- Residential proxy (to mimic real users)
- Human-like behavior patterns (random scroll delays, natural mouse movements)

### Solutions

#### Option A: Facebook Graph API (Recommended for Production)

**Setup**:
1. Create FB Developer account → New App → Facebook Graph API
2. Request `pages_read_engagement` scope for group feed access
3. Generate Page Access Token (lifetime refreshable)
4. Use `https://graph.facebook.com/v18.0/<group_id>/posts` endpoint

**Example**:
```bash
curl -X GET "https://graph.facebook.com/v18.0/123456789/posts?limit=25&fields=message,created_time,from" \
  -H "Authorization: Bearer PAGE_ACCESS_TOKEN"
```

**Pros**: Stable, pagination support, official rate limits (30 calls/sec)  
**Cons**: Requires app registration, OAuth flow, token management

#### Option B: Playwright + Full Cookies + Residential Proxy

**When to use**: Ad-hoc monitoring, educational use, occasional scraping

**Setup**:
1. Login to Facebook in browser → Copy cookies from DevTools (`fbsbx.com` tab)
2. Set proxy via Playwright config (residential IP pool required)
3. Apply scroll simulation with delays between actions

```python
from playwright.sync_api import sync_playwright, ProxySettings

proxy = ProxySettings(server="http://user:pass@proxy-server:8080")  # Residential proxy required

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=False,
        proxy=proxy
    )
    page = browser.new_page()
    
    # Apply cookies from file or env var
    with open('.browser-cookies', 'r') as f:
        cookies = json.load(f)
    page.add_init_script('''
      for(let cookie of document.cookie.split(';')) {
        document.cookie = cookie.replace(/^ +/, "");
      }
    ''')
    
    page.goto('https://facebook.com/groups/nghiienai/')
    page.scroll_to_bottom()  # Scroll with artificial delays
    
    browser.close()
```

**Pros**: Can extract both text and images  
**Cons**: Requires proxy service (~$5-10/month), complex setup, rate limiting issues

#### Option C: Hybrid Approach (Metadata + Manual Review)

Use browser automation to get metadata (timestamps, authors) then human reads actual content for important posts.

### Pitfalls

1. **Don't assume cookies work**: Group feed content is still blocked even with valid session
2. **Rate limit aggressively**: Facebook will ban IPs making rapid requests without proper auth
3. **Expect anti-bot detection**: Modern browsers, no headless mode, visible proxy indicators help
4. **Accept metadata-only results** when automation limitations occur

---

## Platform B: Zalo

### Limitation 1: No API Message Reading

Zalo API does NOT support reading messages like Telegram/Facebook Messenger (see `platforms-integration` skill for full details).

### Limitation 2: Badge Detection Only

Can only detect NEW messages via inbox badge ● → must open web/app to read content.

**Workaround**: Browser automation with `view_zalo_messages.py` wrapper.

---

## Platform C: Telegram

### Capabilities (No Major Limitations)

**All features work via native API**:
- Feed navigation ✅
- Content reading ✅  
- Message polling ✅
- No anti-scraping restrictions

**Recommended for**: High-frequency monitoring, production scraping needs.

---

## Comparison Table: Scraping Method Selection

| Use Case | Best Tool | Why |
|----------|-----------|-----|
| Production data collection (daily posts) | Facebook Graph API | Stable, structured output |
| Occasional group browsing | Browser + snapshots | Simple, manual review |
| High-frequency needs | Telegram Bot API | No rate limits, full content |
| Educational/research use | Playwright + proxy | Flexible, can test features |
| Quick metadata extraction | Browser automation | Fast for titles/timestamps only |

---

## Files & References

- **`references/facebook-group-feed-scraping-limitations.md`**: Facebook group API/automation tradeoffs ⭐
- **`references/zalo-message-viewing-workflow.md`**: Zalo API limitations & browser-only reading guide
- **`references/facebook-group-feed-bot-detection.md`**: Critical bot detection blocking — Graph API required 🚨
- **`templates/facebook-graph-api-setup.md`**: Complete Graph API integration boilerplate
- **`templates/browser-group-reader.py`**: Playwright automation wrapper with scroll detection

---

## Usage Examples

### Example 1: Get Facebook Group Post Metadata Only

```bash
# Quick metadata (author, timestamp) without full content
browser_navigate("https://facebook.com/groups/nghiienai/")
browser_press("down")  # Scroll through feed
browser_snapshot()    # Capture visible text for metadata only
```

### Example 2: Production Facebook Group Scraping Setup

```bash
# Use Graph API instead
# 1. Create FB Developer App (fb.dev)
# 2. Get Page Access Token with pages_read_engagement scope
# 3. Query posts via curl endpoint

curl -X GET "https://graph.facebook.com/v18.0/123456789/posts?limit=25&fields=message,created_time,from,reactions" \
  -H "Authorization: Bearer YOUR_PAGE_ACCESS_TOKEN" | jq '.'
```

### Example 3: Telegram Channel Monitoring (Recommended Alternative)

```bash
# Telegram native API - works perfectly without limitations
hagent deliver telegram --chat @yourchannel --message "Bot message"
# Or use gh API for public channels via curl
curl -X GET "https://api.telegram.org/bot<TOKEN>/getUpdates?timeout=30"
```

---

## When to Switch Platforms

If Facebook scraping is too restricted:

1. **Switch to Telegram** → No API limitations, free bot creation
2. **Switch to Graph API** → Production-ready with proper auth setup  
3. **Accept metadata-only** → Use for titles/timestamps only
4. **Use hybrid approach** → Automation for navigation + manual review for content

---

## Related Skills

- `platforms-integration`: Facebook Messenger integration (threads, not groups), Zalo/Zalo limitations, Shopee bot detection patterns
- `browser`: General browser automation capabilities (navigation, screenshots)
- `facebook-playwright-pattern`: Cookie-based Messenger scraping with E2EE PIN handling
- See also: `references/shopee-order-page-bot-detection.md` for Shopee bypass patterns
