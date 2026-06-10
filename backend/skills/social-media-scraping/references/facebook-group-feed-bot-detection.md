---
name: "facebook-group-feed-bot-detection"
description: "Facebook group feed content blocked by bot detection — Graph API or residential proxy required."
version: 1.0.0
author: HatNguyen
platforms: [linux, macos]
tags: [facebook, scraping, bot-detection, graph-api]
---

# Facebook Group Feed Content Blocked 🚨

## Discovery (2026-06-01) ⭐

**Trigger**: Attempted to scrape Facebook group feed via browser automation tools.  
**Result**: Navigation worked ✅ but post content blocked ❌

## Critical Finding

Facebook implements **group feed protection** even with:
- ✅ Valid session cookies (`c_user`, `ux`, `datr`)
- ✅ Browser automation tools (Playwright, Puppeteer)
- ✅ Residential proxy networks

### What Works

```
✅ Opening https://facebook.com/groups/groupname
✅ Group metadata visible (title, members, description)
✅ Post author names extracted ("John Doe")
✅ Timestamps parsed correctly ("7 giờ", "3 giờ")
✅ Navigation paths followable
```

### What Fails 🚨

```
❌ Reading actual post text bodies
❌ Extracting images/media content  
❌ Loading comment threads fully
❌ Parsing video embeds/carousels
```

## Distinction: Facebook vs Zalo vs Telegram

| Platform | Content Reading | Block Reason | Solution |
|----------|-----------------|--------------|----------|
| **Facebook Groups** | ❌ Blocked* | Bot detection | Graph API OR Residential Proxy |
| **Messenger Threads** | ✅ Via cookies | E2EE PIN handling | fbsbx.com cookies |
| **Zalo** | ⚠️ Manual only | No polling API | Browser automation |
| **Telegram** | ✅ Full content | None (open) | Native bot token |

\* Facebook Groups block content even with valid session cookies. This is a feature, not a bug.

## Solutions

### Option A: Facebook Graph API (Production-Ready) ⭐

```bash
# 1. Create FB Developer App at fb.dev → Get Page Access Token
# 2. Request pages_read_engagement scope

curl -X GET "https://graph.facebook.com/v18.0/123456789/posts?limit=25" \
  -H "Authorization: Bearer PAGE_ACCESS_TOKEN" | jq '.'
```

**Pros**: Stable, structured output, pagination  
**Cons**: Requires app registration (fb.dev)

### Option B: Playwright + Proxy + Scroll Simulation

```python
from playwright.sync_api import sync_playwright, ProxySettings

proxy = ProxySettings(server="http://residential-proxy:8080")  # Residential IP required

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False, proxy=proxy)
    page = browser.new_page()
    page.goto('https://facebook.com/groups/groupname')
    
    # Random delays critical for bot detection bypass
    import random; time.sleep(random.uniform(1.5, 3.0))
    page.keyboard.press('PageDown')
```

**Pros**: Can test features before committing to Graph API  
**Cons**: Requires proxy service (~$5-10/month), flaky results

### Option C: Hybrid Approach (Recommended for Limited Budget)

Get metadata only via browser automation, user reviews content manually.

## Migration Path

If scraping is too restricted:

1. **Create Telegram Group** → Invite members → Free bot, no limitations
2. **Apply for Graph API Access** → Production-ready
3. **Accept metadata-only results** — use for titles/timestamps only

## Key Takeaway

> **Facebook Groups content blocking is a FEATURE, not a bug.**  
> When browser automation shows post metadata but no content, Facebook's bot detection is working as intended. The solution requires Graph API or residential proxy.
> 
> This is fundamentally different from Zalo's limitation (no polling capability) — Zalo could read messages if an API existed; Facebook Groups literally hide the content.

## Files & References

- `social-media-scraping/SKILL.md` — Main scraping patterns and platform limitations
- `social-media-scraping/references/zalo-message-viewing-workflow.md` — Zalo API/no-polling limitations
- `platforms-integration/SKILL.md` — Unified cross-platform messaging integration (Messenger, Zalo groups)

## Related Skills

- `social-media-scraping`: Main scraping patterns and platform limitations
- `facebook-playwright-pattern`: Cookie-based Messenger scraping with E2EE PIN handling