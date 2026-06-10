# Video Dubbing — Architecture & Troubleshooting

## Frontend

- Tab "Video" in `EarningHub.jsx` → renders `VideoPage.jsx` (lazy-loaded)
- 3 views: `list` (history), `new` (create task), `detail` (progress + playback + publish)
- API base: `GET /api/video/tasks`, `POST /api/video/tasks/url`, `POST /api/video/tasks/upload`, `GET /api/video/tasks/{id}`, `DELETE /api/video/tasks/{id}`, `POST /api/video/tasks/{id}/retry`
- Real-time: `EventSource` at `/api/video/tasks/{id}/progress?t={token}`
- Publish to YouTube: `POST /api/video/publish/{id}` with `{platform: "youtube"}`

## Backend API Router

`backend/api/routers/video.py` (~432 lines)

- Uses SQLite table `video_tasks` via `api.services.db.get_connection()`
- Task creation: `_create_task_in_db()` → insert + `_enqueue_task(task_id)`
- Upload flow: saves to `data/uploads/` with uuid prefix

## Pipeline

`backend/api/services/video_pipeline.py` (~943 lines)

Full flow: download → STT → translate → TTS → mux → burn subtitles

Checkpoint/resume system: saves intermediate state to `data/uploads/ckpt-{task_id}.json`

### ⚠️ Critical: Silent Worker Failure

`import edge_tts` at module top-level (line 21) means **any missing dependency crashes the whole module**. The task gets DB status `queued` but the worker never fires because `VideoQueue._pump` can't even start — no error is logged to the task.

**Diagnosis:**
```
# Check if task is stuck queued
SELECT id, title, status, error FROM video_tasks WHERE status='queued';

# Verify all imports succeed
python3 -c "import edge_tts, groq, httpx, sse_starlette"
```

**Fix:**
```
pip install edge-tts groq httpx sse-starlette
```

### Required Env Vars

- `GROQ_API_KEY` — for STT (whisper-large-v3), translation (llama-3.3-70b), and video meta generation
- `YOUTUBE_CLIENT_ID` + `YOUTUBE_CLIENT_SECRET` + `YOUTUBE_REFRESH_TOKEN` — for YouTube upload

## ⚠️ Failure Mode: Backend Not Running (No Worker Process)

Even with all dependencies installed and DB correct, a task stuck at `queued` can simply mean **the backend FastAPI server (uvicorn) is not running**.

- `VideoQueue` is an **in-memory** `asyncio.Queue` declared in `video_pipeline.py`
- There is **no persistent worker** — no background thread, no cron job, no startup migration handler that re-processes old `queued` tasks
- When backend restarts, any task that was in the queue is lost. Tasks whose DB status is `queued` from a previous session stay stuck until a new `POST /api/video/tasks/url` (or retry) re-enqueues them

**Diagnosis:**
```bash
# Check if backend is running
ps aux | grep uvicorn | grep -v grep

# Check which DB file the backend would connect to
cd backend && .venv/bin/python -c "
from api.services.db import get_connection
conn = get_connection()
for r in conn.execute('PRAGMA database_list'):
    print('DB:', r[2])
conn.close()
"
```

**Fix:** Start the backend:
```bash
cd backend && .venv/bin/uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```
Or via the frontend's integrated run command.

**For stuck tasks after restart:** use the retry endpoint (`POST /api/video/tasks/{id}/retry`) to re-enqueue.

### Known Working Tasks (from production DB)

| id | source | status | duration | segments |
|----|--------|--------|----------|----------|
| 42 | Bilibili | done | 2:38 | 79 |
| 41 | Bilibili | done | 7:34 | 224 |
| 40 | Bilibili | done | 7:13 | 204 |
| 39 | Bilibili | done | 5:25 | 161 |
