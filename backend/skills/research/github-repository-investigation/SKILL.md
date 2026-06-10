---
name: github-repository-investigation
description: Systematic investigation of GitHub repos for feature/language/model support verification
trigger: When user asks about GitHub repo features/language support/availability  
output-format: Clear markdown with ✅/❌ evidence-based verdicts  
tools-required: bash, web_search, browser_navigate (for code inspection)  
pitfalls: README≠implementation, language≠model support
---

# GitHub Repository Investigation

Use this skill when the user wants to investigate a GitHub repository for specific features, language support, model availability, or codebase capabilities. This includes checking READMEs, docs, config files, issues, and source code patterns.

## Workflow Steps

### 1. Initial Assessment → Load README + Repository Structure
```bash
# Direct curl for full README (avoid browser truncation)
curl -sL "https://raw.githubusercontent.com/{OWNER}/{REPO}/main/README.md" | head -200

# Get repo structure via GitHub API
curl -sL "https://api.github.com/repos/{OWNER}/{REPO}/contents/" | \
  jq '.[] | {name, type}'
```

**Curated Folders → Core Features Mapping:**
- `effgen/` → Core engine (agent orchestration, memory, RAG)
- `tools/builtin/` → 58+ built-in tools
- `models/backends/` → Model backends (vLLM, MLX Apple Silicon, Cerebras)
- `guardrails/` → Circuit breakers, bulkheads, jittered retries
- `observability/` → Prometheus metrics, OTel traces, SLOs

### 2. Deep Dive → Targeted File Searches
Use terminal/bash with `curl` + `jq` to inspect:
- `docs/` folder contents (cookbook, prompts, observability)
- Config files (`package.json`, `config.yaml`, `.env.example`)
- Language/model config patterns
- API endpoint documentation

### 3. Community Signal → Issues/PRs Scan
```bash
curl -sL "https://api.github.com/repos/{OWNER}/{REPO}/issues?state=all&per_page=100" | \
  jq '[.[] | select(.title | contains(["language", "support", "feature"]))]]'
```
Look for:
- User requests about language/model support
- Pull requests adding new models/languages
- Closed issues with feature confirmations

### 4. Documentation → Model/Sample Code Review
Check:
- `examples/` or `samples/` folders
- Test files showing usage patterns  
- Dockerfiles showing model/container requirements
- CHANGELOG.md for version history and release notes

## Critical Pitfalls

### ⚠️ Don't Rely Solely on README
READMEs often omit implementation details. Always check:
- Source code import statements
- Config schemas (`.env.example`)
- Model registration files

### ⚠️ GitHub API Rate Limits  
When scanning multiple repos, respect rate limits (~60 req/h for unauthenticated). Use cached responses where possible.

### ⚠️ Language ≠ Model Support  
A repo might "support a language" in the sense of UI/README being in that language, NOT meaning its ML models support that language. Verify model-specific config.

### ⚠️ Branch vs Main Branch
Features may exist on dev branches but not main. Always check which branch you're reading unless specified otherwise.

## Output Format Template (Markdown with Tables)

```markdown
## 📦 Repository: {REPO}
- **GitHub**: {URL} | **PyPI/HF**: {URL if applicable}
- **arXiv**: {URL if applicable}
- **Stars**: {N} ⭐ | **Forks**: {N}
- **Language**: {e.g., Python 3.10+} | **License**: {e.g., Apache 2.0}
- **Current Version**: {latest version from CHANGELOG}

## ✨ Core Concept (1-sentence hook)
{Core idea in bold + emoji}

**Key Differentiator:**
- ✅ **Fast/Efficient/Powerful** — Key value proposition

## 🎯 Core Values / Features
1. **Feature 1** — Description
2. **Feature 2** — Description
3. **Feature 3** — Description

## 🚀 Highlight Updates ({latest version})
- 🔒 Security: {feature}
- ☁️ Deployment: {option}
- 📊 Observability: {feature}

## 🏗️ Model / Backend Support Matrix
| Backend | Models/Platforms | GPU Required | Local/Cloud |
|---------|------------------|--------------|-------------|
| {Backend 1} | {Models list} | {Requirement} | ✅ Both / ☁️ Cloud / ❌ None |
| {Backend 2} | {Models list} | {Requirement} | ✅ Local only |

## 💻 Quick Start CLI
```bash
{cli commands with descriptions}
```

## 📦 Installation Options
```bash
# PyPI (Recommended)
pip install {package}

# Specialized options
pip install {package}[option]  # e.g., [mlx], [vllm], [all]
```

## 📖 Documentation & Resources
- **Official Docs**: {URL}
- **Website**: {URL}
- **Prompt/Knowledge Library**: {N} templates across {domains}
- **Cookbook/Examples**: {N} walkthroughs

## 🎯 Use Cases (Strong Signals)
- ✅ Scenario 1 — when to choose
- ✅ Scenario 2 — when to choose
- ✅ Privacy-sensitive apps (on-premise only)

## ⚠️ Considerations / Limitations
- **Consideration 1** — e.g., context window limits
- **Rate Limits** — Free-tier constraints; use cost tracker
- **Trade-offs** — Size vs capability considerations

## 🆚 Comparison with Alternatives
| Feature | {Tool} | {Alternative} |
|---------|--------|---------------|
| {Feature} | ✅ Strong | ⚠️ Partial / ❌ Weak |

## 📚 Key Directories to Study
```
{core/}           # Agent engine, orchestration
{tools/}          # Built-in tools ecosystem
{models/}         # Model backends (vLLM, MLX)
{guardrails/}     # Safety mechanisms
{observability/}  # Metrics, traces, SLOs
```

## ⚠️ Pitfalls & Edge Cases
- **Rate Limits**: Free-tier providers have limits; use cost tracker
- **Tool Verification**: Docker recommended for sensitive tasks
- **Context Window**: Watch memory usage with RAG pipelines

## 🌟 Strengths Summary
- **🏆 Optimization**: Best-in-class performance with small models
- **🛡️ Production-ready**: Full observability, security, deployment options
- **💰 Cost-Efficient**: Up to 10x cheaper than alternatives

## 🎯 When to Choose {REPO}
- ✅ You need local-first AI agents
- ✅ Budget is constrained (can't afford LLM costs)
- ✅ Privacy matters (data stays on-prem)
- ✅ You want rapid prototyping
- ✅ Edge computing deployments

## ❌ When NOT to Choose {REPO}
- ❌ You need massive context (>128K tokens)
- ❌ Your task requires extreme reasoning
- ❌ Real-time voice with ultra-low latency requirements
```

### Evidence Locations Section
Always include specific file paths where features were verified:
- `{core/agent.py}` — AgentConfig, agent orchestration logic
- `{tools/builtin/*.py}` — Built-in tools implementation
- `{models/backends/*.py}` — Model backends (vLLM, MLX)
- `{guardrails/*.py}` — Circuit breakers, bulkheads
- `{observability/*.py}` — Prometheus metrics, OTel traces

## Best Practices from Session Experience

### 📌 Web Extraction Fallback Pattern
When `web_snapshot` truncates README content (use case: long markdown files):
1. **Primary**: Try `web_extract` with supported backend (firecrawl, tavily, exa)
2. **Fallback**: Use direct `curl -sL "https://raw.githubusercontent.com/{OWNER}/{REPO}/main/{FILE}"` for full file content
3. **Head limit**: Pipe through `head -200` if only checking top portion

### 📌 Repository Structure → Feature Mapping Pattern
Instead of blindly scanning all directories, use curated folder names to identify core features:
- `{project-name}/` → Core engine / main framework logic
- `tools/` or `integrations/` → Plugin ecosystem / 3rd party connectors
- `models/` or `backends/` → ML/AI model support matrix
- `guardrails/` → Safety mechanisms / circuit breakers
- `observability/` → Metrics, traces, logging infrastructure
- `deploy/` → Deployment options (Docker, K8s, cloud providers)

### 📌 CHANGELOG Analysis Pattern
Always check recent releases for:
1. Version number and date
2. Feature highlights (emojis: 🔒 security, 🚀 new features, 🐛 fixes)
3. Breaking changes or deprecations
4. Major architectural improvements

### 📌 Multi-Source Verification
Never rely on a single source:
- ✅ README + GitHub API (`/contents/`) → Structure overview
- ✅ Direct curl to raw files → Full content access
- ✅ Issues/PRs → Community signals and feature requests
- ✅ CHANGELOG → Version history and release notes

## Critical Pitfalls

### ⚠️ Don't Rely Solely on README
READMEs often omit implementation details. Always check:
- Source code import statements (`from {pkg} import ...`)
- Config schemas (`.env.example`)
- Model registration files
- Test files showing actual usage patterns

### ⚠️ GitHub API Rate Limits  
When scanning multiple repos, respect rate limits (~60 req/h for unauthenticated). Use cached responses where possible.

### ⚠️ Language ≠ Model Support  
A repo might "support a language" in the sense of UI/README being in that language, NOT meaning its ML models support that language. Verify model-specific config.

### ⚠️ Branch vs Main Branch
Features may exist on dev branches but not main. Always check which branch you're reading unless specified otherwise.

### ⚠️ Browser Snapshot Truncation
Browser tools often truncate long markdown files (README.md). Use `curl` to raw URLs or `head -N` commands for controlled extraction.

## Quick Commands Template

```bash
# Check README (first 200 lines)
curl -sL "https://raw.githubusercontent.com/{OWNER}/{REPO}/main/README.md" | \
  grep -i -E "language|model|support" | head -20

# Find model/config files via API
curl -sL "https://api.github.com/repos/{OWNER}/{REPO}/contents/?ref=main" | \
  jq '.[] | select(.type=="file" and (.name | test("config|model|language"; "i"))) | .name'

# Search issues for feature requests (last 50)
curl -sL "https://api.github.com/repos/{OWNER}/{REPO}/issues?state=all&per_page=50" | \
  jq '[.[] | select(.title | contains(["language", "support", "feature"]))]]'

# Get CHANGELOG
curl -sL "https://raw.githubusercontent.com/{OWNER}/{REPO}/main/CHANGELOG.md" | head -100
```

## References

- See `references/github-investigation-patterns.md` for detailed command examples  
- See `references/model-support-detection.md` for ML model detection patterns

## Related Skills

- `deep-research` — for more comprehensive research queries on the same topic  
- `github-research-wiki` — to explore and save structured wiki documentation from GitHub repos
- `web-scraping-patterns` — if repo is web-based instead of GitHub

```bash
# Check README
curl -sL "https://raw.githubusercontent.com/{OWNER}/{REPO}/main/README.md" | \
  grep -i -E "language|model|support"

# Find model configs  
curl -sL "https://api.github.com/repos/{OWNER}/{REPO}/contents/?ref=main" | \
  jq '.[] | select(.type=="file" and (.name | test("config|model|language"; "i"))) | .name'

# Search issues for feature requests
curl -sL "https://api.github.com/repos/{OWNER}/{REPO}/issues?state=all&per_page=100" | \
  jq '[.[] | select(.title | contains("việt nam") or contains("vietnamese") or contains("language"))]'
```

## References

- See `references/github-investigation-patterns.md` for detailed command examples  
- See `references/model-support-detection.md` for ML model detection patterns

## Related Skills

- `deep-research` — for more comprehensive research queries  
- `web-scraping-patterns` — if repo is web-based instead of GitHub