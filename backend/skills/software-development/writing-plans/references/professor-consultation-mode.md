# Giáo Sư (Professor Consultation) Mode

## Overview

A structured 4-step workflow for code fixes/modifications where an external LLM ("professor") is consulted to generate a plan before execution. The professor provides a detailed, step-by-step implementation plan that the agent then executes faithfully.

## When to Use

Use this mode when the user explicitly activates it with `[CHẾ ĐỘ HỎI GIÁO SƯ — bật cứng]` or similar. The user drives activation — do not enter this mode unprompted.

Characteristics that trigger professor mode invocation:
- Complex multi-file changes (e.g., editing build script + rewriting JSON data)
- User wants "second opinion" before code is changed
- Visual/layout fixes where precise dimensions matter
- Tasks where the user wants the agent to "think before doing"

## The 4-Step Protocol

Strictly follow these steps **in order**. Do not skip, reorder, or combine steps.

### Step 1: Collect Context (1-3 rounds)

Gather all relevant files before consulting the professor. Use:
- `read_file` — Read source code and data files with full content
- `search_files` — Find related files if unsure which to modify
- `bash` (ls, find, etc.) — Discover project structure, locate files

**Limit to 1-3 tool calls.** You need enough context to describe the full problem, not to explore deeply. The professor needs:
- The exact file content being modified
- The current project structure around it
- The user's explicit requirements

### Step 2: Call ask_chatgpt2api with Context + Question

Pass to the professor:
- Full file content(s) relevant to the change
- Current behavior ("as-is")
- Desired behavior ("to-be") from the user
- The explicit question: what to change, where, how

**Format the context clearly.** Use:
```markdown
## File X hiện tại
```
and section headers to separate files from requirements.

### Step 3: Read the Professor's Plan

Wait for and read the full professor response. The response should contain a detailed plan with:
- **Exact code changes** (what to patch/rewrite)
- **File paths** to modify
- **Parameters** (font size, position, colors, etc.)
- **Execution commands** to run after changes

### Step 4: Execute Step by Step

Implement exactly what the professor specified:
- Use `patch` for targeted edits (preferred)
- Use `write_file` for complete rewrites
- Use `bash` to run the build/render/verify commands

Do NOT deviate from the professor's plan without user approval.

## Prohibited Behavior in This Mode

- ❌ Returning text before completing all 4 steps
- ❌ Skipping Step 2 (professor consultation)
- ❌ Implementing from your own knowledge without consulting
- ❌ Reporting results without running the actual command (no fabrication)
- ❌ Combining steps (e.g., reading + implementing without consultation)

## Tool Restriction Note

This mode uses `ask_chatgpt2api` which is the **only** external LLM tool permitted, per user preference. Do not substitute with `ask_deepseek`, `ask_claude`, or similar tools (user has explicitly banned these).

## Example Session

**User:** "cho caption nhỏ lại, quá to, ko có nền đen, đưa lên cao tí"

**Step 1:** Read `build_video.py` and `script.json` to understand current state.

**Step 2:** Call ask_chatgpt2api with full file contents + user requirements.

**Step 3:** Professor responds: font_size 60 (was 85), txt_y=10% (was 22%), remove bg_clip, new script content.

**Step 4:** Execute: `patch build_video.py`, `write_file script.json`, `bash python3 build_video.py`.

## Relationship to Other Skills

- **`writing-plans`** — Professor mode uses an external LLM to generate the plan instead of the agent writing it. The `writing-plans` skill's structure (bite-sized tasks, exact paths, verifications) is what a good professor response should look like.
- **`subagent-driven-development`** — Professor mode executes directly (patch/write/bash) rather than delegating. It's a simpler, faster path for single-session fixes.
- **`spike`** — Professor mode is for **planned changes to existing code**, not exploratory experiments.
