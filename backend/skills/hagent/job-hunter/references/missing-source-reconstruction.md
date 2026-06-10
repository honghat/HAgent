# Job Hunter — Missing Source Reconstruction Notes

## Status (2026-05-31)
- `api/routers/job_hunter.py`: **DELETED** — only `__pycache__/job_hunter.cpython-311.pyc` remains
- `api/routers/__pycache__/agent_job_hunter.cpython-311.pyc` also exists — may have been a companion router
- Tool `job_hunter_scrape`: **DOES NOT EXIST** in available tools list

## What we know from skill memory and pyc inspection

### Sources (from skill MD)
| Loại | Nguồn | Cơ chế |
|------|-------|--------|
| CSS-selector | ITViec, CareerLink, CareerViet | Playwright query CSS selectors |
| text_based | VietnamWorks | Parse `inner_text()` heuristic |
| API | TopDev | REST API with responsibilities/requirements |

### Expected API endpoints (port 8010)
- `POST /api/job-hunter/scrape` — cào JD, lưu `cached_jobs` table
- `/api/job-hunter/search` — tìm kiếm JD (trả `description_snippet` field)
- `/api/job-hunter/match` — match CV
- `/api/job-hunter/top-matches` — top JD phù hợp

### DB schema
- Table: `cached_jobs` in `data/hagent.db`
- Fields include: `description_snippet`, `url`, `title`, `company`, `salary`, `location`, `skills`

**Quan trọng — Database Path Best Practice (2026-06-01):**  
job_hunter_tools phải mở đúng DB path `<repo_root>/data/hagent.db` (thường ~12MB).  
Nếu code dùng hardcoded `backend/data/hagent.db` → thường là 0-byte file, gây lỗi `'no such table: cached_jobs'`.  
**Fix:** Kiểm tra `ls -la backend/data/` trước khi chạy. Nếu 0-byte → cần xác nhận với user hoặc fallback sang DB chính tại `<repo_root>/data/hagent.db`.

### Backend file references from .pyc
- Line 920-940: fallback `description_snippet` logic (filter card text >15 chars, skill keywords)
- Dedup by URL, merge with 3-day cache, store both JSON cache and SQLite

### Frontend
- `JobHunter.jsx` — has `getDescription()` fallback
- `JobCard.jsx` line 23: reads `job.snippet` (field name mismatch with API's `description_snippet`)
