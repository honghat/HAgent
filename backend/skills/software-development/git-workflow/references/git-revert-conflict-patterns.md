# Git Revert — Conflict Resolution Patterns

## When Revert Hits Merge Conflicts

Occurs when reverting a commit whose changes overlap with subsequent commits on the branch.

### Common Pattern: Identical Conflict Blocks

**Scenario**: Commit `X` changed code in `Chat.jsx` (auto-retry/fallback logic). Later commits touch the same sections. When reverting `X`, git finds 2+ identical conflict blocks at different locations.

**Resolution (keep HEAD)**:
```bash
git revert <sha>
# → Conflict in file.jsx
# → 2 blocks of <<<<<<< HEAD / ======= / >>>>>>> parent of X
```

Each block shows:
- **HEAD** (ours): current state with all subsequent changes
- **parent of X** (theirs): what the code looked like before commit `X`

Since `HEAD` already includes the "post-X" state, **keep HEAD** to undo what `X` introduced while preserving later refinements.

### Step-by-Step Resolution

1. **Locate conflicts**:
   ```bash
   grep -n '<<<<<<< HEAD\|=======\|>>>>>>>' <file>
   ```

2. **For each block**, choose:
   - **Keep HEAD** (preferred): remove `<<<<<<< HEAD`, `=======`, `>>>>>>> parent of X` lines, keep the HEAD content
   - **Take theirs**: remove conflict markers, keep content between `=======` and `>>>>>>>`

3. **Verify**:
   ```bash
   grep -c '<<<<<<< HEAD\|>>>>>>>' <file>  # should be 0
   git add <file>
   ```

4. **Complete revert**:
   ```bash
   git revert --continue --no-edit
   ```

### Pitfalls

- **Don't skip `.gitadd` before continue** — `git revert` won't proceed until all conflicts are staged
- **Don't retry `grep` on `git diff --diff-filter=U`** — it may report the file even after resolution; use `grep` on file content instead to confirm no conflict markers remain
- **For JSX/Python files**: the 2 identical blocks usually share the same logic (e.g., auto-retry fallback) at different call sites — resolve them identically
