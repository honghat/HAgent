---
name: systematic-debugging
description: "4-phase root cause debugging: understand bugs before fixing."
version: 1.2.0
author: Hagent Agent (adapted from obra/superpowers)
license: MIT
platforms: [linux, macos, windows]
metadata:
  hagent:
    tags: [debugging, troubleshooting, problem-solving, root-cause, investigation]
    related_skills: [test-driven-development, writing-plans, subagent-driven-development]
---

# Systematic Debugging

## Overview

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

**Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure.

**Violating the letter of this process is violating the spirit of debugging.**

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

## When to Use

Use for ANY technical issue:
- Test failures
- Bugs in production
- Unexpected behavior
- Performance problems
- Build failures
- Integration issues

**Use this ESPECIALLY when:**
- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- You've already tried multiple fixes
- Previous fix didn't work
- You don't fully understand the issue

**Don't skip when:**
- Issue seems simple (simple bugs have root causes too)
- You're in a hurry (rushing guarantees rework)
- Someone wants it fixed NOW (systematic is faster than thrashing)

## The Four Phases

You MUST complete each phase before proceeding to the next.

---

## Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

### 1. Read Error Messages Carefully

- Don't skip past errors or warnings
- They often contain the exact solution
- Read stack traces completely
- Note line numbers, file paths, error codes

**Action:** Use `read_file` on the relevant source files. Use `search_files` to find the error string in the codebase.

### 2. Reproduce Consistently

- Can you trigger it reliably?
- What are the exact steps?
- Does it happen every time?
- If not reproducible → gather more data, don't guess

**Action:** Use the `terminal` tool to run the failing test or trigger the bug:

```bash
# Run specific failing test
pytest tests/test_module.py::test_name -v

# Run with verbose output
pytest tests/test_module.py -v --tb=long
```

### 3. Check Recent Changes

- What changed that could cause this?
- Git diff, recent commits
- New dependencies, config changes

**Action:**

```bash
# Recent commits
git log --oneline -10

# Uncommitted changes
git diff

# Changes in specific file
git log -p --follow src/problematic_file.py | head -100
```

### 4. Gather Evidence in Multi-Component Systems

**WHEN system has multiple components (API → service → database, CI → build → deploy):**

**BEFORE proposing fixes, add diagnostic instrumentation:**

For EACH component boundary:
- Log what data enters the component
- Log what data exits the component
- Verify environment/config propagation
- Check state at each layer

Run once to gather evidence showing WHERE it breaks.
THEN analyze evidence to identify the failing component.
THEN investigate that specific component.

### 5. Trace Data Flow

**WHEN error is deep in the call stack:**

- Where does the bad value originate?
- What called this function with the bad value?
- Keep tracing upstream until you find the source
- Fix at the source, not at the symptom

**Action:** Use `search_files` to trace references:

```python
# Find where the function is called
search_files("function_name(", path="src/", file_glob="*.py")

# Find where the variable is set
search_files("variable_name\\s*=", path="src/", file_glob="*.py")
```

### Phase 1 Completion Checklist

- [ ] Error messages fully read and understood
- [ ] Issue reproduced consistently
- [ ] Recent changes identified and reviewed
- [ ] Evidence gathered (logs, state, data flow)
- [ ] Problem isolated to specific component/code
- [ ] Root cause hypothesis formed

**STOP:** Do not proceed to Phase 2 until you understand WHY it's happening.

---

## Phase 2: Pattern Analysis

**Find the pattern before fixing:**

### 1. Find Working Examples

- Locate similar working code in the same codebase
- What works that's similar to what's broken?

**Action:** Use `search_files` to find comparable patterns:

```python
search_files("similar_pattern", path="src/", file_glob="*.py")
```

### 2. Compare Against References

- If implementing a pattern, read the reference implementation COMPLETELY
- Don't skim — read every line
- Understand the pattern fully before applying

### 3. Identify Differences

- What's different between working and broken?
- List every difference, however small
- Don't assume "that can't matter"

### 4. Understand Dependencies

- What other components does this need?
- What settings, config, environment?
- What assumptions does it make?

---

## Phase 3: Hypothesis and Testing

**Scientific method:**

### 1. Form a Single Hypothesis

- State clearly: "I think X is the root cause because Y"
- Write it down
- Be specific, not vague

### 2. Test Minimally

- Make the SMALLEST possible change to test the hypothesis
- One variable at a time
- Don't fix multiple things at once

### 3. Verify Before Continuing

- Did it work? → Phase 4
- Didn't work? → Form NEW hypothesis
- DON'T add more fixes on top

### 4. When You Don't Know

- Say "I don't understand X"
- Don't pretend to know
- Ask the user for help
- Research more

---

## Phase 4: Implementation

**Fix the root cause, not the symptom:**

### 1. Create Failing Test Case

- Simplest possible reproduction
- Automated test if possible
- MUST have before fixing
- Use the `test-driven-development` skill

### 2. Implement Single Fix

- Address the root cause identified
- ONE change at a time
- No "while I'm here" improvements
- No bundled refactoring

### 3. Verify Fix

```bash
# Run the specific regression test
pytest tests/test_module.py::test_regression -v

# Run full suite — no regressions
pytest tests/ -q
```

### 4. If Fix Doesn't Work — The Rule of Three

- **STOP.**
- Count: How many fixes have you tried?
- If < 3: Return to Phase 1, re-analyze with new information
- **If ≥ 3: STOP and question the architecture (step 5 below)**
- DON'T attempt Fix #4 without architectural discussion

### 5. If 3+ Fixes Failed: Question Architecture

**Pattern indicating an architectural problem:**
- Each fix reveals new shared state/coupling in a different place
- Fixes require "massive refactoring" to implement
- Each fix creates new symptoms elsewhere

**STOP and question fundamentals:**
- Is this pattern fundamentally sound?
- Are we "sticking with it through sheer inertia"?
- Should we refactor the architecture vs. continue fixing symptoms?

**Discuss with the user before attempting more fixes.**

This is NOT a failed hypothesis — this is a wrong architecture.

---

## Red Flags — STOP and Follow Process

If you catch yourself thinking:
- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "Skip the test, I'll manually verify"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- "Pattern says X but I'll adapt it differently"
- "Here are the main problems: [lists fixes without investigation]"
- Proposing solutions before tracing data flow
- **"One more fix attempt" (when already tried 2+)**
- **Each fix reveals a new problem in a different place**

**ALL of these mean: STOP. Return to Phase 1.**

**If 3+ fixes failed:** Question the architecture (Phase 4 step 5).

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Issue is simple, don't need process" | Simple issues have root causes too. Process is fast for simple bugs. |
| "Emergency, no time for process" | Systematic debugging is FASTER than guess-and-check thrashing. |
| "Just try this first, then investigate" | First fix sets the pattern. Do it right from the start. |
| "I'll write test after confirming fix works" | Untested fixes don't stick. Test first proves it. |
| "Multiple fixes at once saves time" | Can't isolate what worked. Causes new bugs. |
| "Reference too long, I'll adapt the pattern" | Partial understanding guarantees bugs. Read it completely. |
| "I see the problem, let me fix it" | Seeing symptoms ≠ understanding root cause. |
| "One more fix attempt" (after 2+ failures) | 3+ failures = architectural problem. Question the pattern, don't fix again. |

### Vite / React Build Cache — Stale Error Artifacts

**Symptom:** `[vite:react-babel]` or `[vite:esbuild]` errors point at code that git shows as clean. Error says "Adjacent JSX elements", "Unexpected end of file", or "Unterminated regular expression" at line numbers that don't match the actual file content. Build fails despite no visible code defect.

**Root cause:** Vite caches transformed modules in `node_modules/.vite/`. If the cache was built against a stale version of a file (e.g., from a prior agent edit that was later reverted), it may report errors on lines that no longer exist.

**Fix sequence (cheapest first):**

1. **Verify the file is clean:**
   ```bash
   git diff path/to/file.jsx    # should show no diff
   git log --oneline -3 path/to/file.jsx  # check recent history
   ```

2. **Clear Vite cache and rebuild:**
   ```bash
   rm -rf node_modules/.vite
   npm run build   # or pnpm build
   ```

3. **If still failing, clear node_modules cache entirely:**
   ```bash
   rm -rf node_modules/.vite node_modules/.cache
   npx vite build --force
   ```

4. **Last resort — restart the dev server:**
   ```bash
   # Kill existing dev server
   pkill -f "vite" || true
   # Start fresh
   npm run dev   # or pnpm dev
   ```

**Detection at a glance:** If `git diff file.jsx` shows no changes, `git checkout -- file.jsx` resets nothing, but `npm run build` still fails on the same line → 90% chance it's a stale Vite cache.

**Related:** When the build succeeds but `pnpm dev` (HMR) shows phantom errors, the Vite dev server's in-memory transform cache may be stale — kill and restart it explicitly rather than relying on file-watch recovery.

---

### JSX Div-Balance Debugging

**Symptom:** Build error says "Unexpected end of file before a closing div tag" or "Adjacent JSX elements", but manual inspection of the JSX is confusing because of deeply nested ternary operators and fragments.

**Technique — use python3 to count `<div>` vs `</div>` balance across the return block:**

```bash
cd /path/to/repo && python3 -c "
lines = open('src/components/ProblemComponent.jsx').readlines()
in_return = False
open_divs = 0
for i, line in enumerate(lines, 1):
    if 'return (' in line and i > 500:  # approximate start
        in_return = True
    if in_return or i >= 500:
        open_divs += line.count('<div') - line.count('</div')
        if open_divs != 0:
            print(f'{i:4d} (depth={open_divs:2d}): {line.rstrip()[:100]}')
print(f'Final open divs: {open_divs}')
"
```

- A final balance of `0` means all divs are properly closed.
- A positive final balance means `N` missing `</div>` tags.
- A negative final balance means `N` extra `</div>` tags.
- Lines where `depth` stays positive past the expected end give you the exact location of the mismatch.

**Note:** This counts `<div` literally — it doesn't parse `<div>` correctly inside JSX comments or strings, but for practical JSX debugging, false positives are rare because component attributes rarely contain literal `<div`.

---

### Hagent-Specific Pitfalls

### SQLite Database Path

**Symptom:** Tools return empty results, "no such table", 0 records, or `AttributeError` on SQL queries — but you know data exists.

**Canonical HAgent app DB:** `<repo_root>/data/hagent.db`.

Backend code should import `get_connection()` from `api.services.db`, which resolves the DB from the repository root and respects `HAGENT_DATA_DIR`.

**Fix path bugs:** Replace ad hoc `sqlite3.connect("./data/hagent.db")`, `backend/data/hagent.db`, or cwd-relative DB paths with `api.services.db.get_connection()`.

**Detection:** 
```bash
ls -la data/hagent.db
```
- Do not create `backend/data/hagent.db` as a workaround.

### CV Generation — Editing Wrong Files

**Symptom:** User says CV generation is broken; you search your memory and think you already fixed it by editing files.

**Root cause suspicion:** You may have edited files that DO NOT EXIST.

**Canonical CV files in HAgent:**
- Core logic: `api/routers/cv_generate.py` (NOT `cv_generator.py`, NOT `cv_routes.py`)
- Tool wrapper: `tools/job_hunter_tool.py` — function `cv_generate_docx_tool` (lines 327-445)
- Route: `POST /api/cv/generate-docx` (NOT `/api/cv/generate`)

**Triage steps before any edits:**
1. Verify which file(s) actually exist with `search_files("cv_generate", path="backend/api")` or `ls -la api/routers/cv_*`
2. Test the route directly: `curl -X POST http://localhost:8010/api/cv/generate-docx -H "x-user-id: hat" -d '{"mode":"role","target_role":"Data Analyst"}'`
3. If getting 403/502 error, try with `provider="cx"` — pekpik (LM Studio) often goes offline
4. Check `_resolve_provider()` in `cv_generate.py` line 144 — it has NO automatic fallback

**Pitfall trap:** The names `cv_generator.py` and `cv_routes.py` sound plausible but will cause you to write code that never executes. Always verify file existence before editing.

### Missing Function / Import — HAgent Cron & Gateway

**Symptom:** Cron job reports `NameError: name 'X' is not defined`, job fails silently. Error only visible in `logs/cron-error.log`. Cron system tries to call a function that doesn't exist in the Python runtime.

**Root cause:** `backend/cron/scheduler.py` (or related modules) references functions or variables that were never defined or imported. Common in this codebase because it evolves rapidly — new features add callsites without the corresponding definitions.

**Diagnostic sequence (3 checks):**

1. **Is the function defined anywhere?**
   ```bash
   search_files("def X", path="backend/")
   ```
   If not found → it needs to be written or imported.

2. **If defined elsewhere, is it imported?**
   ```bash
   search_files("import.*X|from.*import.*X", path="backend/cron/scheduler.py")
   ```
   If the import is missing, add it. Use a lazy import inside the function body to avoid module-load-time failures:
   ```python
   def _wrapper(obj):
       try:
           from hagent_cli.config import _real_fn as _fn
           return _fn(obj)
       except ImportError:
           return obj  # safe fallback
   ```

3. **Python version syntax incompatibility?**
   The system Python may be 3.9 but `scheduler.py` uses `list[str] | None` (3.10+). Fix:
   - Remove the `| None` annotation and let the type be inferred at runtime, OR
   - Use `Optional[List[str]]` from `typing`

**Known missing definitions found in scheduler.py:**
| Missing name | Fix |
|---|---|
| `set_session_vars(platform, chat_id, chat_name)` | Replace with inline `_VAR_MAP["HAGENT_SESSION_PLATFORM"].set("")` etc. |
| `clear_session_vars(tokens)` | Replace with inline reset of same vars |
| `_expand_env_vars(obj)` | Lazily import from `hagent_cli.config` (see lazy-import pattern above) |
| `_VAR_MAP` (global ContextVar dict) | Initialize at module level with all needed keys |

**Verification after fix:**
```bash
# 1. Module loads cleanly
python3 -c "import sys; sys.path.insert(0, 'backend'); from cron.scheduler import _VAR_MAP"

# 2. Check cron-error.log for the next tick — no new NameError
tail -f logs/cron-error.log

# 3. If cron still fails: restart the scheduler process
pm2 restart hagent-cron
```
`hagent-cron` (PM2 process) caches Python bytecode — code changes to `scheduler.py` take effect only after `pm2 restart hagent-cron`.

### Tool CWD Assumptions

Many tools assume a specific CWD. Avoid cwd-relative database paths; use `api.services.db.get_connection()` or an explicit absolute path.

### PM2 / Service Restart Loop — Not a Code Crash

**Symptom:** PM2 reports hundreds of restarts in minutes but no error messages in logs. Service appears "online" but user experiences connection drops.

**Key insight:** High restart count without errors is almost never a code crash. It's a **restart loop** caused by compounding restart mechanisms (watchdog + PM2 auto-restart).

**Diagnostic first step (before any fix):**
1. `pm2 show <service>` — check restarts vs unstable_restarts. If unstable_restarts=0 → external mechanism, not crash
2. Check for watchdog: `pm2 list | grep watch`, `scripts/watchdog.py`
3. Read watchdog log: look for "restart" messages to confirm
4. Read PM2 ecosystem config: check `min_uptime`, `restart_delay`, `max_restarts`

**See the `pm2-service-restart-loop` devops skill for full diagnosis and fix guide.**

---

## References

- `references/url-sanitize-recovery.md` — Debugging `Invalid non-printable ASCII character in URL` errors in httpx/OpenAI SDK client creation.
- `references/nextjs-hmr-errors.md` — Next.js dev-mode Turbopack HMR `insertBefore` errors: diagnosis, fixes, prevention. Covers the call chain, proven corruption sources, and the permanent sanitize fix applied to `_to_openai_base_url()` and `_extract_url_query_params()`.

---

## Quick Reference

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| **1. Root Cause** | Read errors, reproduce, check changes, gather evidence, trace data flow | Understand WHAT and WHY |
| **2. Pattern** | Find working examples, compare, identify differences | Know what's different |
| **3. Hypothesis** | Form theory, test minimally, one variable at a time | Confirmed or new hypothesis |
| **4. Implementation** | Create regression test, fix root cause, verify | Bug resolved, all tests pass |

## Hagent Agent Integration

### Investigation Tools

Use these Hagent tools during Phase 1:

- **`search_files`** — Find error strings, trace function calls, locate patterns
- **`read_file`** — Read source code with line numbers for precise analysis
- **`terminal`** — Run tests, check git history, reproduce bugs
- **`web_search`/`web_extract`** — Research error messages, library docs

### With delegate_task

For complex multi-component debugging, dispatch investigation subagents:

```python
delegate_task(
    goal="Investigate why [specific test/behavior] fails",
    context="""
    Follow systematic-debugging skill:
    1. Read the error message carefully
    2. Reproduce the issue
    3. Trace the data flow to find root cause
    4. Report findings — do NOT fix yet

    Error: [paste full error]
    File: [path to failing code]
    Test command: [exact command]
    """,
    toolsets=['terminal', 'file']
)
```

### With test-driven-development

When fixing bugs:
1. Write a test that reproduces the bug (RED)
2. Debug systematically to find root cause
3. Fix the root cause (GREEN)
4. The test proves the fix and prevents regression

## Real-World Impact

From debugging sessions:
- Systematic approach: 15-30 minutes to fix
- Random fixes approach: 2-3 hours of thrashing
- First-time fix rate: 95% vs 40%
- New bugs introduced: Near zero vs common

**No shortcuts. No guessing. Systematic always wins.**

---

## Hagent-Specific Pitfalls (Updated 2026-05-27)

### Frontend vs Backend Path Convention — ALWAYS Verify File Location

**Symptom:** Searching for `SystemHub.jsx` returns results only in `frontend/src/components/`, but you assume it's in `backend/src/components/`. You try to edit the wrong file.

**Root cause:** HAgent is a full-stack project with distinct frontend and backend folders:
- **Frontend (React):** `/Users/nguyenhat/HAgent/frontend/src/components/`
- **Backend (FastAPI + Python):** `/Users/nguyenhat/HAgent/backend/api/`, `/backend/agent/`, etc.

**Fix sequence:**

1. **Search with absolute paths first:**
   ```bash
   find /Users/nguyenhat/HAgent -name "SystemHub.jsx" 2>/dev/null
   ```

2. **Never assume frontend files are in backend/** — they're separate!

3. **When user says "fix X.jsx", verify the actual location before editing.**

**Detection pattern:** If `read_file` returns "File not found: /Users/nguyenhat/HAgent/backend/src/components/..." but search shows it exists elsewhere → switch to correct path immediately.

---

### Production-Safe Refactoring — Check Endpoints Before Removing Components

**Symptom:** User asks to remove a component from `SystemHub.jsx` (e.g., "Code" tab), but the backend has no API endpoint for it.

**Root cause:** In production deployments, some components may exist in frontend codebase but have NO corresponding backend endpoint:
- Code editor exists as a React component
- BUT there's no FastAPI route like `POST /api/code/` 
- So in production deployment, rendering this component serves no purpose

**Fix sequence (3 steps):**

1. **Check for API endpoint first:**
   ```bash
   # Search for routes pointing to this component
   grep -r "CodeWorkspace" backend/api/routers/ 2>/dev/null || echo "No route found!"
   ```

2. **If NO endpoint exists, comment out — NEVER delete without confirmation:**
   - Use `// const CodeWorkspace = ...` to disable import
   - Comment out the tab definition in UI list
   - Comment out the render block conditionally
   - **NEVER delete the component file without user confirmation** (embed from "Ghi nhớ khi xóa gì phải hỏi")

3. **Add production-specific comment:**
   ```jsx
   // const CodeWorkspace = lazy(() => import('./CodeWorkspace.jsx'))  // Disabled: no API endpoint in production
   ```

**Pattern summary:** Frontend component exists → Backend endpoint missing → Comment out gracefully in production, preserve file for future re-enablement.

---

### User Safety Preference — Explicit Deletion Confirmation Required

**Rule:** When user asks "fix import path" or "remove X", check:

1. Is this a modification (rename/import fix)? → OK
2. Is this a comment-out/disable? → OK with note explaining why
3. **Is this a DELETION?** → ASK FIRST before deleting any file!

**User stated:** "Ghi nhớ khi xóa gì phải hỏi" (remember to ask before deleting).

**Action pattern:** Before running `remove_file` or `rm`:

```bash
# List all related files first:
echo "=== Files that would be deleted ===" && find /Users/nguyenhat/HAgent -name "CodeWorkspace.*" 2>/dev/null

# Say: "Would you like me to delete this file? Or just comment it out?"
```

**Files can ALWAYS be re-enabled from git:** Deleting without backup is risky. Commenting out is safer and reversible.

---

### Production-Safe Refactoring Checklist (Production Deployment 2026)

Before making structural changes in production environment:

- [ ] **Verify actual file location** (frontend vs backend, not assumptions)
- [ ] **Check if backend API endpoint exists** for the component being modified
- [ ] **Comment out instead of deleting** unless explicit user confirmation given
- [ ] **Add explanation comments** about why a feature is disabled ("no API endpoint in production")
- [ ] **Never delete files without asking first** (user safety preference)

---

### Frontend Component → Backend Endpoint Mismatch — The Pattern

**Problem:** Component exists in frontend but backend API doesn't call it.

**Example:** `CodeWorkspace.jsx` has no route like `POST /api/code/`.

**Solution pattern:**
1. Check for endpoint: `grep -r "CodeWorkspace" backend/api/routers/`
2. If empty → component not used in production workflow
3. **Comment out import and render blocks (with explanation)**
4. **NEVER delete file without user confirmation**

---

### Frontend vs Backend — Quick Path Reference

| Type | Typical Location | Example Files |
|------|------------------|---------------|
| **React Components** | `frontend/src/components/` | `SystemHub.jsx`, `FileManager.jsx` |
| **FastAPI Routes** | `backend/api/routers/` | `cv_generate.py`, `job_hunter.py` |
| **Python Services** | `backend/api/services/` | `db.py`, `file_manager.py` |
| **LLM Orchestration** | `backend/agent/` | Prompt files, memory plugins |
| **Tools** | `backend/tools/` | Browser automation, terminal access |

**Pitfall:** Frontend component names often look like backend routes (`SystemHub`, `FileManager`) but live in completely different folders!

---

### User Safety Preference — Explicit Deletion Confirmation Required (Redundant Section Removed)

### SQLite FOREIGN KEY — Hardcoded String vs Actual Referenced ID

**Symptom:** `FOREIGN KEY constraint failed` on insertion into a table like `video_tasks` or `job_applications`. The INSERT runs without error in isolation, but SQLite rejects it at commit.

**Root cause pattern:** The code inserts a **hardcoded string** (e.g., `"user"`, `"default"`, `"admin"`) into a column that has `FOREIGN KEY (...) REFERENCES parent_table(id)`, but the parent table's `id` column is **INTEGER PRIMARY KEY** — so the string value never matches any actual row in the referenced table.

**Diagnostic (3 steps):**

1. **View the table schema** to see the FOREIGN KEY constraint:
   ```bash
   python3 -c "
   import sys; sys.path.insert(0, 'backend')
   from api.services.db import get_connection
   conn = get_connection()
   sql = conn.execute(\"SELECT sql FROM sqlite_master WHERE name='video_tasks'\").fetchone()
   print(sql[0])
   conn.close()
   "
   ```

2. **Check the referenced table** to see what real IDs exist:
   ```bash
   python3 -c "
   import sys; sys.path.insert(0, 'backend')
   from api.services.db import get_connection
   conn = get_connection()
   rows = conn.execute('SELECT id, name FROM users LIMIT 5').fetchall()
   for r in rows: print(dict(r))
   conn.close()
   "
   ```

3. **Trace the INSERT statement** in the codebase — look for the exact `VALUES` being passed:
   ```bash
   search_files("INSERT INTO video_tasks", path="backend/")
   ```
   Check whether the value inserted into the FK column is:
   - A hardcoded string (`"user"`, `"default"`) → mismatch
   - An actual user ID fetched from auth context → correct
   - `None` → if column is NOT NULL, will fail with NOT NULL constraint instead

**Fix options (in priority order):**

| Option | When to use | Code change |
|--------|-------------|-------------|
| **A. Pass real user ID** | When request context is available | Pass `_get_user_id(request)` result instead of hardcoded string |
| **B. Disable FK enforcement** | Quick workaround, e.g., demo/testing | Add `conn.execute("PRAGMA foreign_keys = OFF")` before INSERT. **WARNING:** leaks referential integrity — only use for transient data. |
| **C. Make column nullable + remove FK** | When user_id is not actually needed | `ALTER TABLE video_tasks DROP CONSTRAINT...` (SQLite requires table recreation) |
| **D. Create a real parent row** | When the hardcoded string is meant to be a fixed reference | `INSERT OR IGNORE INTO users(id) VALUES('user')` — **makes schema design questionable** |

**Detection pattern at a glance:** If you see `FOREIGN KEY constraint failed` and the INSERT code contains a hardcoded string in the FK position → it's Option A or B territory. Check whether `_get_user_id(request)` or similar auth context is available at the callsite.

**Example from HAgent codebase (video_tasks):**
```python
# BAD — hardcoded "user" string against INTEGER PRIMARY KEY users(id)
conn.execute(
    "INSERT INTO video_tasks (user_id, ...) VALUES (?, ...)",
    ("user", ...)  # 'user' is never an actual users.id value
)

# FIX — pass the real user ID (or pragma foreign_keys=OFF)
```

**SQLite-specific quirk:** `PRAGMA foreign_keys` is a **per-connection** setting, not database-wide. It defaults to OFF. If the bug only happens sometimes, it may be because some code paths open their own connection with `PRAGMA foreign_keys = ON` (e.g., via SQLAlchemy or Alembic migrations).

**Verification after fix:**
```bash
cd /path/to/repo && python3 -c "
import sys; sys.path.insert(0, 'backend')
from api.services.db import get_connection
conn = get_connection()
# Test insert with a valid FK (or with FK enforcement off)
try:
    cur = conn.execute('INSERT INTO video_tasks (user_id, title, source_type, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                       (1, 'test', 'url', 'queued', 0, 0))
    conn.rollback()  # don't actually save
    print('✓ INSERT succeeded — FK constraint satisfied')
except Exception as e:
    print(f'✗ INSERT failed: {e}')
conn.close()
"
```

---

### React Effect Cleanup — Prevent State Leaking Across Sessions/Contexts

**Symptom:** Workspace/todo/data from a previous chat session (or component mount) "leaks" into the current session's view. Switching sessions briefly shows the old session's data before the new one loads. Data appears mixed — some fields belong to one session, some to another.

**Root cause pattern:** A `useEffect` sets derived state (e.g., workspace, todos, messages) as a side effect of a changing dependency (e.g., `activeId`). When the dependency changes, React:

1. Runs the **cleanup** of the *previous* effect
2. Then runs the **setup** of the *new* effect

But if the setup is **async** (calls `fetch` or `setTimeout`) and the cleanup only clears polling intervals — **not the derived state itself** — there's a window where the old state is still displayed while the new data is loading.

**The fix is always the same — reset derived state in the cleanup:**

```jsx
useEffect(() => {
  if (activeId) {
    loadMessages(activeId)      // async — fetches data
    fetchWorkspace(activeId)    // async — fetches data
  }
  return () => {
    // CLEANUP: reset derived state BEFORE new effect runs
    setWorkspace({ tools: [], todos: [], summary: null })
    setMessages([])
    setSteps([])
    // Also clear any polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }
}, [activeId])
```

**Diagnostic sequence:**
1. Identify the useEffect that sets derived state when a "session key" (activeId, currentTab, selectedItem) changes
2. Check what the cleanup function does — if it only clears timers/intervals but doesn't reset the state, you've found the root cause
3. Add state reset for every piece of derived state that depends on that session key

**Verification after fix:** Switch sessions rapidly — the UI should show empty/loading state between switches, never stale data from the previous session.

**Broader pattern — "session-key" derived state:**
Any React component where a primary key (session ID, conversation ID, selected item ID) drives multiple async fetches needs this pattern:

```
useEffect([sessionKey]) {
  setDerivedState(defaultValue)  // ← reset FIRST
  fetchSessionData(sessionKey)   // ← then fetch
  return () => cleanup polling
}
```

**Don't skip even if the component seems simple** — the window is small (~100-300ms per polling interval) but very visible to the user as "flash of wrong content".

---

### Common Red Flags — STOP and Verify

If you catch yourself thinking:
- "Quick fix for now" → Stop, check location first
- Just change file path without verifying → Stop, use `find` command
- Delete a component without confirmation → Stop, ask user first
- Remove a tab without checking backend endpoint → Stop, comment out with note

**ALL of these mean: STOP. Follow the safety checklist.**

---

### Common Rationalizations — DON'T Do This

| Excuse | Reality |
|--------|---------|
| "I'll just edit it in backend/" | Wrong location! Use `find` first to confirm. |
| "Delete the component, it's not used" | User says "ask before deleting". Comment out instead. |
| "It works locally, I can change anything" | Production deployment has different structure. Verify endpoints exist. |
| "One more change, it'll be fine" | Structural changes require checklist verification. |

---

### Production Deployment Checklist (May 2026)

When making changes for production (`hatai.io.vn` deployment):

- [ ] Verify file location with absolute paths
- [ ] Check backend endpoint existence
- [ ] Comment out features without endpoints (with notes)
- [ ] Ask user before deleting any files
- [ ] Add gitignore or .env placeholders for new secrets
- [ ] Run `npm run lint` on frontend changes

### When CodeWorkspace Exists but Has No Endpoint

**Pattern:**
1. Import disabled: `// const CodeWorkspace = lazy(...)`
2. Tab definition commented out in UI list
3. Render block commented out conditionally  
4. Component file preserved for future re-enablement
5. Comment explains why disabled ("no API endpoint in production")

**This is the approved production-safe pattern!**

## Real-World Impact (Updated 2026-05-27)

From this session:
- **Frontend/backend confusion** → Now documented with explicit paths and verification steps
- **Production endpoint checking** → Added as required step before component modifications
- **Safety-first deletion policy** → Embedded directly into debugging workflow

**No assumptions. Verification first. User confirmation for deletions.**
