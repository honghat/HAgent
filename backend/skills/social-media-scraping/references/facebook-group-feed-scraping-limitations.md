# Facebook Group Feed Scraping Limitations

## Overview

Facebook group feed scraping presents unique limitations that are **different from Zalo API message reading** and **Messenger thread reading**.

## Key Distinction: Navigation vs. Content Reading

### ✅ What Browser Tools CAN DO:
- **Navigate to groups**: Successfully open `https://facebook.com/groups/<groupname>`
- **Read post metadata**: Get author names, timestamps (e.g., "7 giờ", "3 giờ")
- **Identify group info**: Member counts, description text, join buttons
- **Follow navigation patterns**: Click links, scroll pages

### ❌ What Browser Tools CANNOT DO (Without Proper Auth):
- **Read actual post content**: Text bodies of posts are hidden/obfuscated
- **Parse images/media**: Actual post images blocked from extraction
- **Get full comment threads**: Comments section may not load completely
- **Bypass anti-scraping detection** without residential proxies

## Anti-Scraping Mechanisms

Facebook uses multiple layers of protection for group feeds:

### 1. Bot Detection Heuristics
```
⚠️ Detected: Headless browser automation WITHOUT residential proxy
   → Content loading interrupted
   → Only metadata visible (author, timestamp)
   → Post bodies hidden with obfuscation classes
```

### 2. Cookie-Based Auth Requirements
Even with full login cookies (`c_user`, `ux`, `datr`), **group feed content** 
is still protected against automation unless using official API endpoints.

### 3. Scroll Detection
Content appears to load "incrementally" but requires:
- Human-like scroll behavior (random delays between scrolls)
- JavaScript execution simulation
- Real-time network request interception

## Workaround Patterns

### Pattern A: Official Facebook Graph API (Recommended for Production)

**Pros**: Stable, supports pagination, official rate limits  
**Cons**: Requires app registration, OAuth flow setup

```bash
# Example using curl with access token
curl -X GET "https://graph.facebook.com/v18.0/groups/<group_id>/posts?limit=25&fields=message,created_time,from" \
  -H "Authorization: Bearer <PAGE_ACCESS_TOKEN>"
```

### Pattern B: Playwright with Full Cookies (Partial Success)

**Works for**: Simple text posts, some image extraction  
**Fails for**: Rich content (video embeds, carousel posts)

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)  # Must be visible!
    page = browser.new_page()
    
    # Login with cookies
    page.goto('https://facebook.com/')
    # Apply cookies from ~/.browser-cookies or env var
    page.evaluate('''() => {
      for(let cookie of document.cookie.split(';')) {
        document.cookie = cookie.replace(/^ +/, "");
      }
    }''')
    
    # Navigate to group
    page.goto('https://facebook.com/groups/nghiienai/')
    
    # ⚠️ Content may still be hidden!
    post_text = page.locator('.x5nfymf').inner_text()  # Facebook's obfuscated class
    
    browser.close()
```

### Pattern C: Browser Automation + Human Verification

**Use case**: Occasional group browsing, not high-frequency scraping  
**Flow**:
1. Open browser with `browser_navigate()` to group page
2. Scroll down (with artificial delays)
3. Extract visible text via snapshot
4. Store in persistent storage for later review

## Comparison: Facebook vs Zalo vs Telegram API Capabilities

| Feature | Facebook Groups | Facebook Messenger | Zalo (Web/App) | Telegram |
|---------|-----------------|-------------------|-----------------|----------|
| **Feed Navigation** | ✅ Works | ✅ Works | ⚠️ Manual only | ✅ Works |
| **Content Reading** | ❌ Blocked* | ✅ Via cookies | ⚠️ Browser-only | ✅ Native API |
| **Message Polling** | ❌ Not supported | ✅ Via API | ❌ Browser-only | ✅ Native API |
| **Anti-Scraping** | High (requires proxy) | Medium (E2EE PIN) | Medium (badges only) | Low |

\* Facebook Groups specifically block content reading even with valid session cookies.

## When to Use Each Method

### ✅ Facebook Graph API
- Production scraping needs
- Regular data collection (e.g., daily posts)
- Need structured output (JSON format)

### ⚠️ Playwright + Cookies
- Ad-hoc group monitoring
- One-time content verification  
- Testing new features
- Educational/research use cases

### ❌ Pure Browser Automation
- **NOT recommended** for high-frequency needs
- Only for occasional browsing + snapshot capture
- Accept metadata-only results

## Best Practices

1. **Always check auth requirements first** before attempting scrapes
2. **Prefer official APIs** (Graph API, Messenger API) over automation
3. **Rate limit your requests** to avoid getting blocked (max 30 calls/sec for Graph API)
4. **Use residential proxies** if automation is required (~$5-10/month for quality pools)
5. **Accept metadata-only results** when automation limitations occur

## Related Skills

- `platforms-integration`: Facebook Messenger integration guide (different use case - threads, not groups)
- `browser` tools: General navigation and screenshot capabilities
- `facebook-playwright-pattern`: Cookie-based Messenger scraping (E2EE PIN handling)
