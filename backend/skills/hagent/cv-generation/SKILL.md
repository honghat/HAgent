---
name: cv-generation
description: Generate, rewrite, and manage CV/Resume documents (.docx) tailored to job descriptions or target roles. Covers the full pipeline of reading stored CV, LLM rewriting, output .docx, and the tools/routes involved.
tags: [cv, resume, docx, job-hunter, career, document-generation]
triggers:
  - user says "viet CV" or "lam CV" or "generate CV" or "rewrite CV"
  - user says "CV cho JD" or "CV cho role" or "sua CV theo job"
  - user asks why CV generation failed
  - error messages about CV generation (LLM errors, forbidden, empty rewrites)
category: hagent
---

# CV Generation Skill

## Architecture

CV generation involves three layers:

```
[User/Agent] -> (tool: cv_generate_docx) -> [job_hunter_tool.py]
                                              |
                                    [cv_generate.py router]
                                              |
                                    LLM API (pekpik / cx / etc.)
                                              |
                                    Output .docx in uploads/cv-generated/
```

### Key Files

| File | Location | Role |
|------|----------|------|
| API Router | `api/routers/cv_generate.py` | Core logic: DOCX parsing, LLM call, rewriting, output writing |
| Tool wrapper | `tools/job_hunter_tool.py` (fn `cv_generate_docx_tool`, lines 327-445) | Agent-facing tool that delegates to the router |
| Tool registration | `tools/job_hunter_tool.py` lines 327-346 | Registry metadata (parameters, description) |

### Routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/cv/generate-docx` | Generate CV via header `x-user-id` |
| Tool | `cv_generate_docx` | Agent wrapper (through `/api/job-hunter/execute`) |

## Two Modes

1. **`mode=role`** -- rewrite CV tailored to a general target role (e.g. "Senior Data Analyst").
2. **`mode=jd`** -- rewrite CV tailored to a specific job description (requires `job_title` / `job_url` / `job_description`).

## Parameters (for `cv_generate_docx` tool)

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `mode` | string | yes | `"jd"` or `"role"` |
| `user_token` | string | no | defaults to `"hat"` |
| `target_role` | string | no | For `mode=role` |
| `job_url` | string | no | For `mode=jd` -- JD URL from cached_jobs |
| `job_title` | string | no | For `mode=jd` -- fallback title |
| `job_company` | string | no | For `mode=jd` -- optional company hint |
| `job_description` | string | no | For `mode=jd` -- JD snippet |
| `provider` | string | no | Override LLM provider (e.g. `"cx"`, `"pekpik"`, `"deepseek"`) |
| `model` | string | no | Override model name |

## LLM Provider Resolution

The function `_resolve_provider()` in `cv_generate.py` (line 144) follows:

1. Explicit `provider` parameter if given
2. User's `default_provider` setting (from `users` table)
3. Agent profile's `model` field (can be `"pekpik"`, `"cx"`, `"deepseek"`, etc.)

**No automatic fallback** is built in -- if the resolved provider returns 403/timeout, the operation fails with a 502 error.

## Common Failure Modes and Fixes

### 1. "LLM loi khi viet CV: HTTP Error 403 Forbidden"
- Cause: pekpik (LM Studio) server is off or refusing connections
- Fix: Pass `provider="cx"` explicitly to use the 9router API instead
- Also usable: `"deepseek"`, `"openai"`, `"anthropic"`

### 2. "Chua co CV trong he thong. Hay upload CV truoc."
- Cause: No record in `cv_documents` table for this user
- Fix: Upload a .docx file first via the CV upload UI

### 3. "LLM khong tra ve rewrite nao hop le."
- Cause: LLM returned malformed JSON or empty rewrites list
- Fix: Check raw response in server logs. Usually a model quality issue.

### 4. "Chi rewrite duoc CV nguon dang .docx."
- Cause: Uploaded file is PDF or other format
- Fix: Convert to .docx first

## DOCX Manipulation Details

The router uses `zipfile` to read/write the DOCX (which is a ZIP archive) and `ElementTree` to manipulate `word/document.xml`:

- `_read_docx_paragraphs()` -- extracts `(idx, w:p element, joined_text)` tuples
- `_replace_paragraph_text()` -- collapses all `w:t` runs into one, replaces text
- `_write_docx()` -- copies all other archive entries, rewrites `word/document.xml`

## Prompt Structure

The LLM receives:
1. Instruction (mode-specific)
2. Target info (role/JD details)
3. All paragraphs as `[{idx, text}]`
4. JSON output schema with `{rewrites: [{idx, new_text}]}`
5. Rules (keep unchanged paragraphs out, +/-40% length, Vietnamese if original, dont fabricate)

Temperature: 0.3, max_tokens: 4096.

## Pitfalls

- **DO NOT edit `cv_generator.py` or `cv_routes.py`** -- these files DO NOT EXIST. The real file is `api/routers/cv_generate.py`.
- The API route is `/api/cv/generate-docx`, NOT `/api/cv/generate`.
- When testing via curl, pass `x-user-id: hat` header, not json body for user identification.
- If the tool wrapper (`cv_generate_docx` from tools) fails, test the route directly to isolate the issue.
- Provider "pekpik" = LM Studio local; it often goes offline. Always try with `provider="cx"` as first triage step.
