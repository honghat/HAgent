# Publishing a Finished Video to the Frontend

When a video is already produced (e.g. via `build_landscape.py` or `produce_video.py`) and you want to make it visible in HAgent's frontend VideoPage under "Kiếm Tiền", you must navigate **two parallel routers**.

## The Two Routers

| Router | Prefix | tasks.json Location | YouTube Publish | Frontend Endpoint |
|--------|--------|--------------------|-----------------|-------------------|
| `video.py` (legacy) | `/api/video` | `data/video/tasks.json` | ✅ Has YouTube OAuth + upload | Frontend calls `/api/video/tasks` |
| `make_video.py` (pipeline) | `/api/make-video` | `data/make-video/tasks.json` | ❌ No YouTube implementation | Not directly used by frontend |

## Rule

**Always import finished videos into the `/api/video` router.** The frontend `VideoPage.jsx` fetches from `GET /api/video/tasks`, and the YouTube publish button calls `POST /api/video/publish/{taskId}`. The `/api/make-video` router does NOT have YouTube credentials.

## Import Procedure

1. **Copy video** to the uploads directory:
   ```bash
   cp /path/to/final_video.mp4 /Users/nguyenhat/HAgent/data/uploads/uong-nuoc-du-final.mp4
   ```

2. **Insert task** into `data/video/tasks.json`. The task format requires these fields:
   ```json
   {
     "id": 999,
     "user_id": "hat",
     "title": "Uống bao nhiêu nước là đủ?",
     "source_type": "import",
     "source_ref": "/original/path/video.mp4",
     "source_lang": "vi",
     "status": "done",
     "progress": "[{\"t\": \"...\", \"m\": \"✅ Hoàn thành\"}]",
     "video_file": "uong-nuoc-du-final.mp4",
     "srt_file": null,
     "segments_count": 6,
     "duration": 50,
     "voice": "Nam Minh",
     "funny": false,
     "music": false,
     "yt_desc": "YouTube description text with SEO keywords...",
     "yt_tags": "tag1, tag2, tag3",
     "script": "Brief script summary",
     "pencil_scenes": null,
     "transitions": null,
     "error": null,
     "created_at": "2026-05-29T05:52:00",
     "updated_at": "2026-05-29T05:52:00"
   }
   ```

3. **Frontend video source**: The frontend resolves the video using `task.video_file ? /uploads/${task.video_file} : null`. Ensure the file is in `data/uploads/`.

4. **Frontend must be rebuilt** if changed:
   ```bash
   cd /Users/nguyenhat/HAgent/frontend && pnpm build
   ```

## Writing the YouTube Description

The description goes in `task.yt_desc`. Recommended structure (Vietnamese, SEO-friendly):

```
Bao nhiêu nước mỗi ngày là đủ? 🤔

{2-3 câu mở đầu thu hút}

💧 Nội dung chính 1
🌅 Nội dung chính 2
🏃 Nội dung chính 3
🫘 Nội dung chính 4

Kêu gọi hành động cuối video. Đừng quên like, share và subscribe! ❤️

#HashTag1 #HashTag2 #HashTag3
```

Tags: store as comma-separated string in `yt_tags`.

## Pitfalls

- **Router mismatch**: Importing into `/api/make-video`'s `tasks.json` will NOT show on frontend — it reads from `data/video/tasks.json`.
- **Absolute paths**: `video_file` must be just the filename, NOT an absolute path. The frontend prepends `/uploads/`.
- **YouTube credentials**: The `/api/video` router needs `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, and `YOUTUBE_REFRESH_TOKEN` in `backend/.env`. Without these, the YouTube button will show an error.
- **OAuth flow**: User clicks "Đăng YouTube" → if not authenticated, they're redirected to `/api/video/auth/youtube/login` which triggers Google OAuth. After granting, the refresh token is stored in `.env`.
- **id must be numeric**: The legacy router stores `id` as integers. New tasks should use a high number (e.g., 999) to avoid collision.
