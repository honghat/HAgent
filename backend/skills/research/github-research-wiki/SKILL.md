---
name: github-research-wiki
description: Explore GitHub repositories and save structured wiki documentation for future reference.
trigger_conditions: |-
  User asks to explore/review/audit a GitHub repository
  User requests saving repo info as wiki or notes
  Need comprehensive overview of open-source project for later use
keywords: ["github", "repository", "explore", "audit", "wiki", "documentation"]

---

# GitHub Research & Wiki Documentation Skill

## Purpose
Explore GitHub repositories, gather comprehensive information about projects, and save structured wiki documentation for future reference and comparison.

## When to Use
- User requests to explore/audit a GitHub repository
- Need to document open-source project details for later use
- Comparing multiple repos/technologies requires baseline knowledge
- Building knowledge base of tools/services for recommendations

## Workflow

### Phase 1: Repository Identification & Access
1. **Parse URL** - Extract repo name, owner, and any query parameters
2. **Navigate to GitHub** - Open repo main page via browser
3. **Check Authentication Status** - Note if "You must be signed in" appears (affects star/fork access)

### Phase 2: Content Gathering Strategy

**Three paths — use Path A first for doc-heavy repos, then fall through as needed.**

#### Path A — Raw Markdown via `curl` + GitHub API (PREFERRED for doc-heavy repos)
For repos with rich documentation, fetch raw markdown/docs directly from `raw.githubusercontent.com` AND metadata from the GitHub REST API. The API gives structured star/fork/license data without browser tools.

```sh
# START HERE: Get structured metadata (stars, forks, license, description, language)
curl -sL "https://api.github.com/repos/OWNER/REPO" | python3 -c "import json,sys; d=json.load(sys.stdin); print('Stars:', d.get('stargazers_count')); print('Forks:', d.get('forks_count')); print('Language:', d.get('language')); print('License:', d.get('license',{}).get('spdx_id')); print('Created:', d.get('created_at')); print('Updated:', d.get('updated_at')); print('Description:', d.get('description'))"

# Then fetch README + docs
curl -sL "https://raw.githubusercontent.com/OWNER/REPO/main/README.md" | head -200
curl -sL "https://raw.githubusercontent.com/OWNER/REPO/main/docs/index.md" | head -200
```

**Common docs to fetch** (check docs/index.md first for the full list):
- `README.md` — core overview, features, quick start
- `docs/install.md` — platform support, build instructions, feature flags
- `docs/usage.md` — CLI subcommands, arguments, flags, web UI/TUI
- `docs/api.md` — REST API endpoints, request/response formats
- `docs/models.md` — supported model architectures, feature flags
- `docs/clustering.md` — distributed inference, mDNS, topology files
- `docs/docker.md` — container setup, compose configs
- `docs/image_generation.md`, `docs/voice_generation.md` — specialized features

Always check if the default branch is `main` or `master` — try both if uncertain:
```sh
# If main fails, try master
curl -sL "https://raw.githubusercontent.com/OWNER/REPO/master/README.md" | head -200
```

**GitHub API rate limit**: Unauthenticated requests are limited to 60/hr. For heavier research, add `?client_id=CLIENT_ID&client_secret=CLIENT_SECRET` to `api.github.com` calls (if credentials available) to boost to 5000/hr.

#### Path B — Browser-based (when `browser_navigate` is available)
Use browser tools to navigate to the GitHub repo, read README, extract metadata, etc. Best for extracting directory structure (file listing tables), commit history, and metadata like stars/forks/language.

#### Path C — Web Search-based (when browser tools aren't used)
Use `web_search` (DuckDuckGo) with multiple targeted queries:
- `"<repo> GitHub stars features"` — get description + feature list
- `"<repo> features list"` — drill into feature categories
- `"<repo> Docker install"` / `"<repo> documentation"` — get installation commands and docs
Combine results from multiple queries to build a comprehensive picture.

#### Primary Information Sources (Priority Order):
1. **Repo description from search results** - Core purpose, unique value, differentiators
2. **README.md highlights** - Features, installation, usage examples (from search snippets or docs links)
3. **Meta tags & repo metadata** - Stars, forks, license info from search snippets
4. **Documentation/DeepWiki sites** - Structured feature lists, API endpoints, categories

#### Secondary Information (if needed):
- Directory structure via browser table/listing
- Recent commits (last 10-20 for activity patterns)
- File contents via `browser_console` expressions or code inspection

#### Extraction Techniques:
```javascript
// Get description from meta tag
document.querySelector('meta[name="description"]').getAttribute('content')

// Get README markdown content
document.querySelector('article.markdown-body')?.textContent?.slice(0, 3000)

// Alternative: console output for single-value data
document.querySelector('.repo-info-item__value')?.text
```

### Phase 3: Documentation Structure

The wiki entry should include:

#### Header Block (Quick Facts):
- **GitHub URL**: Direct link to repository
- **Stars/Forks**: Repository popularity metrics
- **License**: License type and openness level
- **Owner/Organization**: Repository maintainers

#### Summary Section:
- Core purpose/value proposition
- Unique differentiators vs. alternatives
- Use cases and target audience

#### Features Table:
| Feature | Description | Priority |
|---------|-------------|----------|
| [Feature] | [What it does] | ⭐⭐⭐ |

#### Technical Stack Table:
| Component | Technology/Version | Notes |
|-----------|-------------------|-------|

#### Installation & Usage Block:
- Primary installation method (with code block)
- Alternative methods (Docker, source build, etc.)
- Prerequisites and requirements

#### Ports & Configuration:
- Default ports
- Environment variables
- Access URLs

#### Directory Structure:
```
repo/
├── src/        # Main source code
├── tests/      # Test files
├── docs/       # Documentation
└── ...
```

#### Use Cases & Scenarios:
- Primary use case
- Secondary use cases
- Edge cases or special scenarios

#### Links Section:
- Official website/docs
- GitHub links
- Community resources

#### Notes/Caveats:
- Platform-specific requirements
- Limitations or known issues
- Maintenance status indicators

### Phase 4: Style & Tone Enforcement ⭐ CRITICAL ⭐

**MANDATORY:** Responses must follow user's explicit preference for **simple, easy to understand, concise language**.

#### DO:
- ✅ Use bullet points and tables for clarity
- ✅ Keep technical explanations minimal (assume familiarity)
- ✅ Lead with key facts, details second
- ✅ Use emojis sparingly for visual organization only
- ✅ One section per concept/topic

#### DON'T:
- ❌ Write lengthy introductions or context paragraphs
- ❌ Explain obvious concepts unnecessarily
- ❌ Over-format with excessive decoration
- ❌ Include session-specific error narratives
- ❌ Add filler content or "fluff"

**Remember:** The user wants **short, simple answers** - no formatting fluff. Direct and concise is the goal. This applies to ALL wiki documentation generated by this skill.

### Phase 5: Wiki Save Execution

Call `save_wiki()` (or `wiki` tool if the function is listed under that name) with:
```javascript
{
  title: "<Repository Name> - <Short Category Description>",
  summary: "2-sentence overview of core purpose and unique value",
  topics: ["key-topic-1", "key-topic-2", "platform-support"],
  content: "Full markdown content from Phase 3"
}
```

## Key Pitfalls & Gotchas

### Browser Tool Limitations:
- **vision analysis may fail** due to connection errors - try `browser_console` as fallback
- Truncated snapshots show "[... N lines truncated]" - request full snapshot via `browser_snapshot(full=true)` if needed
- **Empty snapshot on raw content pages** — `browser_snapshot` may return "(empty page)" on `raw.githubusercontent.com` URLs with 0 elements. **Fallback: navigate to the raw URL with `browser_navigate()`, then use `browser_console(expression='document.body.innerText')` to extract the full raw markdown/text content.**
- GitHub sign-in walls block star/fork counts - note this limitation in documentation

### Search Tool & Local Backend Failures:
- **SearXNG Connection Refused / `web_extract` Failures**: When the local SearXNG search backend at `http://127.0.0.1:8888` is down (`Connection refused`) or `web_extract` complains that the backend is search-only, immediately fallback to **Path A (Terminal-based curl + GitHub API)**. This path is extremely fast, 100% reliable when online, avoids headless browser rendering overhead, and directly retrieves clean raw text/JSON.

### save_wiki Content Restrictions
- **`save_wiki` rejects content containing git-related data** — commit hashes, branch names, tag references, git commands. The tool filters these out. If your wiki content includes "branches", "commits", "tags", or git URLs, strip or rephrase them before calling `save_wiki`.
- **Solution**: Omit git-specific metadata (branch count, tag count, commit messages, commit hashes) from the wiki body. Keep repo-level metadata (stars, forks, license) which is fine.

### Content Extraction Best Practices:
- Always check for README.md first (most projects have structured docs there)
- Use meta tags before scraping arbitrary elements (more reliable)
- Limit console output to essential data (first 3000 chars of markdown, single values)
- Verify directory structure exists before attempting navigation

### Documentation Completeness Checklist:
- [ ] GitHub URL and stars/forks noted
- [ ] README content captured and summarized
- [ ] Meta description extracted
- [ ] Installation methods documented
- [ ] Ports/configuration recorded
- [ ] Directory structure listed
- [ ] Use cases identified
- [ ] Links to external resources collected
- [ ] License status confirmed

## Common Patterns

### Repository Types & Documentation Focus:

| Type | Key Sections |
|------|--------------|
| **API Server** | Tech stack, ports, installation, endpoints |
| **CLI Tool** | Usage examples, flags, dependencies |
| **Desktop App** | Installation, tray app notes, platform support |
| **Media Server** | Ports, volume mounts, Docker config, data path |
| **Web Framework** | Setup, routes, middleware, dependencies |

### Quick Assessment Heuristics:
- **"Quick Start"** section = primary installation method
- **"Docker Compose"** code block = container-ready project
- **"From Source"** prerequisite list = build requirements
- **"Windows Installer (Recommended)"** = desktop-first design
- **"Self-hosted"** in description = privacy/local-first product

## Troubleshooting

### "destination path already exists" on git clone:
- Repository already cloned locally - don't retry, inspect existing folder
- Check `/Users/nguyenhat/HAgent/backend/<repo-name>/` for local copy

### Connection errors during vision analysis:
- Fallback to `browser_console()` expressions for content extraction
- Use meta tag queries as primary extraction method (more reliable)

### Sign-in wall blocking information:
- Document visible information regardless of star/fork counts
- Note authentication requirement in "Notes" section if applicable

## Example Usage

```bash
# User asks:
"Explore this GitHub repo and save wiki: https://github.com/user/repo-name"

# Agent should:
1. Navigate to URL via browser_navigate()
2. Load README content with browser_snapshot(full=true) or browser_console()
3. Extract meta tags, repo metadata, directory structure
4. Generate structured markdown per Phase 3 template
5. Call save_wiki() with appropriate title, summary, topics, content
```

## Related Skills
- `deep-research` - For in-depth domain research (not specific repos)
- `tin-tuc` - For daily news scraping from VnExpress
- `youtube-content` - For extracting YouTube transcripts and summaries
- `web-resource-exploration` - Overlapping skill for broader web resource wiki entries (including non-GitHub resources)

## Overlap Note
This skill (`github-research-wiki`) and `web-resource-exploration` have significant functional overlap. This skill is GitHub-focused with deeper Phase 3 template; `web-resource-exploration` covers broader web resources. Consider consolidation.

## Example: Web-Search-Only Path
See `references/github-web-search-example.md` for a worked example of researching a GitHub repo using only `web_search` (no browser tools).