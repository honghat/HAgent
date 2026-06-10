# GitHub Source Code Architecture Deep Dive

**When to use**: When you need to understand a repo's internal architecture — not just the README surface-level info. Use when browser tools can't render GitHub pages (empty page, bot detection) or when you need structured source-level insight.

## Pattern Overview

Combine **GitHub Tree API** (for directory structure) with **raw file fetch** (for actual source code) to reconstruct architecture without browser tools.

## Step 1: Get the Full Source Tree

```bash
# Recursive tree — lists ALL files in the repo
curl -s "https://api.github.com/repos/{owner}/{repo}/git/trees/main?recursive=1"
```

This returns JSON with an array of `{path, type, mode}` objects. Filter and display:

```bash
# Show only directories (top 2-3 levels)
curl -s "https://api.github.com/repos/rowboatlabs/rowboat/git/trees/main?recursive=1" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
for item in data.get('tree', []):
    path = item['path']
    if item['type'] == 'tree' and path.count('/') <= 2:
        print(f'dir  {path}/')
    elif item['type'] == 'blob' and path.count('/') <= 2:
        print(f'file {path}')
"
```

## Step 2: Focus on Specific Subdirectories

```bash
# Show only files under a specific source path
curl -s "https://api.github.com/repos/{owner}/{repo}/git/trees/main?recursive=1" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
for item in data.get('tree', []):
    path = item['path']
    if item['type'] == 'blob' and path.startswith('src/knowledge/'):
        print(f'    {path}')
" | head -100
```

## Step 3: Read Key Source Files

```bash
# Read a raw file from the repo
curl -s "https://raw.githubusercontent.com/{owner}/{repo}/main/{path/to/file}" | head -200
```

**When file is in a branch other than `main`**, try `master`:
```bash
curl -s "https://raw.githubusercontent.com/{owner}/{repo}/master/{path/to/file}" | head -200
```

## Step 4: Extract Architecture from File Names

The file paths themselves reveal architecture patterns:

| Pattern | What It Means |
|---------|---------------|
| `src/application/use-cases/` | Clean Architecture use cases |
| `src/entities/models/` | Domain entities |
| `src/application/repositories/` | Repository interfaces |
| `src/application/services/` | Service interfaces |
| `src/application/workers/` | Background workers |
| `src/application/policies/` | Authorization/quotas |
| `packages/core/src/knowledge/` | Core pipeline logic |
| `packages/shared/src/` | Shared types across apps |
| `apps/main/src/` | Electron main process |
| `apps/renderer/src/` | React UI |
| `apps/preload/src/` | Electron preload |

## Step 5: Read Package.json / pyproject.toml

Always read the root `package.json` (or `Cargo.toml`, `pyproject.toml`, etc.) to understand:
- **Tech stack** (dependencies + devDependencies)
- **Build system** (Vite, Webpack, Forge, etc.)
- **Scripts** (dev, build, test, lint)

```bash
# For pnpm workspaces monorepos, check the workspace config too
curl -s "https://api.github.com/repos/{owner}/{repo}/git/trees/main?recursive=1" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
for item in data.get('tree', []):
    path = item['path']
    if item['type'] == 'blob' and path.endswith('package.json') and path.count('/') <= 2:
        print(path)
"
```

## Step 6: Identify Architectural Patterns from Source Code

Read the entry point file first (e.g., `src/main.ts`, `App.tsx`, `bot.py`), then the orchestrator/coordinator files.

### What to look for in agent/coworker repos:

1. **Pipeline pattern** — sequential steps (label → graph → tag)
2. **Agent runtime** — handoffs, state management, tool dispatch
3. **Knowledge graph** — how entities are stored, indexed, searched
4. **Event bus** — pub/sub for async processing
5. **MCP client** — how external tools are connected (stdio/SSE/HTTP)
6. **LLM provider abstraction** — how different models are swapped
7. **Live notes / background agents** — scheduled tasks with patch-style edits
8. **Data sync** — Gmail, Calendar, meeting notes sync patterns

## Example: Full Deep Dive Script

```bash
#!/bin/bash
OWNER="rowboatlabs"
REPO="rowboat"

echo "=== 1. Repo structure (top 2 levels) ==="
curl -s "https://api.github.com/repos/$OWNER/$REPO/git/trees/main?recursive=1" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
for item in data.get('tree', []):
    path = item['path']
    if item['type'] == 'tree' and path.count('/') <= 2:
        print(f'dir  {path}/')
    elif item['type'] == 'blob' and path.count('/') <= 2:
        print(f'file {path}')
"

echo ""
echo "=== 2. Key source files ==="
curl -s "https://api.github.com/repos/$OWNER/$REPO/git/trees/main?recursive=1" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
paths = ['src/main.ts', 'src/run_pipeline.ts', 'src/knowledge_index.ts', 
         'src/models.ts', 'src/mcp.ts', 'src/App.tsx']
for item in data.get('tree', []):
    for p in paths:
        if item['path'].endswith(p):
            print(f'  {item[\"path\"]}')
"

echo ""
echo "=== 3. Root package.json ==="
curl -s "https://raw.githubusercontent.com/$OWNER/$REPO/main/package.json" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('name:', d.get('name'))
print('scripts:', list(d.get('scripts', {}).keys()))
print('deps keys:', list(d.get('dependencies', {}).keys())[:10])
print('devDeps keys:', list(d.get('devDependencies', {}).keys())[:10])
" 2>/dev/null || echo "No root package.json"
```

## When to Fall Back to This Pattern

Use **this** curl-based tree + raw fetch approach when:
1. **Browser tools** return empty page on GitHub (bot detection)
2. **web_search** has encoding issues and can't find the repo
3. You need **architectural insight**, not just README surface level
4. The repo has complex monorepo structure with multiple apps/packages

## Don't

- Don't use this for simple README extraction — use `raw.githubusercontent.com` README fetch directly (faster)
- Don't over-fetch — only read the files that matter for understanding architecture
- Don't worry about rate limits — GitHub unauthenticated API allows ~60 req/hour, more than enough for one deep dive
- Don't read every source file — focus on entry points, orchestrators, pipeline definitions, and shared types
