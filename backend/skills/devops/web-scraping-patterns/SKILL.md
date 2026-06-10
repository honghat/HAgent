---
name: web-scraping-patterns
description: Browser automation and scraping patterns, platform-specific limitations (GitHub, Facebook), and fallback strategies.
tags: ["scraping", "browser-automation", "anti-patterns"]
related_skills: ["tool-usage-patterns", "social-media-scraping"]
---

# Web Scraping Patterns & Limitations

## Platform-Specific Bot Detection

### GitHub Repository Scraping

**Problem:** Browser automation WITHOUT residential proxies triggers bot detection on GitHub, even for public repositories.

**Symptoms:**
- Tool warnings: "Running WITHOUT residential proxies. Bot detection may be more aggressive."
- Empty snapshots, 403/429 errors
- Unable to read README docs or repository contents

**Anti-pattern:**
```python
❌ browser_navigate("https://github.com/user/repo")  # Direct scrape without proxies
```

**Valid patterns:**

1. **Prefer official API for data extraction**
   ```bash
   curl -s "https://api.github.com/repos/user/repo" | jq .name, .description, .readme
   ```

2. **Use web_search for documentation content**
   ```bash
   web_search("opencode github docs")
   # → Search results contain README/docs/installation guides
   ```

3. **Check bot detection triggers:**
   - Blank or minimal content in snapshot
   - "No results found" errors
   - HTTP 403/429 responses
   - **Action:** Fall back to web_search pattern

4. **Authentication required for:**
   - Private repositories
   - OAuth-protected endpoints
   - Cookie-file from browser login session

### Facebook Group Feed

**Problem:** Browser tools can navigate groups successfully BUT CANNOT READ POST CONTENT due to bot detection/anti-scraping when not using residential proxies or proper auth cookies. Can get post metadata (author names, timestamps) but actual content is hidden.

**Root cause:** Facebook-specific group feed protection (distinct from Zalo's "no API message reading" limitation).

See `social-media-scraping` skill for platform-specific patterns.

---

## General Browser Automation Workflow

### When scraping fails with blank/403 errors:

1. **Check snapshot** → Does it show empty content or bot detection warning?
2. **Fall back to web_search** → Find alternative documentation via search
3. **Consider API endpoints** → Use platform's official API if available
4. **Residential proxies** → Enable if available in your tier

### Pattern checklist:

- [ ] Browser automation failing? → Check for bot detection warning first
- [ ] Empty snapshot after navigate? → Fall back to search/API
- [ ] Scraping social platform groups? → Expect content limitations without auth/proxies
- [ ] Need private repo access? → OAuth token or residential proxy required

---

## See Also

- `tool-usage-patterns`: General fallback strategies for tool failures
- `social-media-scraping`: Facebook, Zalo, Telegram scraping patterns
- GitHub API docs: https://docs.github.com/en/rest

---

**Last updated:** 2026-06-01