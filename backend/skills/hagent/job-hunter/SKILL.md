---
name: job-hunter
description: Điều khiển toàn bộ luồng săn việc từ agent chat. Cào JD, lưu DB, match CV, báo top JD phù hợp — tất cả qua tool, không chỉ hướng người dùng sang tab Săn việc.
---

# Job Hunter — Controlled From Chat

Khi người dùng yêu cầu săn việc / cào JD / match CV, thực thi bằng tool, không chỉ hướng họ sang tab UI.

## Nguồn dữ liệu và cấu trúc JD

Scrape qua `api/routers/job_hunter.py` chia làm 3 loại source:

| Loại | Nguồn | Cơ chế | Description có? |
|------|-------|--------|-----------------|
| CSS-selector | ITViec, CareerLink, CareerViet | Playwright query CSS selectors | ❌ Không có trong card list |
| text_based | VietnamWorks | Parse `inner_text()` heuristic | ❌ Không có trong card list |
| API | TopDev | REST API `fields[job]=...,responsibilities_original,requirements_original` | ✅ Có (topdev_desc từ API) |

**Quan trọng:** Các nguồn VN (ITViec, CareerViet, CareerLink, VietnamWorks) **không hiển thị mô tả JD trên trang danh sách card** — chỉ có title + company + salary + location + skills tags. Description thực sự chỉ có trên trang chi tiết JD (cần navigate vào từng trang, chậm). TopDev là ngoại lệ vì có REST API trả về `responsibilities_original`.

### Fallback description_snippet trong backend

Khi `description_snippet` rỗng, code backend `api/routers/job_hunter.py` dòng 920-940 fallback:
1. Lọc dòng card text >15 ký tự hoặc chứa skill keyword (Python, SQL, Go, Java...)
2. Nếu không có, join các segments medium-length
3. Kết quả thường là title/company (không phải mô tả thật)

### Fallback description trên frontend

Frontend `JobHunter.jsx` `getDescription()` fallback khi `description_snippet` rỗng/short:
```
🏢 {company} | 💰 {salary} | 🛠️ Kỹ năng: {skills.join(', ')}
```

## Luồng xử lý mô tả JD khi dùng tool chain

Khi dùng `job_hunter_scrape` → gọi API `/api/job-hunter/scrape`:
- Browser-based sources (itviec, vietnamworks, careerlink, careerviet): dùng Playwright shared browser, semaphore 4
## Luồng xử lý mô tả JD khi dùng tool chain

Khi dùng `job_hunter_scrape` → gọi API `/api/job-hunter/scrape`:
- Browser-based sources (itviec, vietnamworks, careerlink, careerviet): dùng Playwright shared browser, semaphore 4
- API-based (topdev): gọi REST trực tiếp, không cần browser
- Kết quả dedup bằng URL, merge với cache 3 ngày, lưu cả JSON cache lẫn SQLite `cached_jobs`

## Prompt (injected vào agent system prompt)

Khi người dùng yêu cầu săn việc / cào JD / match CV:
- Điều khiển toàn bộ từ agent chat hiện tại bằng tool `job_hunter_*`; không chỉ bảo người dùng mở tab Săn việc.
- Nếu cần lấy JD mới, gọi **`job_hunter_scrape`**. Kết quả cào phải được lưu vào DB canonical `data/hagent.db`, bảng `cached_jobs`, trước khi báo xong.
- Sau khi cào JD, gọi **`job_hunter_match_new`** để chấm CV theo nhu cầu cá nhân, rồi **`job_hunter_top_matches`** để lấy top JD.
- Báo ngắn gọn: số JD quét được, số JD mới, số JD đã xác nhận lưu DB, và 3 JD phù hợp nhất kèm lý do/gap.
- Nếu chưa có CV, nói rõ cần upload CV trước rồi vẫn có thể cào/lưu JD vào DB.

## Intent detection (backend)

Backend `source_core_agent.py` tự động detect intent săn việc qua regex:
```python
JOB_HUNTER_INTENT_RE = re.compile(
    r"(săn\s*việc|san\s*viec|việc\s*làm|viec\s*lam|job\s*hunt|job\s*hunter|"
    r"\bjd\b|cào\s*job|cao\s*job|cào\s*jd|cao\s*jd|tìm\s*job|tim\s*job|"
    r"match\s*cv|đối\s*chiếu\s*jd|doi\s*chieu\s*jd|ứng\s*tuyển|ung\s*tuyen)",
    re.IGNORECASE,
)
```
Khi intent phát hiện, backend tự inject prompt trên + thêm toolset `job_hunter`. Agent chỉ cần follow prompt.

## Tool chain thực tế (cập nhật 2026-05-31)

✅ Các tool sau **đã hoạt động**:
- `job_hunter_scrape`: gọi từ `tools/job_hunter_tool.py`, sử dụng `api.routers.job_hunter.ScrapeRequest`
- `job_hunter_match_new`: gọi `_match_new_jobs` từ `jobs/job_hunt_runner.py` — **nhưng file này có thể bị thiếu**
- `job_hunter_top_matches`: truy vấn trực tiếp DB `cv_match_scores` + `cached_jobs`

⚠️ **Pitfall quan trọng**:  
Nếu thư mục `jobs/` không tồn tại (ví dụ: `ls jobs/` → `No such file or directory`), thì `job_hunter_match_new` sẽ **không tạo được điểm match**, dẫn đến `cv_match_scores` trống → `job_hunter_top_matches` trả về rỗng dù có JD.

### Fallback implementation for `match_new` when `jobs/` is missing

Khi `jobs/job_hunt_runner.py` không tồn tại, bạn có thể viết lại `_match_new_jobs` đơn giản như sau (đặt trong `tools/job_hunter_tool.py` dưới hàm `_fallback_job_compare`):

```python
def _match_new_jobs_fallback(user_id: str, cv_text: str, recent_hours: int = 36) -> dict:
    """Fallback match: loop through cached_jobs and call _fallback_job_compare for each."""
    from datetime import datetime, timedelta
    cutoff = (datetime.now() - timedelta(hours=recent_hours)).isoformat()
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT url, title, company, description_snippet, skills, source, posted_date
            FROM cached_jobs
            WHERE updated_at >= ?
            ORDER BY updated_at DESC
            """,
            (cutoff,),
        ).fetchall()
    
    matches = []
    for row in rows:
        job = dict(row)
        job["skills"] = json.loads(job.get("skills") or "[]")
        try:
            result = _fallback_job_compare(cv_text, CVJobCompareBody(**job), None)
            score = result.get("match_score", 0)
            matches.append({
                "job_url": job["url"],
                "match_score": score,
                "verdict": result.get("verdict", ""),
                "matched_json": json.dumps(result.get("matched", []), ensure_ascii=False),
                "missing_json": json.dumps(result.get("missing", []), ensure_ascii=False),
                "updated_at": datetime.now().isoformat(),
            })
        except Exception as e:
            continue  # bỏ qua job lỗi

    # Lưu vào cv_match_scores
    with get_connection() as conn:
        for m in matches:
            conn.execute(
                """
                INSERT OR REPLACE INTO cv_match_scores
                (user_id, job_url, match_score, verdict, matched_json, missing_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, m["job_url"], m["match_score"], m["verdict"],
                 m["matched_json"], m["missing_json"], m["updated_at"]),
            )
    
    top = sorted(matches, key=lambda x: x["match_score"], reverse=True)[:10]
    return {"count": len(matches), "top": top}
```

Sau đó, trong `job_hunter_match_new`, thay thế:
```python
summary = _match_new_jobs(user_id, cv_text, recent_hours=...)
```
bằng:
```python
try:
    from jobs.job_hunt_runner import _match_new_jobs
    summary = _match_new_jobs(user_id, cv_text, recent_hours=...)
except ImportError:
    summary = _match_new_jobs_fallback(user_id, cv_text, recent_hours=...)
```

## Báo cáo kết quả

- **LUÔN ĐỌC CV TRƯỚC**: Khi người dùng yêu cầu match JD, **PHẢI đọc file CV** (hoặc hỏi tóm tắt kinh nghiệm/skill nếu chưa có CV). Không skip bước này — dẫn đến match sai profile.
- Báo ngắn gọn: số JD quét được, số JD mới lưu DB, và 3 JD phù hợp nhất kèm lý do.
- Trước khi gọi `job_hunter_top_matches`, luôn kiểm tra:  
  ```sql
  SELECT COUNT(*) FROM cv_match_scores WHERE user_id = 'hat';
  ```
  Nếu = 0 → thông báo: *"Chưa có điểm match — gọi `job_hunter_match_new` trước"*.

## User Filtering Preferences (cập nhật)

Khi người dùng yêu cầu săn việc, **KHUẤT BẮT XÁC NHẬN** các filters sau để filter JD đúng:

```yaml
location: null  # HCM/Hà Nội/Remote - user có thể chỉ nói "làm tại HCM"
salary_min: 30000000  # 30 triệu = ngưỡng phổ biến cho profile trung cấp+
experience_years: null  # Seniority level (new grad / mid / senior)
company_type: null  # Ngân hàng / Tech / FMCG / Manufacturing / Big 4
```

**Pitfall**: Hệ thống search `job_hunter_search` không support filter theo salary/location trong DB hiện tại — cần dùng `job_hunter_match_new` + manual filter kết quả, hoặc web_search trực tiếp.

## Pitfalls (cập nhật)

- **`cv_match_scores` trống dù có JD**: Nguyên nhân phổ biến là `jobs/job_hunt_runner.py` bị mất → `match-new` không chạy. Giải pháp: dùng fallback implementation trên, hoặc khôi phục file từ git.
- **Source file missing (cũ)**: `api/routers/job_hunter.py` đã được khôi phục — hiện tại tool hoạt động. Không còn cảnh báo "tool không tồn tại".
- **Field name mismatch Frontend ↔ Backend**: API `/api/job-hunter/search` trả về `description_snippet`, nhưng `JobCard.jsx` (dòng 23) đọc `job.snippet` — field không tồn tại. Luôn kiểm tra + console.log(data.jobs[0]) API response trước khi sửa hiển thị, đối chiếu key names thực tế.
- **TopDev API rate limit**: gọi trực tiếp, không cần browser. Field `responsibilities_original` và `requirements_original` chứa HTML, cần strip tag.
- **Skills GO/R xuất hiện trong hầu hết JD** do site inject tag giả — đây là noise đã biết, không phải real skill.
- **VietnamWorks text_based**: parse bằng heuristic lines order, dễ sai khi card layout thay đổi.
- **Dev server khác build server**: `frontend/` dùng Vite (port 3004), không phải webpack. Không gọi `npx webpack` — restart Vite dev server (`pnpm dev`) là đủ. File `dist/` là project admin dashboard riêng (webpack), không liên quan.
- **Playwright version mismatch**: `job_hunter_scrape` có thể fail với lỗi `Executable doesn't exist at .../chromium_headless_shell-XXXX/...` khi Playwright package được update nhưng browser binaries chưa tải về. **Fix:** `pip3 install --upgrade playwright` → `python3 -m playwright install chromium`. Browser binaries nằm ở `/Users/nguyenhat/Library/Caches/ms-playwright/` — version phải khớp giữa package và cache.
- **CV reading requirement**: Phải extract CV text từ file/doc trước khi gọi `match_new`. Nếu user chưa upload, hỏi tóm tắt kinh nghiệm (skills, năm làm, vị trí cuối). See `references/cv-reading-workflow.md` for detailed workflow.
