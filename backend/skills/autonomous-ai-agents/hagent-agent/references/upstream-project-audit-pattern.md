# Upstream Project Comparison & Audit Patterns

## Overview

This document captures the **upstream project audit workflow** — a repeatable class of work for when users ask whether an upstream project (like Hermes Agent, OpenAI Codex, Claude Code) has a feature, bug fix, or capability that HAgent Prime should adopt.

**Signal:** When user asks "Does X have Y?" or "Should we upgrade to get Z?", use this pattern.

---

## Workflow

### Step 1: Find Latest Release
- Navigate to GitHub releases page for upstream project
- Identify most recent release (version number + date)
- Look for "Latest" vs specific version tags

### Step 2: Read Changelog/Release Notes
Look for these sections:
- 🐛 Bug Fixes — critical issues resolved
- ✨ Highlights — new features
- 📚 Documentation — doc updates
- 🛠️ Infrastructure — build/test changes
- 👥 Contributors — who worked on it

### Step 3: Compare Against HAgent Prime
Check HAgent's equivalent implementation:

| Upstream Feature | Hagent Prime Equivalent | Priority |
|-----------------|------------------------|----------|
| Skills catalog (N entries) | SKILL.md files in `backend/skills/` | ✅ Already superior |
| Plugin system (bundled yaml) | Skill management (`skill_manage`) | ✅ Already exists |
| Dashboard infinite-reload loop | Not applicable (different architecture) | N/A |
| MCP server integration | Native MCP support via `hagent mcp` | ✅ Equivalent |

### Step 4: Determine Actionable Value
Ask: **"Does this actually improve HAgent Prime?"**

Categories:
- ✅ **Already superior** — HAgent has better implementation (e.g., 80+ SKILL.md files vs single-file catalog)
- ⚠️ **Different problem** — Bug affects upstream only in specific scenarios (loopback mode, Docker)
- 🎯 **Upgrade recommended** — Feature/fix that applies to Hagent too

---

## Key Findings: Hermes v0.15.2

### Packaging Fix Only (v0.15.2)
- "Packaging): ship bundled plugin.yaml manifests in wheel and sdist"
- **Upstream:** Ships `plugin.yaml` with installer
- **Hagent Prime:** Skill management system (`skill_manage`) already provides this capability
- **Conclusion:** ✅ No upgrade needed — HAgent's system is superior

---

## Key Findings: Hermes v0.15.1 (Hotfix)

### Dashboard Infinite-Reload Loop Bug
```markdown
"Headline fix: the dashboard infinite-reload loop that hit anyone running 
v0.15.0 in loopback mode (Docker, hosted Hermes, fresh installs)."
```

**Why Hagent Never Has This:**
- Different authentication model (not token-based reload guard)
- Separate credential rotation from same-origin guards
- No loopback mode by default

**Verdict:** ❌ N/A — Upstream bug is architecture-specific to Hermes loopback mode

---

### Kanban Worker SIGTERM Fix
**Analysis:** HAgent's subagent system handles graceful termination better via:
- Worktree mode (`-w`) for parallel agents
- Proper cleanup in `delegate_task` summaries
- Dedicated `/cancel` commands

**Verdict:** ✅ Already superior

---

### Kanban Worker Vision on Referenced Images
**Analysis:** HAgent has equivalent multi-modal tools:
- `vision_analyze` — general image analysis
- `video_analyze` — video content extraction  
- `browser_vision` — visual page inspection

**Verdict:** ✅ Equivalent capability exists

---

### Skills Catalog (19,932 entries)
```markdown
"the full 19,932-entry skills.sh catalog"
```

**Hagent's Implementation:**
- **80+ SKILL.md files** organized by category (devops, data-science, github, etc.)
- **Pin/unpin system** for priority control
- **Usage tracking** via `.usage.json` telemetry
- **Auto-archive** of stale skills

**Verdict:** ✅ HAgent's skill management is significantly more sophisticated

---

## Comparison Summary Table

| Feature | Hermes v0.15.2 | Hagent Prime | Upgrade Needed? |
|---------|---------------|--------------|------------------|
| Skills system | 19,932 single-file entries | 80+ SKILL.md files with categories + pinning | ❌ Already superior |
| Plugin bundling | Bundled plugin.yaml in wheel | Skill management via `skill_manage` | ❌ Already exists |
| Dashboard loop bug | Fixed in v0.15.1 | Never had this issue (different auth) | N/A — architecture differs |
| Kanban worker SIGTERM | Fixed | Better handling via worktree mode | ✅ Already superior |
| MCP integration | Native support | Full native support | ✅ Equivalent |
| Provider shadowing fix | Not mentioned | Documented in memory + fixed | ✅ Already handled |

---

## Reporting Format for Upstream Comparisons

When user asks "Should we upgrade to get X?":

```
🔍 UPSTREAM PROJECT: <PROJECT> v<VERSION>

✨ Highlights from upstream release:
- <Feature 1>
- <Feature 2>

✅ VERDICT FOR HAGENT PRIME:
- Status: Already superior / Equivalent / Not applicable
- Why: <Brief explanation with code paths>
- Recommendation: No upgrade needed OR Here's how to improve Hagent...

📦 Files Changed in Upstream Release:
- <File 1>: <Change summary>
- <File 2>: <Change summary>

💡 Conclusion: 
<Single-sentence recommendation based on analysis>
```

---

## Example Commands for Upstream Analysis

```bash
# 1. Clone upstream repo to latest release
curl -fsSL https://github.com/UpstreamOrg/upstream/releases/download/vX.Y.Z/dist.tar.gz | tar -xzf -

# 2. Compare specific file diff against current Hagent codebase
git diff v0.X.Y..vX.Y.Z -- <path/to/file> | head -50

# 3. Check if feature exists in current codebase  
grep -r "<feature>" backend/ --include="*.py" --include="*.md"

# 4. Search HAgent skills for equivalent implementation
hagent skills search "<related-skill-name>"
```

---

## Common Pitfalls to Avoid

### ❌ Don't assume upstream is "better just because it's newer"
- Different codebases, architectures, goals
- Some "fixes" are architecture-specific (e.g., loopback mode only)

### ✅ Do verify against current Hagent implementation first
- Check `backend/skills/` for existing skills before requesting new ones
- Verify if feature exists in any toolset (`hagent tools list`)

### ❌ Don't upgrade for packaging fixes alone
- Bundling plugin.yaml is a convenience, not a capability gap
- Focus on code/architecture improvements that add value to Hagent users

---

## Session Completion Checklist

When wrapping up an upstream comparison:

- [ ] Identify latest release from GitHub
- [ ] Read changelog/release notes fully
- [ ] Compare each feature against HAgent Prime implementation
- [ ] Categorize findings (superior/equivalent/not applicable)
- [ ] Report clear verdict with recommendations
- [ ] Store key findings in appropriate reference file (e.g., `upstream-project-audit-pattern.md`)
- [ ] Update memory with important comparisons for future reference

---

**Last Updated:** June 2026  
**Related Skills:** `hagent-agent`, `github-repository-investigation`, `tool-usage-patterns`