---
name: career-quest
description: "Skill thống nhất phục vụ mục tiêu xin việc của user. Đốc thúc săn JD, học code & tiếng Anh có chủ đích theo khung giờ trong ngày. Đọc /api/coach/dashboard để lấy JD match + lesson backlog, soạn 1 nhắc ≤5 dòng, lưu qua /api/coach/reminders. Trả [SILENT] khi không có gì cần nhắc."
---

# career-quest — Săn việc, học code, học tiếng Anh

Mục tiêu **duy nhất**: giúp user xin được việc. Mọi nhắc nhở phải quy về một trong: săn JD, match CV, học kỹ năng còn thiếu so với JD, hoặc ứng tuyển.

## DB path rule

All job_hunter tools (`match_new`, `top_matches`, `my_cv`) must read through `api.services.db.get_connection()`.

Canonical DB path:

`/Users/nguyenhat/HAgent/data/hagent.db`

Do not use or create `backend/data/hagent.db`. If a tool cannot see data, fix the code to import `get_connection()` from `api.services.db` instead of adding path workarounds.

## Tool parameter pitfall: `user_token` vs DB column `user_id`

**CRITICAL**: The `job_hunter_*` tools (`match_new`, `top_matches`, `my_cv`, `compare_cv_job`) accept a `user_token` parameter. However, the actual DB schema uses `user_id` as the column name:

| Tool param | DB column |
|---|---|
| `user_token` | `cv_documents.user_id` |
| `user_token` | `cv_match_scores.user_id` |

When a tool reports "Chưa có CV" even though `cv_documents` has rows for `user_id='hat'`, the tool's internal SQL uses `user_token` as-is and either:
1. The tool's DB connection resolves to a different hagent.db (the path mismatch above), OR
2. The tool's SQL queries the wrong table/column

**Defense**: bypass the tool entirely and match directly via `execute_code` + sqlite3 — see `references/matching-fallback.md` for the complete manual matching procedure.

## Matching approach: prefer AI/vector over keyword counting

The naive keyword-overlap approach produces depression-inducing scores (20-55%) because:
- Many JD descriptions are truncated (`description_snippet`)
- ITviec hides location/salary behind login wall → `location=null` tanks score
- Generic DA titles match 1-2 keywords but miss domain alignment (finance/consolidation experience is a huge plus that keywords don't capture)

**Better: use `_call_ai_job_compare` from `api.routers.cv`** (already imported by the tool) which uses the LLM to consider domain experience, not just keyword presence. Or embed both CV + JD and use cosine similarity via the LLM.

## Quy trình mỗi tick

1. `GET /api/coach/dashboard?t={token}` → lấy:
   - `matches_top` — JD đã match với CV (7 ngày), kèm `match_score`, `missing` skills, `verdict`.
   - `lessons_backlog` — bài học chưa hoàn (ưu tiên cũ nhất).
   - `english_pending` — số mục tiếng Anh chưa làm.
   - `recent_reminders` — 5 nhắc gần nhất (để tránh lặp).
2. Chọn nội dung theo **khung giờ**:
   - **07h** (`morning`): mở ngày, chốt 1 JD top + hành động "cập nhật CV + gửi ứng tuyển hôm nay".
   - **12h** (`code`): luyện 25′ kỹ năng còn thiếu so với JD top, hoặc hoàn 1 lesson backlog.
   - **15h** (`english`): làm 5 mục pending hoặc dịch JD top sang Việt, ưu tiên IT vocab + câu phỏng vấn.
   - **18h** (`apply`): rà 2-3 JD ≥ 60% match chưa apply → ứng tuyển ngay.
   - **21h** (`review`): đếm JD đã apply + lesson đã hoàn hôm nay, đặt mục tiêu mai.
3. Soạn message tiếng Việt **≤ 5 dòng**, có:
   - 1 dòng tiêu đề kèm emoji.
   - 1-3 dòng dữ liệu cụ thể (tên JD, %, công ty, ID lesson).
   - 1 dòng `👉` hành động kế tiếp ≤ 12 từ.
4. **Lọc trùng**: nếu trùng với `recent_reminders[0].message` → trả `[SILENT]`.
5. `POST /api/coach/reminders` body `{"message":..., "kind": slot, "meta":{"source":"career-quest"}}`.

## Tiêu chí [SILENT]

- Cron chạy ngoài 07-22h.
- Không có lesson pending **và** không có JD ≥ 50% match trong 24h **và** không có english pending.
- Nội dung trùng nhắc gần nhất.

## User style: full pipeline, one shot, no permission pauses

When user says "bạn làm tất cả" or "just do it" / "tôi chỉ cần kết quả":
- Run the ENTIRE pipeline end-to-end without pausing for confirmation between steps.
- Do NOT ask "should I scrape first?" or "do you want me to match now?" — just execute sequentially.
- Use `todo` to track progress transparently so the user can see where you are.
- Deliver the final report directly.

## Provider resolution fallback: CV generation must match chat UI

**Pitfall**: `cv_generate.py` `_resolve_provider()` returns `effective_provider or "lmstudio"` — hardcoded LM Studio fallback. Chat UI defaults to `"cx"` (9router) from `localStorage.getItem('hagent_provider')`.

When building CV-generation workflows:
1. Always check `api/routers/cv_generate.py` line ~165 for the fallback string.
2. The fallback should be `"cx"` to match chat UI default, NOT `"lmstudio"`.
3. The provider resolution chain: explicit user param → `user.default_provider` → agent profile model → hard fallback.
4. Reference: `references/cv-generation-provider.md` for full provider resolution pattern.

## Ghi chú

- Tuyệt đối không nhắc chuyện ngoài mục tiêu xin việc (giải trí, tin tức, v.v.).
- Khi không có dữ liệu, gợi ý hành động dứt khoát thay vì im (vd: "chạy scrape JD ngay").
- Khung script vận hành mặc định: `scripts/career_coach.py --slot <slot>` (no_agent cron). Skill này dùng khi cron-LLM path sẵn sàng hoặc khi user gọi thủ công.
- **Overlap note**: skill `study-job-coach` (hagent) has near-identical scope with more detail for the cron path. If editing this skill, check that one too.
- **Reference file**: `references/jd-scraping-db-schema.md` — DB schema, location parsing, access patterns when module imports fail.
- **Reference file**: `references/matching-fallback.md` — When `job_hunter_match_new`/`top_matches` reports "Chưa có CV" due to DB path bug or user_token/user_id mismatch, run manual matching via Python directly.

### Preferences DB defaults

Backend `_empty_prefs()` returns these defaults for new users:
- `salary_min: 20_000_000` (20tr)
- `compressed_week: True` (nghỉ T7)
- `locations: []`, `target_companies: []`, `avoid_keywords: []`
- `work_modes: []`, `level: None`

The `/api/job-hunter/preferences` GET/PUT endpoints serve and persist these.
Table: `user_job_preferences` in `data/hagent.db`.

### When user corrects job preferences (THACO, target companies, etc.)

When the user says something like "X em không làm nữa" or "thêm Y vào danh sách":

1. **Update DB directly** (faster than PUT API for bulk edits):
   ```python
   import sqlite3, json
   conn = sqlite3.connect('/Users/nguyenhat/HAgent/data/hagent.db')
   row = conn.execute("SELECT target_companies FROM user_job_preferences WHERE user_id='hat'").fetchone()
   companies = json.loads(row['target_companies'] or '[]')
   # add/remove as requested
   conn.execute("UPDATE user_job_preferences SET target_companies=?, updated_at=CURRENT_TIMESTAMP WHERE user_id='hat'",
                (json.dumps(companies, ensure_ascii=False),))
   conn.commit()
   ```

2. **Reset target_roles + keywords** from wiki Career Goals if user changes direction.

3. **Update wiki** entries (Career Goals and CV wiki) to remove stale references: search wiki for the old company name and patch the markdown.

4. **Update memory** — but keep it short; the canonical config is in the DB + wiki.

5. **Verify** by calling `GET /api/job-hunter/preferences` or querying the DB directly.

### Initial tab visibility: JD must appear immediately

**Pitfall:** `JobHunter.jsx` defaults `filterTab` to `'matched'` (dòng 103). When the user has no CV uploaded or no automatic matching has run yet, `filteredTopMatches` is empty → only the "Khớp CV" tab renders, showing "Chưa có JD khớp" empty state. The actual cached jobs in DB are hidden behind the "Tất cả JD" tab.

**Fix (applied):**
1. Auto-fallback: when `loadJobs()` returns jobs and `filterTab === 'matched'`, switch to `'all'` so jobs render immediately.
2. Persist tab choice via `localStorage.setItem('job_hunter_filter_tab', tab)` so user preference survives page reload.
3. Seed `useState` from localStorage: `useState(localStorage.getItem('job_hunter_filter_tab') || 'matched')`.
4. Save tab on each user click to the tab buttons.

**Defense for future changes:** If adding new tabs or filtering logic, always check: does the initial empty state hide data the user expects to see? When in doubt, default to the tab that has data rather than the most specific filtered view.

### Frontend integration pitfalls

#### CRITICAL: Preference save payload mismatch between frontend and backend

When modifying `JobPreferencesPanel.jsx` or the backend `PreferencesBody` / `put_preferences`:
- **Backend model** (`PreferencesBody`, line 1141-1152 in `job_hunter.py`) defines ALL fields including `compressed_week` and `target_companies`.
- **Frontend PUT payload** (lines 127-137 in `JobPreferencesPanel.jsx`) MUST mirror the backend fields exactly.
- Currently the frontend omits `compressed_week` and `target_companies` even though the UI renders toggles/inputs for them. The backend defaults `compressed_week: True` and `target_companies: []` when omitted — so saving preferences **resets** these fields to defaults.
- If user complains "Nghỉ T7 / Công ty mục tiêu is not working after I save", this is the likely root cause.
- **Defense**: when modifying the backend `PreferencesBody`, always cross-check the frontend PUT body in `JobPreferencesPanel.jsx` lines 127-137. They must stay in sync.
- The same applies to the `_empty_prefs()` defaults in the backend (lines 43-56): they set `compressed_week: True` and `salary_min: 20_000_000` — but the frontend's loadJobs `/api/job-hunter/search` call uses `apply_prefs=true` which will apply those defaults. If the user has never saved preferences, the first `PUT /preferences` will write whatever the frontend sends, which may differ from `_empty_prefs()`.

### Reminders must come from dashboard, not raw API
- Frontend (JobHunter.jsx) MUST call `/api/coach/dashboard` and extract `recent_reminders` from the response — NOT call `/api/coach/reminders` directly.
- The dashboard endpoint already filters unsuitable JD (Laos, Cambodia, overseas) via `_looks_unsuitable_match`. The raw `/api/coach/reminders` endpoint does NOT.
- Filter reminders client-side to today only (`created_at.startsWith(today)`) to avoid showing stale cron output from previous days.

### Top JD display: always add client-side location filter
- Even though the backend filters unsuitable locations, the `cv_match_scores` table may contain old scores for JD that were later reclassified.
- Add a client-side useMemo filter: keep only matches where `location` contains `"hồ chí minh"`, `"tp hcm"`, or `"saigon"`.
- Also filter out matches where `salary_max > 0 && salary_max < 20_000_000` to hide low-salary lead-generation postings.
- The backend already sorts target companies (THACO, Vingroup, FPT, etc.) to the top via `company_score` in the search endpoint.

### Per-job delete button: frontend must match backend HTTP verb + route

The `topMatches` cards in `JobHunter.jsx` show "Mở JD" and "Đối chiếu" buttons. To add a delete button:

1. **Backend**: `DELETE /api/jobs` with `DeleteJobRequest(url: str)` → deletes row from `cached_jobs` + JSON cache file.
2. **Frontend**: call `fetch('/api/jobs', { method: 'DELETE', body: JSON.stringify({ url: match.job_url }) })` — NOT `POST /api/jobs/delete`.
3. **State**: add `deleting` state + filter `topMatches` after success.
4. **Placement**: insert 🗑️ button before "Đối chiếu" in the action row (line ~588 in JobHunter.jsx).

**Pitfall**: the backend endpoint is `@router.delete("/jobs")` not `@router.post("/jobs/delete")`. Always check the actual FastAPI decorator before writing the fetch call. A `POST` to a `DELETE` route returns 405 Method Not Allowed.

### UI: never let reminder display depend on a separate fetch
- If the cron job runs and creates a reminder, that reminder should appear only via the dashboard poll cycle.
- Do NOT add a separate `loadReminders()` callback that fetches `/api/coach/reminders` — it bypasses all filtering logic and will show stale/irrelevant data from previous days.
