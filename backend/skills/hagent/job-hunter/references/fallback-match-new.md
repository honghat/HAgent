# Fallback Implementation for `job_hunter_match_new` when `jobs/` is missing

Khi thư mục `jobs/` không tồn tại (ví dụ: `ls jobs/` → `No such file or directory`), hàm `job_hunter_match_new` sẽ không chạy được vì phụ thuộc vào `jobs.job_hunt_runner._match_new_jobs`.

## Giải pháp: Viết lại `_match_new_jobs_fallback` trong `tools/job_hunter_tool.py`

### Bước 1: Thêm hàm dưới `_fallback_job_compare`

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

### Bước 2: Cập nhật `job_hunter_match_new` (dòng 235–243)

Thay thế:
```python
summary = _match_new_jobs(user_id, cv_text, recent_hours=max(1, min(168, int(recent_hours or 36))))
```

Bằng:
```python
try:
    from jobs.job_hunt_runner import _match_new_jobs
    summary = _match_new_jobs(user_id, cv_text, recent_hours=max(1, min(168, int(recent_hours or 36))))
except ImportError:
    summary = _match_new_jobs_fallback(user_id, cv_text, recent_hours=max(1, min(168, int(recent_hours or 36))))
```

### Bước 3: Kiểm tra sau khi chạy

Sau khi gọi `job_hunter_match_new`, kiểm tra:
```sql
SELECT COUNT(*) FROM cv_match_scores WHERE user_id = 'hat';
```
Nếu > 0 → thành công.

> 💡 Gợi ý: Bạn có thể lưu script này vào `scripts/fix-job-hunter-match.py` để chạy tự động khi cần khôi phục nhanh.