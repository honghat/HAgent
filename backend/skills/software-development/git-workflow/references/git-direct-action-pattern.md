# Git Direct Action Pattern (User: anh Hạt)

## Context

This reference documents the user preference for **direct git operations** without excessive confirmation questions. Captures patterns from 2026-06-01 session where user explicitly corrected verbose behavior:

- `"commit đừng hỏi nhiều"` → direct action confirmed
- `"sao rồi"` → report progress immediately  
- `"nhanh"` → skip explanations, execute directly

---

## Trigger Conditions

Use this pattern when:

1. **User says any of:** `"commit"`, `"push"`, `"git đi"`, `"tiếp tục"`, `"đồng ý"`, or similar brief git commands
2. **Git repository detected** via `git status`
3. **No blocking issues** (no secrets detected, no file size violations, PM2 logs clean)

---

## Execution Sequence

### Standard Flow (0 Questions)

```bash
# Step 1: Identify changes
git status --short

# Step 2: Stage all
git add -A

# Step 3: Commit with Vietnamese message (infer from context or default)
git commit -m "sửa backend CLI và main"

# Step 4: Push
git push origin branch-name
```

### Report Structure

After each step, report **only key metrics**:

✅ Exit code: `0`  
✅ Files changed: `238 insertions(+), 40 deletions(-)`  
✅ Branch status: `up to date with origin/main`

---

## Confirmation Rules (When to Ask)

**Ask exactly ONE question if:**

| Condition | Question |
|-----------|----------|
| Multiple branches detected | "Branch X hay Y?" |
| File exceeds 2000 lines | "Tách file này trước commit không?" |
| gitleaks detects secrets | "Xóa file chứa secrets chưa?" |
| PM2 services affected | "Kiểm tra log PM2 trước push chưa?" |

**Otherwise:** Execute immediately.

---

## Pitfalls to Avoid

❌ **DO NOT ask 3+ confirmation questions** — violates user's "concise" preference  
❌ **DO NOT explain every step** unless user explicitly asks ("sao rồi", "giải thích")  
❌ **DO NOT use verbose commit messages in English** — must be Vietnamese  

✅ **DO use default inference** for commit messages based on changed files  
✅ **DO report outcomes immediately** with key metrics only  
✅ **DO wait for explicit follow-up** like "tiếp tục", "nhanh" after completion  

---

## Example Interactions

### Session Pattern 1: Direct Command → Immediate Execution

```
User: "commit và push"
Agent: 
  → Runs git status, add, commit with Vietnamese message, push
  → Reports: "✅ Đã commit 2 files (238 insertions), pushed lên main branch"
  
User: "sao rồi"
Agent:
  → Already completed the task, no extra question asked
  
User: "tiếp tục"
Agent:
  → Continues workflow without confirming (user trusts agent's inference)
```

### Session Pattern 2: User Corrects Verbose Behavior

```
User: "commit đừng hỏi nhiều"
Agent:
  → Executes immediately with default actions
  → No follow-up questions unless errors occur
  → If error, reports and asks ONE blocking question only
```

### Session Pattern 3: Error Handling (Ask When Needed)

```
Agent detects file >2000 lines
→ "File X có 3000 dòng. Tách thành nhiều file nhỏ hơn trước commit không? (c=chia, b=bỏ qua)"
User: "b"
→ Proceeds with commit skipping large file
```

---

## Related Skills

- [`git-workflow`](../software-development/git-workflow) — Main git workflow patterns
- [`tool-usage-patterns`](../devops/tool-usage-patterns) — General tool failure handling
- [`hagent-agent`](../autonomous-ai-agents/hagent-agent) — User communication style guidelines

---

## Last Updated

2026-06-01 — Session with anh Hạt demonstrating direct action preference for git operations.
