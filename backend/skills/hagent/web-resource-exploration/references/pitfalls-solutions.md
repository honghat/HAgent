# Common Pitfalls & Solutions for Web Resource Exploration

## Browser Tool Limitations

### Issue: `web_search` fails with "Invalid non-printable ASCII character in URL"
**Symptom**: `web_search` returns error `Invalid non-printable ASCII character in URL, '\\n' at position 10` — this happens even when query has no visible newlines, suggesting an internal URL encoding bug.

**Solution**: Do NOT keep retrying — switch immediately to the DuckDuckGo HTML scrape fallback (see SKILL.md main body for the curl + python parsing pattern). After getting search result URLs, use curl to fetch raw content from HuggingFace/GitHub/arXiv directly.

```bash
# Immediate fallback — one curl call replaces web_search
curl -sL "https://html.duckduckgo.com/html/?q=${QUERY}" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" \
  | python3 -c "import sys,re,html; ..."
```

### Issue: "SearXNG is a search-only backend"
**Symptom**: `web_extract` fails with error about SearXNG

**Solution**: Use browser tools directly instead:
```python
# Instead of web_extract for full page content:
browser_navigate(url)  # Navigate first
browser_snapshot(full=True)  # Get full page structure
```

### Issue: Dynamic content not loading
**Symptom**: Page shows skeleton/loading but no real data

**Solution**: Use `web_fetch` to force full content fetch, or check if lazy-loading requires JS execution

---

## GitHub README Extraction

### Issue: Browser snapshot too large / README scrolled off-screen
**Symptom**: GitHub repo page has 300+ DOM elements but README is not in snapshot

**Solutions**:
1. **Raw download (fastest)**: Use `curl` or Python `requests` to fetch `https://raw.githubusercontent.com/{owner}/{repo}/main/README.md`
2. **Browser scrolling**: Scroll multiple times and take snapshots
3. **GitHub API**: Fetch via `https://api.github.com/repos/{owner}/{repo}/readme`

```python
import requests
url = 'https://raw.githubusercontent.com/Shahfarzane/opencode-mobile/main/README.md'
r = requests.get(url)
print(r.text[:5000])
```

### Issue: Dynamic content not loading
**Symptom**: Page shows skeleton/loading but no real data

**Solution**: Use `web_fetch` to force full content fetch, or check if lazy-loading requires JS execution
---

## Missing Information Patterns

### Pattern: No obvious license info
**Common on**: Some GitHub repos, blog posts, third-party APIs

**What to do**:
- Check for LICENSE file in repo roots (GitHub)
- Look for footer metadata (websites)
- Search page source for "license" or "copyright" text
- If truly unknown: mark as "[License Unknown]" and note this limitation

### Pattern: Dataset without README/Documentation
**Common on**: HF datasets with just data files

**What to do**:
- Check Files & versions tab for README.md, docs folder
- Look at first few samples via Data Studio viewer
- Infer from field names in preview rows

---

## Version Management Pitfalls

### Issue: Downloading old version of dataset/model
**Symptom**: API calls return older weights/data than expected

**Solution**:
- Always check `Files and versions xet` tab on HF
- Verify release notes for GitHub releases
- Use version specifiers in install commands (`pip install package==1.2.3`)

### Issue: Documentation outdated
**Symptom**: Code examples don't work with current API

**What to do**:
- Check GitHub `latest_release` date vs code commit dates
- Look for "Deprecation" warnings in docs
- Prioritize examples from main branch over old releases

---

## Data Format Issues

### Issue: Dataset claims "text" but has mixed modalities
**Symptom**: Field says "text" but contains images/tables embedded

**What to do**:
- Always check actual field types via preview samples
- Look for metadata hints (e.g., `image_path`, `has_images`)
- Note modality mix in wiki entry if applicable

### Issue: PDF files not directly readable
**Symptom**: Dataset has `.pdf` but text extraction needed

**What to do**:
- Check for OCR status in description
- Look for converted formats (.txt, .json) alongside PDFs
- Note if manual OCR processing needed

---

## Authentication & Access

### Issue: API endpoints require authentication
**Symptom**: 401/403 errors on endpoint calls

**What to do**:
- Check docs for "Authentication" or "API Key" sections
- Look for `x-api-key` header requirements
- Note OAuth flow if applicable (scopes, refresh tokens)

### Issue: Rate limiting on public endpoints
**Symptom**: 429 Too Many Requests errors

**Solution**: 
- Implement retry with exponential backoff
- Add delays between requests
- Check rate limit headers (`X-RateLimit-*`)

---

## Link Management Best Practices

### Always capture these link types:
1. **Main resource URL** (the primary entry point)
2. **Documentation URL** (if separate from main page)
3. **API reference** (for API docs specifically)
4. **Examples/Gallery** (demonstrative code samples)
5. **Contributing guide** (for repos, shows maintenance activity)

### Priority order:
1. Most recent version link (not old blog posts or archived pages)
2. Official source links (preferred over mirrors)
3. Direct resource access vs. landing page redirects

---

## Session Management Notes

### When to mention session limitations:
- "Note: Browser snapshot may show truncated content"
- "Some dynamic sections not fully loaded in current session"
- "For full details, visit the source URL directly"

### When NOT to mention:
- Transient errors that resolved before task completion
- Temporary network glitches (retry succeeded)
- Minor rendering inconsistencies that don't affect data accuracy

---

## Quick Reference: What Makes a Good Wiki Entry

✅ **Good**:
- Clear title with unique identifier
- All critical metadata captured (license, language, size)
- Working code snippet for usage
- Complete link section
- Source and date in footer

❌ **Bad**:
- Missing license info
- Code snippets without imports
- Only homepage link, no API/docs links
- No timestamp or source attribution

---

## Common Abbreviations & Conventions

| Term | Meaning | Example |
|------|---------|---------|
| HF | HuggingFace | `HF Dataset: username/resource` |
| README | Readme file | `README.md in repo root` |
| API ref | API reference docs | `/docs/api-reference/` |
| OCR | Optical character recognition | `OCR-processed text` |
| QA | Question Answering | `Document QA task` |
| TTS | Text-to-Speech | `TTS model for audio` |

---

## Edge Cases to Watch For

### Resource deleted or private
**Action**: Mark in wiki as "Archived/Private" with last access date

### Resource moved/migrated
**Action**: Update URL, note old location if relevant

### Multiple versions available
**Action**: Document current version + mention availability of older versions

---

## Final Checklist Before Saving to Wiki

- [ ] Main resource URL captured and verified (clickable)
- [ ] License explicitly stated or marked as unknown
- [ ] At least one usage example provided
- [ ] All important links documented (docs, API, examples)
- [ ] Sample data count/size noted if applicable
- [ ] Language(s) of content specified
- [ ] Timestamp included in footer
- [ ] No banned keywords in entry text (check for "git", "repo", "commit", "branch" — rewrite to neutral terms like "version control", "code history", "source")
