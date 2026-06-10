---
name: video-dubbing
description: Tự động dịch và lồng tiếng Việt cho video từ YouTube, Bilibili, Douyin hoặc file upload bằng công cụ dub_video.
---

# 🎬 Tự động Dịch và Lồng tiếng Video

Kỹ năng này cho phép Agent lồng tiếng Việt cho các video từ YouTube, Bilibili, Douyin hoặc file upload bằng cách sử dụng công cụ `dub_video`.

## 🛠 Cách sử dụng

Khi người dùng cung cấp một URL video (hoặc yêu cầu lồng tiếng cho video vừa upload), hãy thực hiện các bước sau:

1.  **Phân tích URL:** Xác định nền tảng (YouTube, Bilibili, Douyin).
2.  **Lựa chọn Giọng đọc:** 
    *   Sử dụng `hoaimy` (nữ) nếu không có yêu cầu đặc biệt.
    *   Sử dụng `namminh` (nam) nếu người dùng yêu cầu giọng nam.
3.  **Kích hoạt Tool:** Gọi công cụ `dub_video` với URL và giọng đọc tương ứng.
4.  **Thông báo:** Sau khi gọi tool, hãy thông báo cho người dùng rằng tác vụ đã được tạo và họ có thể theo dõi tiến trình trong tab **Video**.

## 📝 Ví dụ câu lệnh

- "Lồng tiếng cho video YouTube này giúp mình: https://www.youtube.com/watch?v=..."
- "Dịch và lồng tiếng Việt cho video Bilibili này bằng giọng nam nhé."

## ⚠️ Lưu ý

- Công cụ này hỗ trợ lồng tiếng AI với chất lượng cao.
- Quá trình xử lý video (tải về, dịch sub, lồng tiếng) có thể mất vài phút tùy thuộc vào độ dài video.
- Agent không cần phải chờ video xử lý xong, chỉ cần xác nhận tác vụ đã được đưa vào hàng đợi.

## ⚠️ Pitfall: TTS (edge-tts) tuần tự — pipeline die ở ~20/85 câu

`_run_pipeline` gọi `edge_tts.Communicate().save()` cho từng segment **tuần tự** (85 iterations). API cloud edge-tts có thể timeout/exception giữa chừng, và 1 lỗi sẽ giết cả pipeline.

**Dấu hiệu:** Progress có `🔊 Giọng đọc 20/85` rồi im. Task stuck `queued`, không có error.

**Fix tạm:** Retry task #60 qua `POST /api/video/tasks/60/retry`. Nếu lỗi vẫn tái diễn, cần sửa code:

```python
# Hiện tại (sequential — vỡ):
for i, s in enumerate(segments):
    vi_text = s.get("vi", "") or ""
    tts_path = await _tts_vietnamese(vi_text, tts_voice)

# Fix: Concurrency với semaphore + catch lỗi từng câu
sem = asyncio.Semaphore(5)
async def _tts_one(s):
    vi = s.get("vi") or ""
    if not vi.strip():
        return None
    async with sem:
        try:
            return await _tts_vietnamese(vi, tts_voice)
        except Exception:
            return None
tts_paths = await asyncio.gather(*[_tts_one(s) for s in segments])
for s, p in zip(segments, tts_paths):
    if p: s["tts_path"] = p
```

## ⚠️ Pitfall: `ffmpeg exit 234` — mov_text + ASS codec incompatibility

**Hiện tượng:** Pipeline gần xong (đã có `final-60.mp4`?, `subs-60.srt`), progress hiển thị "🖌 Ghép clip TTS...", sau đó task chuyển sang `error` với message `ffmpeg lỗi exit 234` kèm stderr chứa `[aac @ ...] Qavg: 65278.215` và `Conversion failed!`.

**Nguyên nhân gốc:** Dòng 684-697 của `video_pipeline.py` dùng:
```
-i ass_path, -map 2, -c:s mov_text
```
Input là ASS (Advanced SubStation Alpha) nhưng `-c:s mov_text` chỉ support SRT format. MP4 container không thể encode ASS sang mov_text → ffmpeg crash với exit 234.

**Dấu hiệu nhận biết:**
- Error message chứa `ffmpeg lỗi exit 234`
- Đã tồn tại `subs-{task_id}.srt` trong `data/uploads/`
- Có thể đã có `final-{task_id}.mp4` nhưng file 0 byte hoặc rất nhỏ

**Fix đã áp dụng (tháng 5/2026 — bản fix cuối, 27/5):** Fallback mechanism với try/except:

**Vấn đề với fix cũ:** Fallback code dùng `os.path.exists()` và `os.path.getsize()` KIỂM TRA SAU khi `_run_ffmpeg` đã chạy. Nhưng `_run_ffmpeg` dùng `subprocess.run(check=True)` — nó raise `CalledProcessError` trước khi code chạm tới dòng kiểm tra. Fallback không bao giờ được thực thi.

**Fix đúng:** Wrap ffmpeg ASS+mov_text trong `try/except`:

```python
# Video pipeline lines 684-709 (video_pipeline.py)
srt_path_fallback = str(UPLOAD_DIR / f"subs-{task_id}.srt")

# Try ASS + mov_text first; fallback to burn SRT on failure
try:
    _run_ffmpeg(
        "-y", "-i", video_path,
        "-i", stretched,
        "-i", ass_path,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-map", "2",
        "-c:s", "mov_text",
        "-metadata:s:s:0", "language=vie",
        final_output, timeout=600,
    )
except Exception:
    send("⚠️ ASS+mov_text thất bại, thử burn SRT...")
# Fallback: nếu output không tồn tại hoặc quá nhỏ, thử burn SRT
if not os.path.exists(final_output) or os.path.getsize(final_output) < 1000:
    _run_ffmpeg(
        "-y", "-i", video_path,
        "-i", stretched,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-vf", f"subtitles={srt_path_fallback}",
        final_output, timeout=600,
    )
```

**Cách retry task bị lỗi:** `POST /api/video/tasks/{id}/retry` — pipeline sẽ chạy lại từ đầu.

**Phòng ngừa khi sửa code:**
- Luôn dùng `try/except` cho `_run_ffmpeg` khi có fallback plan — đừng dựa vào post-hoc file-exists check vì exception chặn mọi code sau nó.
- Nếu muốn giữ ASS style (màu vàng, border), dùng `-c:s ass` thay vì `-c:s mov_text`.
- Hoặc luôn dùng `-vf subtitles=` với SRT — an toàn hơn nhưng không có style.

## ⚠️ Pitfall: Database path — canonical `hagent.db`

Chỉ dùng DB thật ở project root:
- `data/hagent.db` (project root) — DB thật
- `backend/data/hagent.db` — đường dẫn bị chặn, không được mở hoặc tạo lại

`get_connection()` từ `api/services/db.py` dùng đúng (root `/Users/nguyenhat/HAgent/data/hagent.db`). Khi debug trực tiếp bằng sqlite3, nhớ dùng `'/Users/nguyenhat/HAgent/data/hagent.db'`.

## ⚠️ Pitfall: FOREIGN KEY constraint failed — `user_id="user"` hardcoded

**Hiện tượng:** Backend trả 500 khi tạo task video (POST /api/video/tasks/url). Lỗi: `FOREIGN KEY constraint failed`.

**Nguyên nhân gốc:** `_create_task_in_db` trong `api/routers/video.py` dòng 120 hardcode `user_id="user"`. DB thực tế có `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE` và `get_connection()` bật `PRAGMA foreign_keys=ON` (dòng 19 `api/services/db.py`). User ID thật là UUID, không phải string `"user"`.

**Fix:**
1. Thêm `user_id` param vào `_create_task_in_db`
2. Endpoint gọi `uid = _get_user_id(request)` và truyền vào

**Cách phòng ngừa:** Khi code INSERT vào bảng có FOREIGN KEY, luôn dùng giá trị từ auth request thay vì hardcode. DB schema thực tế (đã migrate) có thể khác với schema trong `api/services/db.py`.

## ⚠️ Pitfall: Task stuck ở trạng thái `queued` không log lỗi

Nếu task vẫn `queued` sau vài giây và không có progress log nào, có 3 nguyên nhân chính:

## ⚠️ Pitfall: Worker silent crash — thiếu Python dependencies

`video_pipeline.py` import `edge_tts`, `groq`, `httpx`, `sse_starlette` ở module top-level. Nếu thiếu bất kỳ cái nào, toàn bộ module không load được → worker không chạy → DB status vẫn `queued` (không có error).

**Cách kiểm tra:**
```bash
.venv/bin/python -c "import edge_tts, groq, httpx, sse_starlette"
```
**Sửa:**
```bash
.venv/bin/python -m pip install edge-tts groq httpx sse-starlette
```

### 🅱 Backend không chạy — Server process đã tắt

`VideoQueue` là in-memory async queue — **không có persistent worker**. Khi backend restart, các task `queued` cũ không được xử lý lại.

**Cách kiểm tra:**
```bash
ps aux | grep uvicorn | grep -v grep
```
**Sửa:** Start backend server, sau đó gọi `POST /api/video/tasks/{id}/retry` để enqueue lại task vào `VideoQueue` (vì queue là in-memory, REST API retry là cách duy nhất để kick worker).

### 🅲 Backend restart làm mất in-memory queue — cần retry thủ công

Ngay cả khi backend chạy, nếu nó vừa restart gần đây, `VideoQueue` là đối tượng Python in-memory — không có persist queue. Worker chỉ pick up task khi `enqueue()` được gọi.

**Khắc phục đúng:** Không chỉ reset DB status thành `queued` — phải gọi `POST /api/video/tasks/{id}/retry` để route gọi `loop.call_soon(VideoQueue.enqueue, task_id)`.

**Sai lầm thường gặp:** Reset DB `status='queued'` rồi chờ — worker không pick up vì `VideoQueue._queue` rỗng.

### Kiểm tra DB path (dễ nhầm)

Backend chỉ dùng DB thật:
- `data/hagent.db` — file thật ở project root
- `backend/data/hagent.db` — đường dẫn bị chặn, không được mở hoặc tạo lại

`get_connection()` từ `api/services/db.py` dùng đúng file thật. Nếu truy vấn trực tiếp, nhớ dùng đúng đường dẫn `../data/hagent.db`.
```

## ⚠️ Pitfall: Bilibili — "No video formats found!" cần cookies Chrome trên macOS

**Hiện tượng:** yt-dlp trả về `ERROR: [BiliBili] BVxxxx: No video formats found!` — không tìm thấy format nào dù video tồn tại.

**Nguyên nhân gốc:** yt-dlp Python API's `cookies_from_browser` không thể decrypt Chrome cookies trên macOS vì Chrome lưu giá trị cookies encrypted với macOS Keychain. CLI `--cookies-from-browser chrome` hoạt động vì nó gọi native macOS binary.

**Fix (27/5/2026):** `_download_video()` giờ fallback sang **subprocess yt-dlp CLI** với `--cookies-from-browser chrome` khi gặp bất kỳ lỗi auth nào (bao gồm "No video formats found"). Xem `references/bilibili-macos-cookies.md` cho reproduction, code, và phân tích chi tiết.

**Dấu hiệu nhận biết:**
- Error message chứa "No video formats found" — KHÔNG phải "Sign in" hay "age-restricted"
- Video có metadata (title, duration) nhưng format list rỗng
- Task có error nhưng không có row trong DB nếu lỗi xảy ra trước `create_task`

**Cách kiểm tra fix:** Task sẽ show 2 progress messages:
```
Đang tải từ URL...
ERROR: [BiliBili] BV...: No video formats found!
Thử lại với cookie Chrome (yt-dlp CLI decrypt)...
[download] ... 100% ...
[download] ... 100% ...
Đã tải (X.X MB)
```

**Các trường hợp thất bại đã loại trừ:**
- ✗ Retry với keyword list — không đủ, cần giải pháp decrypt thực sự
- ✗ Manual SQLite extract cookies → dùng cookies file → Python API retry — Chrome encrypt values
- ✗ `cookies_from_browser: chrome` trong Python API — không decrypt được trên macOS
- ✓ **Subprocess yt-dlp CLI với `--cookies-from-browser chrome`** — hoạt động

**Liên kết:** `references/bilibili-macos-cookies.md` — chi tiết kỹ thuật đầy đủ.

**How the video pipeline works end-to-end** (frontend + API + pipeline + file layout): see `references/video-tab-architecture.md`.
**Backend API operations** (starting server, retry tasks, DB queries, upload dir): see `references/backend-api-ops.md`.
**Bilibili / macOS Chrome cookies** (yt-dlp Python API vs CLI — decrypt fix): see `references/bilibili-macos-cookies.md`.
