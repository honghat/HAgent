---
name: tool-usage-patterns
description: Document durable patterns for handling tool failures, file path verification, and fallback strategies when working with HAgent tools.
tags: ["tooling", "patterns", "anti-patterns"]
related_skills: ["git-workflow", "video-generation", "video-pipeline-ui"]
---

# Tool Usage Patterns & Anti-Patterns

## File Path Verification Workflow

### When `read_file` fails with "File not found"

**Step 1: Use `search_files` to locate the file**
```bash
search_files(pattern="PdfEditor.jsx", target="files")
```

**Step 2: If search returns relative paths, use `terminal` with absolute paths**
```bash
head -n 100 /absolute/path/to/file.js
```

**Step 3: If uncertain about directory context, change first or find**
```bash
cd /Users/nguyenhat/HAgent && find . -name "PdfEditor.jsx" 2>/dev/null | head -5
```

### Anti-patterns to avoid:

❌ **Don't retry the same failing command** — Triggers tool loop warnings.

❌ **Don't assume relative paths work without verifying directory context.**

✅ **Do use nested bash -c for git operations:**
```bash
bash -c 'git commit -m "commit message"'
```

✅ **Do verify file existence before editing:**
```bash
ls -lh /path/to/file
```

## Tool Failure Fallback Patterns

### read_file → search_files → terminal

When `read_file` says "File not found":
1. First call: `search_files(pattern=..., target="files")`
2. If search returns relative paths: call `terminal` with absolute path
3. If still unclear: `cd /abs/path && find . -name "..."`

### bash/terminal → nested bash -c (for git)

When encountering "Foreground command uses '&' backgrounding":
1. Retry 1-2 times with same command
2. After 3-5 retries, switch to: `bash -c 'git <command> ...'`
3. After escalation fails, escalate to user with alternative methods

## Concise Response Pattern (User Preference)

**For this specific user ("anh Hạt"):**

When the user asks for direct execution or brief commands:

- **Execute first, explain after** — Report progress/results with key metrics only
- **Skip verbose confirmations** — 0-1 question max, unless blocking issue detected
- **Use Vietnamese defaults** for commits/messages when context unclear
- **Report status immediately** → User may ask follow-up questions like "sao rồi?"

**Response Structure:**
1. **Execute action** → Run the tool/command
2. **Report key metrics only** → ✅ Exit code, file counts, time taken
3. **Wait for user's next instruction** → Don't add extra explanations unless asked

**Pitfall:** Verbose step-by-step reporting triggers user frustration when they want direct execution.

---

## Subagent Result Fabrication (Critical Pitfall)

**NEVER trust file existence, file size, process status, or API responses from subagent summaries.**

Always verify with direct tool calls:
- File exists? → `ls -lh path/to/file`
- Process running? → `ps aux | grep <process>`
- API response? → `curl http://api/endpoint`

See `subagent-driven-development` skill for complete protocol.

## Provider Shadowing Pitfall

Built-in providers (pekpik, lmstudio, ollama, nous, openrouter, deepseek, anthropic, openai) shadow custom provider config when `model.provider` matches a built-in name.

**Fix:** Rename the provider key in config to avoid collision (e.g., `pekpik-custom` instead of `pekpik`).

See cron-jobs skill references/provider-shadowing-debug.md for complete workflow.

## Browser Automation Anti-Pattern: GitHub Scraping Without Proper Proxies

**Signal:** When scraping GitHub with browser automation WITHOUT residential proxies, bot detection will trigger immediately — even on public repositories. The tool WILL fail (403, rate-limited, CAPTCHA). This is NOT a setup issue — this is GitHub's anti-scraping protection.

**Anti-pattern to avoid:**
```python
❌ browser_navigate("https://github.com/user/repo")  # Direct scrape without proxies
```

**Correct patterns:**

1. **For public repo browsing (reading content):**
   - ✅ Use web_search first to get official docs/wiki pages
   - ✅ Use GitHub API v3/v4 endpoints directly via `curl`
   - ❌ Don't rely on browser automation for repo content scraping

2. **When you MUST scrape with browser:**
   - ✅ First check: Does the page show "No results found" or blank content? → GitHub bot detection triggered
   - ✅ Fallback: Use `web_search` to find alternative documentation
   - ✅ Consider: Switch to residential proxy tier if available

3. **GitHub-specific fallback workflow:**
   ```
   Step 1: Try browser_navigate (may fail due to bot detection)
   Step 2: If blank/403 → web_search for repo docs
   Step 3: If docs exist → extract from search results instead
   Step 4: Consider GitHub API if authentication available
   ```

**See pattern:** This is similar to Facebook group feed scraping limitation — both platforms actively hide content without proper auth/proxies. See `social-media-scraping` skill for platform-specific patterns.

---

## Subagent Result Fabrication (Critical Pitfall)