# VIDYA Example Documentation
**Source**: GitHub Repository `dextify-org/vidya`  
**Created**: 2026-05-18

---

## Quick Reference for Future Repos

### Meta Tag Extraction (Reliable)
```javascript
// Get description from meta tag
document.querySelector('meta[name="description"]').getAttribute('content')

// Result: "Contribute to dextify-org/vidya development by creating an account on GitHub."
```

### README Content Extraction (Rich Info)
```javascript
// Get README markdown content (first 3000 chars)
document.querySelector('article.markdown-body')?.textContent?.slice(0, 3000)
```

### Repo Metadata Pattern
```javascript
// Example extracted metadata:
{
  "owner": "dextify-org",
  "repo": "vidya",
  "visibility": "Public",
  "stars": 13,
  "forks": 0,
  "license": "MIT (100% mã nguồn mở)",
  "latest_commit": {
    "author": "utkvishwas",
    "message": "updated version name",
    "commit": "796209d",
    "date": "last week"
  },
  "branches": 1,
  "tags": 1
}
```

### Directory Structure Pattern (from repo table)
```markdown
| Name | Last Commit | Date |
|------|-------------|------|
| assets/ | add placeholder image to assets | 2 weeks ago |
| backend/ | feat: add multi-environment support, Docker, and Windows installer | 2 months ago |
| node/ | feat: add multi-environment support, Docker, and Windows installer | 2 months ago |
| public/ | feat: add multi-environment support, Docker, and Windows installer | 2 months ago |
| resources/ | feat: add multi-environment support, Docker, and Windows installer | 2 months ago |
| src/ | fix(home): correct stats, course fallback, and loading error handling | last month |
| tray/ | feat: add multi-environment support, Docker, and Windows installer | 2 months ago |
| .dockerignore | feat: add multi-environment support, Docker, and Windows installer | 2 months ago |
| .gitignore | feat: add multi-environment support, Docker, and Windows installer | 2 months ago |
```

### Content Extraction Fallback Strategy
1. **First try**: `browser_snapshot(full=true)` for rich HTML content
2. **If truncated**: Use `browser_console(expression)` for specific data extraction
3. **If vision fails**: Use meta tag queries as primary extraction method
4. **For README**: Always use `article.markdown-body` selector

### Common GitHub UI Selectors
```javascript
// Description meta tag
document.querySelector('meta[name="description"]')?.getAttribute('content')

// Star count (when signed in)
document.querySelector('.counter-value--yellow')?.textContent

// Fork count
document.querySelector('.counter-value--grey')?.textContent

// License badge text
document.querySelector('[data-icon-type="octicon"]')?.getAttribute('aria-label')

// Repository name header
document.querySelector('.header-item').querySelector('.link-primary')?.textContent

// Owner name (before /)
document.querySelector('.repo-name path').firstElementChild?.previousSibling?.textContent
```

### Documentation Template Pattern
```markdown
**GitHub**: <url>  
**Stars**: X stars (public repo)  
**License**: <license status from UI/README>

## 📋 Tổng quan
<Summary paragraph>

---

## ⭐ Tính năng chính
<Features bullet points or table>

---

## 🔧 Tech Stack
| Component | Technology |
|-----------|------------|
...

---

## 🚀 Cài đặt & Sử dụng
### <Primary Method>
```bash
<installation command>
```

### <Alternative Methods>
```bash
<docker command>
```

---

## 💾 Tech Stack
<Technology table>

---

## ⚠️ Notes
<Platform-specific notes, limitations, etc.>

**Last checked**: YYYY-MM-DD
```

### Style Reminders for Generated Content
- ✅ Keep it **short, simple answers** — no formatting fluff (User preference)
- ✅ Direct and concise is the goal
- ✅ Use bullet points and tables for clarity
- ✅ Lead with key facts, details second
- ✅ Emojis sparingly for visual organization only
- ❌ No lengthy introductions or context paragraphs
- ❌ No filler content or "fluff"
- ❌ No session-specific error narratives

### Known Pitfalls from Experience
1. **"vision analysis" connection errors** → Use `browser_console` as fallback
2. **Truncated snapshots** → Request `full=true` or use console extraction
3. **Sign-in walls block star/fork counts** → Note this limitation, document visible info anyway
4. **"git clone: destination already exists"** → Repository already cloned locally, inspect existing folder
5. **README.md not found at root** → Some repos structure docs differently (check common locations)

---

## References Used in This Session
- `browser_navigate()` - Open GitHub repo URL
- `browser_snapshot(full=true)` - Capture full page HTML content
- `browser_console(expression)` - Extract specific data from DOM
- `save_wiki()` - Save documentation to wiki database

---

**Skill**: `github-research-wiki` (created 2026-05-18)  
**Session**: VIDYA repository exploration and wiki creation