# JD Scraping: DB Schema & Data Access

## DB location

`/Users/nguyenhat/HAgent/data/hagent.db`

Use this path only. Do not open or create `backend/data/hagent.db`.

## Fallback: when `job_hunter_search` tool fails

The tool fails with `AttributeError: 'Query' object has no attribute 'lower'` — a SQLAlchemy bug that prevents keyword search. Use raw `sqlite3` directly:

```bash
sqlite3 -header -column /Users/nguyenhat/HAgent/data/hagent.db "
SELECT url, title, company, salary, source, updated_at
FROM cached_jobs
WHERE (LOWER(title) LIKE '%data analyst%' OR LOWER(title) LIKE '%automation%' OR LOWER(title) LIKE '%financial%')
  AND LOWER(title) NOT LIKE '%junior%'
ORDER BY updated_at DESC
LIMIT 15;
"
```

Key points:
- Column is `updated_at` not `discovered_at` (scraper writes `created_at`/`updated_at`).
- `salary` is raw string; `salary_min`/`salary_max` are nullable ints (0 = hidden behind login wall).
- `skills` column is JSON array string `["Python","SQL","GO","R"]` — parse with `json.loads()`.
- ITviec JD often have `location = null` (login wall).
- Filter out `'junior'` or `'senior'` levels in WHERE as needed.
- Always ORDER BY `updated_at DESC` to see freshest results.

## Table: `cached_jobs`

### Columns

| Column | Type | Notes |
|---|---|---|
| `url` | TEXT | PK |
| `title` | TEXT | Job title |
| `company` | TEXT | Company name |
| `location` | TEXT | **CARE!** This field contains serialized data like `"Salary: From 20m ₫/month|Location: Ho Chi Minh|Posted day: 8/5/2026"` for VietnamWorks. ITviec often has `null`. Parse with: split on `|Location:` then split on `|` |
| `salary` | TEXT | Raw salary string |
| `salary_min` | INTEGER | In VND (nullable) |
| `salary_max` | INTEGER | In VND (nullable) |
| `source` | TEXT | `itviec`, `vietnamworks`, `careerviet`, etc. |
| `posted_date` | TEXT | Date string like `2026-05-25` |
| `skills` | TEXT | JSON array string like `["Python","GO","R"]` |
| `description_snippet` | TEXT | Truncated description |
| `created_at` | TEXT | ISO datetime of when the row was inserted |
| `updated_at` | TEXT | ISO datetime of last update |

**No `discovered_at` column** — use `updated_at` or `created_at`.

## Access patterns

### When Python module import fails (no .venv, wrong cwd)

Use `execute_code` with direct `sqlite3`:

```python
import sqlite3, datetime
conn = sqlite3.connect('/Users/nguyenhat/HAgent/data/hagent.db')
conn.row_factory = sqlite3.Row
cur = conn.cursor()
cur.execute("SELECT * FROM cached_jobs WHERE created_at >= ? ORDER BY salary_max DESC NULLS LAST", (cutoff,))
rows = cur.fetchall()
```

### Parsing location from the combined salary/location string

```python
def parse_location(loc_raw: str) -> str:
    if "|Location:" in (loc_raw or ""):
        return loc_raw.split("|Location:")[1].split("|")[0].strip()
    return loc_raw or ""

def is_in_hcm(loc_raw: str) -> bool:
    loc = parse_location(loc_raw).lower()
    return any(x in loc for x in ['hcm','saigon','ho chi minh','hồ chí minh','tp.hcm'])
```

## Known issues

- ITviec JD often have `location = null` even when the job is in HCM — the location data is hidden behind a login wall.
- `salary_min`/`salary_max` can be `0` for ITviec (needs login to view).
- `skills` column for ITviec shows weird values like `["GO","R"]` for DA roles — likely noise from the scraper.
- The `salary` field for VietnamWorks contains a full combined string: `"Salary: 25m-40m ₫/month|Location: Ha Noi|Posted day: 7/5/2026"`.
- `job_hunter_search` tool has a `Query.lower()` bug (SQLAlchemy) — drop to raw SQL when it fails.
