# Backend API Operations for Video Pipeline

## Starting the Backend

The video pipeline runs as part of the FastAPI backend. Start it with:

```bash
cd /Users/nguyenhat/HAgent/backend
.venv/bin/python -m uvicorn api.main:app --host 0.0.0.0 --port 8778
```

The default API port in config is **8642** but development/testing uses **8778**.

## Health Check

```bash
curl -s http://localhost:8778/api/health
```

## Task Management

### Retry a failed task

```bash
curl -s -X POST http://localhost:8778/api/video/tasks/60/retry \
  -H "Content-Type: application/json"
```

Returns `{"ok":true}` if accepted. Performance:
- SRT is created at `data/uploads/subs-{task_id}.srt`
- Final video at `data/uploads/final-{task_id}.mp4`
- Cleanup temp files (vai-*.mp3) is automatic

### Check task status directly (DB)

```bash
cd /Users/nguyenhat/HAgent && python3 -c "
import sqlite3
db = sqlite3.connect('data/hagent.db')
row = db.execute(
    'SELECT id, status, progress, error, updated_at FROM video_tasks WHERE id=?',
    (TASK_ID,)
).fetchone()
print(row)
db.close()
"
```

### Reset a stuck queued task (if retry API is available, prefer it over DB reset)

```python
conn = sqlite3.connect('/Users/nguyenhat/HAgent/data/hagent.db')
conn.execute(
    "UPDATE video_tasks SET status='queued', progress='[]', error=NULL, updated_at=? WHERE id=?",
    (int(time.time() * 1000), TASK_ID)
)
conn.commit()
conn.close()
# Then call POST /api/video/tasks/{id}/retry to enqueue
```

## Upload Directory

All pipeline artifacts live under `/Users/nguyenhat/HAgent/data/uploads/`:
- `final-{id}.mp4` — completed dubbed video
- `subs-{id}.srt` — Vietnamese subtitles (SRT format)
- `ckpt-{id}.json` — pipeline checkpoint for resume
- `vai-*.mp3` — per-segment TTS audio files (cleaned up on success)
- `vai-*.mp4` — downloaded source video (cleaned up on success)
