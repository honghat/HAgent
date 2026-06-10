# Matching Fallback: When `job_hunter_match_new` Fails

## Root cause (two separate issues)

### Issue 1: DB path mismatch (previously documented)

Tools `job_hunter_match_new`, `job_hunter_top_matches`, and `job_hunter_my_cv` must use `api.services.db.get_connection()`, which resolves to the canonical app DB:

`/Users/nguyenhat/HAgent/data/hagent.db`

Do not use `backend/data/hagent.db` and do not create symlinks there. If a tool reports "Chưa có CV" while the DB has CV data, the fix belongs in the tool import/path logic, not in the filesystem.

### Issue 2: `user_token` vs `user_id` column mismatch

Even with the correct DB path, the `job_hunter_*` tools accept a `user_token` parameter but the DB schema uses `user_id`:

| Tool param | DB column |
|---|---|
| `user_token` | `cv_documents.user_id` |
| `user_token` | `cv_match_scores.user_id` |

The tool's internal SQL likely passes `user_token` as a column name filter, which fails because the column is named `user_id`. The error surfaces as "Chưa có CV" even when `SELECT * FROM cv_documents WHERE user_id='hat'` returns rows.

**Detection**: Run:
```python
import sqlite3
db = sqlite3.connect('/Users/nguyenhat/HAgent/data/hagent.db')
cur = db.execute("PRAGMA table_info(cv_documents)")
print(cur.fetchall())  # check column 1 name
```

**Workaround**: Bypass the tool entirely and match via direct SQL + Python (see Step 2 below). Do NOT try to fix the tools mid-session unless the user explicitly asks.

## Detection

```python
import sqlite3, os
db_path = '/Users/nguyenhat/HAgent/data/hagent.db'
print(db_path, os.path.getsize(db_path) if os.path.exists(db_path) else 'missing')
conn = sqlite3.connect(db_path)
print(conn.execute("select name from sqlite_master where type='table' order by name limit 10").fetchall())
conn.close()
```

## Step-by-step fallback procedure

### 1. Save CV to real DB first

If the user uploaded a CV file and tools report "Chưa có CV", use `execute_code`:

```python
import sqlite3, json, uuid
from datetime import datetime

db = sqlite3.connect('/Users/nguyenhat/HAgent/data/hagent.db')
# Check if CV already exists (maybe tool can't see it)
row = db.execute("SELECT id FROM cv_documents WHERE user_id='hat' ORDER BY created_at DESC LIMIT 1").fetchone()
if not row:
    # Insert CV text here (extracted from uploaded file or pasted text)
    db.execute("""
        INSERT INTO cv_documents (id, user_id, filename, file_path, content_type, extracted_text, result_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (str(uuid.uuid4()), 'hat', 'cv.docx', '/dev/null', 'application/octet-stream',
          cv_full_text, json.dumps({"name":"auto-import"}), datetime.utcnow().isoformat()))
    db.commit()
db.close()
```

### 2. Run matching manually

Use direct `execute_code` with sqlite3 — skip the tool entirely:

```python
import sqlite3, json
from datetime import datetime, timedelta

db_path = '/Users/nguyenhat/HAgent/data/hagent.db'
db = sqlite3.connect(db_path)
db.row_factory = sqlite3.Row

# Get CV
cv_row = db.execute("SELECT extracted_text FROM cv_documents WHERE user_id='hat' ORDER BY created_at DESC LIMIT 1").fetchone()
cv_text = cv_row['extracted_text'] or ''

# Get recent JDs
cutoff = (datetime.utcnow() - timedelta(hours=168)).isoformat()
jds = db.execute("""
    SELECT url, title, company, description_snippet, location, salary_min, salary_max, source
    FROM cached_jobs WHERE updated_at >= ? ORDER BY updated_at DESC LIMIT 100
""", (cutoff,)).fetchall()

# Use AI-based comparison if LLM available:
# from api.routers.cv import _call_ai_job_compare, _fallback_job_compare

# Heuristic fallback (simple, scores 20-55% — use only if LLM unavailable)
def heuristic_match(cv_text, jd_row):
    cv_lower = cv_text.lower()
    combined = ' '.join([(jd_row['title'] or ''), (jd_row['company'] or ''), (jd_row['description_snippet'] or '')]).lower()
    skills_cv = {'sql','python','power bi','excel','vba','pandas','data analysis','data analyst',
                 'reporting','automation','bi','finance','financial','dashboard',
                 'business intelligence','rag','langchain','data quality'}
    matched = [s for s in skills_cv if s in combined]
    loc_bonus = 8 if any(x in (jd_row['location'] or '').lower() for x in ['hcm','hồ chí minh','saigon']) else 0
    target_cos = ['pvcombank','vndirect','mb bank','deliveree','tiki','roosterx','viettel','vingroup','fpt','masan','techcombank']
    co_bonus = 15 if any(tc in (jd_row['company'] or '').lower() for tc in target_cos) else 0
    salary_bonus = 0
    if jd_row['salary_max'] and jd_row['salary_max'] > 0:
        smax = float(jd_row['salary_max'])
        if smax >= 25000000: salary_bonus = 12
        elif smax >= 20000000: salary_bonus = 8
        elif smax >= 15000000: salary_bonus = 4
    score = min(98, len(matched) * 7 + loc_bonus + co_bonus + salary_bonus)
    verdict = 'Nên ứng tuyển' if score >= 75 else 'Khá phù hợp' if score >= 55 else 'Có thể xem xét'
    return {'match_score': score, 'matched': matched[:8], 'verdict': verdict}

# Score + sort
results = []
for jd in jds:
    m = heuristic_match(cv_text, jd)
    results.append((m['match_score'], jd, m['matched'], m['verdict']))
results.sort(key=lambda x: -x[0])

# Save scores
now = datetime.utcnow().isoformat()
db.execute("DELETE FROM cv_match_scores WHERE user_id='hat'")
for score, jd, ms, verdict in results[:50]:
    db.execute("INSERT INTO cv_match_scores (user_id, job_url, match_score, verdict, matched_json, updated_at) VALUES (?,?,?,?,?,?)",
               ('hat', jd['url'], score, verdict, json.dumps(ms), now))
db.commit()

# Filter for HCM + target companies
hcm_scores = [(s, jd, ms, v) for s, jd, ms, v in results
              if any(x in (jd['location'] or '').lower() for x in ['hcm','hồ chí minh','saigon'])
              or any(tc in (jd['company'] or '').lower() for tc in target_cos)]
hcm_scores.sort(key=lambda x: -x[0])

print(f'Top HCM matches: {len(hcm_scores)} found')
for score, jd, ms, verdict in hcm_scores[:10]:
    print(f'  [{score}%] {jd["company"]} | {jd["title"]}')

db.close()
```

### 3. Alternative: call backend API directly (bypass tools)

```bash
curl -s -X POST http://localhost:8000/cv/upload -F 'file=@cv.docx' -F 'user_token=hat' | python3 -m json.tool
curl -s -X POST http://localhost:8000/cv/compare-job -H 'Content-Type: application/json' \
  -d '{"job_url":"https://...","job_title":"Data Analyst","job_company":"Company","job_description":"...","job_location":"HCM"}' \
  | python3 -m json.tool
```

## Verification

After saving scores:
```python
# Verify match_scores are in DB
conn = sqlite3.connect('/Users/nguyenhat/HAgent/data/hagent.db')
conn.row_factory = sqlite3.Row
rows = conn.execute("SELECT * FROM cv_match_scores WHERE user_id='hat' ORDER BY match_score DESC LIMIT 3").fetchall()
for r in rows: print(f'{r["match_score"]}% | {r["verdict"]} | {r["job_url"][:60]}')
```
