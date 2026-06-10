# CV Missing Fallback Flow for Job Hunter

When `job_hunter_match_new` is called but no CV exists in `cv_documents`, the tool should not fail silently. Instead, it must:

## Expected Behavior

1. **Detect missing CV**:
   ```sql
   SELECT COUNT(*) FROM cv_documents WHERE user_id = 'hat'
   ```
   → returns 0

2. **Graceful fallback options**:
   - ✅ Option A: Return list of top JDs (raw, un-scored) with message:  
     `"No CV found. Showing top 10 JDs matching keyword 'phân tích tài chính'."`
   - ✅ Option B: Prompt user:  
     `"Upload CV first? (Y/n) — or run job_hunter_search(keyword='...') to browse."`

3. **Manual query pattern** (used in session):
   ```python
   # Direct SQLite query for JDs without CV dependency
   rows = conn.execute("""
       SELECT url, title, company, location, salary, posted_date, source
       FROM cached_jobs
       WHERE LOWER(title) LIKE '%phân tích%' OR LOWER(description_snippet) LIKE '%tài chính%'
       ORDER BY posted_date DESC
       LIMIT 10
   """).fetchall()
   ```

## Implementation Guide

- In `job_hunter_match_new`, add:
  ```python
  if not cv_text:
      if user_wants_raw_jds:
          return _json({"raw_jds": top_10_jds, "message": "No CV — showing raw JDs."})
      else:
          return _json({"error": "Upload CV first via Săn việc tab."})
  ```

- Add a new helper: `job_hunter_list_jds(keyword: str, limit: int = 10)` that bypasses CV check entirely.

> This avoids blocking the user’s job search flow when CV is missing.