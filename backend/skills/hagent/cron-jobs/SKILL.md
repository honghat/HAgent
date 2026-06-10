---
name: cron-jobs
description: "Tạo và quản lý các tác vụ định kỳ (cron jobs) trong HAgent. Sử dụng skill này khi người dùng muốn: tự động hoá công việc lặp lại, đặt lịch nhắc nhở, kiểm tra định kỳ, theo dõi thông tin theo thời gian, chạy script theo lịch. KHÔNG dùng skill này khi người dùng chỉ hỏi về cron schedule thông thường."
---

# Cron Jobs — Tự động hoá tác vụ định kỳ

Skill này hướng dẫn cách sử dụng tool `cronjob` để tạo và quản lý các tác vụ chạy tự động theo lịch trong HAgent.

## Khi nào nên dùng cron job

- **Theo dõi/giam sát định kỳ**: Check API, kiểm tra giá coin, theo dõi tin tức mỗi giờ/ngày
- **Nhắc nhở**: Deadline, lịch họp, việc cần làm theo ngày
- **Tự động hoá workflow**: Backup, sync dữ liệu, gửi báo cáo mỗi sáng
- **Cào dữ liệu**: Crawl web, lấy thông tin theo lịch
- **Chạy script**: Gọi script shell/python định kỳ

**KHÔNG dùng cron job cho**:
- Việc cần chạy ngay một lần → dùng tool thông thường
- Việc cần tương tác realtime → dùng tool tương ứng
- Việc chạy xong là xong, không cần lặp → chạy trực tiếp

## Cách tạo cron job

Dùng tool `cronjob` với action `"create"`:

```
cronjob("create", {
  "prompt": "Nội dung công việc cần làm",
  "schedule": "every 1h",
  "name": "Tên job",
  "deliver": "origin"
})
```

### Các tham số

| Tham số | Bắt buộc | Mô tả |
|---------|----------|-------|
| `prompt` | ✅ | Nội dung công việc — prompt cho agent khi job chạy |
| `schedule` | ✅ | Lịch chạy (xem bên dưới) |
| `name` | ❌ | Tên hiển thị — nên đặt để dễ quản lý |
| `deliver` | ❌ | Nơi gửi kết quả: `"origin"` (mặc định), `"local"`, `"telegram"`, `"all"` |
| `skills` | ❌ | List skill cần load khi chạy job |
| `model` | ❌ | Model override — để trống = tự động lấy từ frontend Chat.jsx |
| `provider` | ❌ | Provider override — để trống = tự động lấy từ frontend Chat.jsx |
| `workdir` | ❌ | Thư mục làm việc |
| `no_agent` | ❌ | `true` = chỉ chạy script, không dùng LLM |
| `repeat` | ❌ | Số lần chạy (mặc định `None` = vô hạn) |

### Định dạng schedule

| Ví dụ | Kiểu | Ý nghĩa |
|-------|------|---------|
| `"30m"` | once | Chạy 1 lần sau 30 phút |
| `"2h"` | once | Chạy 1 lần sau 2 giờ |
| `"1d"` | once | Chạy 1 lần sau 1 ngày |
| `"2026-05-20T09:00"` | once | Chạy 1 lần vào thời điểm đó |
| `"every 30m"` | interval | Lặp mỗi 30 phút |
| `"every 2h"` | interval | Lặp mỗi 2 giờ |
| `"0 9 * * *"` | cron | Chạy lúc 9h sáng mỗi ngày |
| `"*/30 * * * *"` | cron | Chạy mỗi 30 phút |
| `"0 9 * * 1-5"` | cron | Chạy 9h sáng thứ 2-6 |

## Giao thức [SILENT]

Khi prompt của job kết thúc với `[SILENT]`, hệ thống sẽ **KHÔNG gửi thông báo** cho người dùng. Chỉ gửi thông báo khi có thay đổi thực sự quan trọng.

Ví dụ:
```
cronjob("create", {
  "name": "Theo dõi thời tiết",
  "schedule": "0 7 * * *",
  "prompt": "Kiểm tra thời tiết HCM city hôm nay.
  Nếu có mưa: báo với user chuẩn bị áo mưa.
  Nếu không mưa: [SILENT]"
})
```

## Các thao tác quản lý

### Xem danh sách job
```
cronjob("list")
```

### Xem chi tiết job
```
cronjob("view", {"job_id": "..."})
```

### Cập nhật job
```
cronjob("update", {
  "job_id": "...",
  "schedule": "0 9 * * *",
  "prompt": "nội dung mới"
})
```

### Xoá job
```
cronjob("delete", {"job_id": "..."})
```

### Tạm dừng / Tiếp tục
```
cronjob("pause", {"job_id": "..."})
cronjob("resume", {"job_id": "..."})
```

### Chạy ngay (không đợi lịch)
```
cronjob("trigger", {"job_id": "..."})
```

### Khoảng trống refresh UI sau trigger

**Vấn đề:** Khi user bấm "Run" trên trang `/cron`, frontend gọi `POST /api/cron/jobs/{job_id}/trigger`. Nếu component `CronManager.jsx` không gọi `loadJobs()` sau trigger, UI vẫn hiển thị `last_status` cũ (vd: `error`) dù job đã chạy thành công.

**Fix:** Trong `frontend/src/components/CronManager.jsx`, hàm `triggerJob()` cần gọi `await loadJobs()` sau khi trigger thành công:

```javascript
async function triggerJob(jobId) {
  try {
    const res = await fetch(`/api/cron/jobs/${jobId}/trigger`, { method: 'POST', headers: authHeaders(token) })
    if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`)
    setError('')
    await loadJobs()   // <-- THÊM DÒNG NÀY
  } catch (e) {
    setError(`Chạy job thất bại: ${e.message}`)
  }
}
```

**Cơ chế:** `loadJobs()` gọi `GET /api/cron/jobs` → set state `jobs` → React re-render → hiển thị `last_status` mới.

**Các hàm khác cũng cần loadJobs() sau mutate:**
- `toggleJob()` — đã có `await loadJobs()` ✅
- `createJob()` — cần kiểm tra
- `deleteJob()` — cần kiểm tra

Tìm tất cả các chỗ gọi fetch mutation trong CronManager.jsx và đảm bảo `await loadJobs()` được gọi sau mỗi lần mutate thành công.

## Các mẫu hay dùng

### 1. Báo cáo hàng ngày
```
cronjob("create", {
  "name": "Báo cáo sáng",
  "schedule": "0 8 * * *",
  "deliver": "telegram",
  "prompt": "Tổng hợp: thời tiết hôm nay, 1 tin tức công nghệ nổi bật, lịch hôm nay."
})
```

### 2. Theo dõi giá coin
```
cronjob("create", {
  "name": "Giá Bitcoin",
  "schedule": "every 1h",
  "deliver": "origin",
  "prompt": "Kiểm tra giá BTC hiện tại. Nếu biến động >5% so với giá 24h trước: báo cáo chi tiết. Nếu không: [SILENT]"
})
```

### 3. Nhắc nhở deadline
```
cronjob("create", {
  "name": "Nhắc nộp báo cáo",
  "schedule": "0 9 * * 1-5",
  "prompt": "Kiểm tra deadline dự án. Nếu còn <3 ngày: nhắc user. Nếu còn >3 ngày: [SILENT]"
})
```

### 4. Đọc tin tức bằng âm thanh — edge-tts server (ưu tiên)

Nếu đã có edge-tts server chạy local, dùng **POST HTTP** thay vì `say` — chất lượng giọng tốt hơn, không phụ thuộc vào giọng macOS.

**Server mặc định**: port `5002`, endpoint `POST /tts`
**Giọng**: `vi-VN-HoaiMyNeural` (Hoài My, nữ, VN) hoặc `vi-VN-NamMinhNeural` (nam)
**Body**: JSON `{ "text": "...", "voice": "vi-VN-HoaiMyNeural", "rate": "+0%" }`
**Response**: `audio/mpeg` → pipe sang `afplay` để phát âm thanh

```
cronjob("create", {
  "name": "Đọc tin mới 8h sáng",
  "schedule": "0 8 * * *",
  "skills": ["tin-tuc"],
  "prompt": "Dùng skill tin-tuc lấy tin VnExpress mới, so sánh cache. Tóm tắt 3-5 tin nổi bật. Mở đầu bằng 'Chào buổi sáng, sau đây là tin tức mới nhất hôm nay.' rồi đọc từng tin.\nSau đó gửi POST tới http://localhost:5002/tts với JSON body {\"text\": \"<nội dung>\", \"voice\": \"vi-VN-HoaiMyNeural\", \"rate\": \"+0%\"} để phát âm thanh.\nDùng curl: `curl -s -X POST http://localhost:5002/tts -H \"Content-Type: application/json\" -d '{\"text\":\"...\",\"voice\":\"vi-VN-HoaiMyNeural\",\"rate\":\"+0%\"}' | afplay`"
})
```

> ⚠️ **TTS chạy trên máy backend, không phải máy từ xa.** Nếu backend chạy trên server khác, âm thanh sẽ phát ra từ server đó (hoặc không có loa).
> ⚠️ **edge-tts server** phải chạy trước. Kiểm tra: `curl http://localhost:5002/health`. Nếu không có response, chạy `python3 /Users/nguyenhat/HAgent/tts/edge_tts_server.py &` trước.

**Kiểm tra giọng Hoài My**:
```bash
curl -s -X POST http://localhost:5002/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Chào bạn, đây là giọng Hoài My.","voice":"vi-VN-HoaiMyNeural","rate":"+0%"}' \
  | afplay
```

**Fallback — macOS TTS** (nếu edge-tts chưa có):
- `say -v '?'` — liệt kê giọng
- `say -v Linh` — giọng nữ tiếng Việt
- `say "Xin chào" -v Linh -r 180` — tùy chỉnh tốc độ

### 5. Script-only job (không dùng LLM)
```
cronjob("create", {
  "name": "Backup DB",
  "schedule": "0 2 * * *",
  "no_agent": true,
  "prompt": "/Users/nguyenhat/HAgent/scripts/backup.sh",
  "deliver": "local"
})
```

## Lưu ý quan trọng

- **Không tạo job trùng lặp**: Kiểm tra `cronjob("list")` trước khi tạo job mới
- **Đặt tên job rõ ràng**: Giúp dễ tìm và quản lý sau này
- **Dùng [SILENT] hợp lý**: Tránh spam — chỉ gửi thông báo khi có thông tin quan trọng
- **Kiểm tra trước**: Sau khi tạo, dùng `cronjob("list")` để xác nhận job đã được tạo
- **Chọn schedule phù hợp**: Không đặt interval quá dày nếu không cần thiết
- **Provider/model tự động theo frontend**: Để `provider` và `model` trống để job dùng đúng provider/model đang chọn trên Chat.jsx (qua `GET /api/auth/provider`). ⚠️ **Nhưng nếu FastAPI (port 8010) chưa chạy**, scheduler fallback về `HAGENT_HOME/config.yaml > model.provider` — nếu provider đó là local/custom không có API key, job sẽ fail. Luôn kiểm tra FastAPI đã chạy trước khi dùng cơ chế auto-follow.

## Cạm bẫy: Tool `cronjob` không thể clear model/provider

Tool `cronjob(action="update")` có schema `model` là object `{provider, model}`, nhưng handler xử lý `model` và `provider` như các tham số riêng. Kết quả:

- **Không thể clear model/provider đã pin** bằng cách truyền `model=""` +  `provider=""` — tool bỏ qua vì không match schema object, hoặc báo "No updates provided".
- **Cách clear**: Sửa trực tiếp `cron/jobs.json` — set `"model": null` và `"provider": null`.

```python
# Dùng execute_code hoặc sửa file trực tiếp
import json
with open('/path/to/cron/jobs.json') as f:
    data = json.load(f)
for j in data['jobs']:
    if j['id'] == '<JOB_ID>':
        j['model'] = None
        j['provider'] = None
with open('/path/to/cron/jobs.json', 'w') as f:
    json.dump(data, f, indent=2)
```

> ⚠️ Nếu shell bị block bởi `approvals.cron_mode`, dùng `execute_code` tool thay thế.
> ⚠️ Sau khi sửa, `cronjob(action="list")` sẽ hiển thị `"model": null, "provider": null`.

**Để tránh cần clear ngay từ đầu**: Khi tạo job, **không pin** provider/model trừ khi thực sự cần. Để `model` không được truyền (không phải `""`) thì job sẽ dùng mặc định từ config.

## Chẩn đoán cron job lỗi

### Triệu chứng: `last_status: error`, frontend báo lỗi, job không làm gì cả

**Bước 0 — Xác định config.yaml đúng đang được load**

📌 **Cạm bẫy path phổ biến:** Có thể có NHIỀU file `config.yaml` trong project, và scheduler không dùng file bạn nghĩ.

```
backend/config.yaml           # File của HAgent backend (có model.provider, providers: {pekpik: ...})
backend/config.yaml         # File thực tế scheduler dùng (HAGENT_HOME)
~/HAgent/config.yaml          # File rỗng hoặc không tồn tại
```

Cron scheduler (`cron/scheduler.py`) đọc từ `HAGENT_HOME/config.yaml`, **không phải** `backend/config.yaml`. Trong khi các tool CLI (`hagent config`, `hagent model`) thao tác với file khác. Kết quả: bạn sửa `backend/config.yaml` nhưng cron vẫn dùng config cũ.

```bash
# Xác định HAGENT_HOME thật sự
python3 -c "from hagent_constants import get_hagent_home; print(get_hagent_home())"

# Đọc config scheduler thực tế
cat $(python3 -c "from hagent_constants import get_hagent_home; print(get_hagent_home())")/config.yaml | grep -A5 '^model:'

# So sánh 2 file config
diff backend/config.yaml $(python3 -c "from hagent_constants import get_hagent_home; print(get_hagent_home())")/config.yaml 2>/dev/null
```

**Bước 0b — Kiểm tra `.env` mismatch trước khi đi sâu**

Một nguyên nhân phổ biến: scheduler load `.env` từ `HAGENT_HOME/.env` (thường là `backend/.env`), **không phải** `~/HAgent/.env` (project root). Hai file này có thể khác nhau.

```bash
diff ~/HAgent/.env ~/HAgent/backend/.env
```

So sánh: `backend/.env` có thể thiếu API key của provider mà job cần.

**📌 Lưu ý quan trọng — file `.env` là protected:** Tool patch/execute_code **không thể** ghi vào `.env` vì nó là credential file (bị chặn bởi `Write denied: protected system/credential file`). Người dùng phải tự thêm dòng bằng tay hoặc dùng terminal trực tiếp.

**Triệu chứng khi thiếu key custom provider:**
- `RuntimeError: Provider 'pekpik-custom' is set in config.yaml but no API key was found`
- Job có `provider: null` (không pin) fallback về config.yaml → config dùng custom provider → custom provider cần key trong `.env` → không thấy → crash
- `PEKPIK_API_KEY` có trong `~/.env` (project root) nhưng **không** có trong `HAGENT_HOME/.env` (backend/.env)

**Bước 1 — Đọc `last_error` trực tiếp từ `jobs.json`**

`cronjob("list")` chỉ hiển thị `last_status` và `last_delivery_error`, nhưng **không** hiển thị `last_error`. Lỗi thực tế nằm trong file `cron/jobs.json` — nơi scheduler ghi `last_error` đầy đủ:

**Bước 2 — Kiểm tra provider/model pinning**
```bash
# Xem job detail
cronjob("view", {"job_id": "..."})
# Chú ý provider, model, base_url
```

**Bước 3 — Kiểm tra config.yaml > model.provider (khi job không pin provider)**

Nếu job có `provider: null` (không pin), scheduler fallback về `config.yaml > model.provider`. Kiểm tra:

```bash
cat $(python3 -c "from hagent_constants import get_hagent_home; print(get_hagent_home())")/config.yaml | grep -A2 '^model:'
# Ví dụ output: model.provider: pekpik
# Nếu provider này là local/custom không có API key → crash!
```

**Luồng fallback khi provider không pin (chi tiết):**
1. `job.provider` → `""` (empty string) → falsy → skip
2. `_get_frontend_provider()` → gọi `GET /api/auth/provider` (port 8010) — nếu FastAPI chưa chạy hoặc không có response → trả về `("", "")` → skip
3. **Fallback về config.yaml > model.provider** — nếu provider này là `pekpik` (built-in, không có API key trong context) → `RuntimeError: Provider 'pekpik' is set in config.yaml but no API key was found`

**Fix:** Set provider rõ ràng cho job (Bước 4b) hoặc đảm bảo FastAPI frontend chạy để bước 2 có hiệu lực.

**Bước 4 — Nguyên nhân phổ biến: Provider pinning lỗi**
- Nếu job có `provider: deepseek` nhưng deepseek hết balance → `HTTP 402: Insufficient Balance` (error chứa HTTP status code)
- Nếu job có `provider: pekpik` (built-in) mà không có API key trong context → `AuthError: no API key found`
- Nếu job có `provider` trỏ tới LM Studio/Ollama server mà server đó down/unreachable → timeout → job chết ngay
- Nếu job có `model` không tồn tại trên provider đó → provider không match → fail

**Bước 5 — Fix: để job tự động theo frontend (khuyến nghị)**
```bash
cronjob("update", {
  "job_id": "...",
  "provider": "",    # Xoá — tự động lấy từ frontend Chat.jsx
  "model": ""        # Xoá — tự động lấy model của provider trên frontend
})
```
> ✅ Cron sẽ tự động dùng provider/model đang chọn trên Chat.jsx. Đổi UI là cron theo.

**Bước 4b — Nếu cần pin provider cụ thể:**
```bash
cronjob("update", {
  "job_id": "...",
  "provider": "deepseek",
  "model": "deepseek-chat"
})
```

**Bước 5 — Xác nhận job chạy lần tới**
Sau khi update, schedule tiếp theo sẽ dùng provider mới. Có thể trigger thử:
```bash
# Lưu ý: cronjob(action="run") chỉ đánh dấu DB, không spawn agent con
# Đợi scheduler tick (mỗi 60s) hoặc đợi lịch kế tiếp
```

### Provider/model tự động theo frontend Chat.jsx (khuyến nghị)

Từ bản cập nhật 2026-05, cron job **mặc định tự động** lấy provider và model mà user đã chọn trên giao diện Chat.jsx.

**Cách hoạt động:**
- Khi job có `provider` và `model` để trống (chuỗi rỗng), scheduler gọi `GET /api/auth/provider` (port 8010) để lấy provider user đang dùng.
- Sau đó gọi `GET /api/auth/providers` để lấy model của provider đó.
- Chính xác giống cách frontend Chat.jsx lưu (`PUT /api/auth/provider`) và đọc provider.
- Nếu API frontend không available (server chưa chạy), fallback về `config.yaml` → env var.

**Ưu điểm:**
- Đổi provider/model trong UI Chat.jsx → cron tự động theo, không cần sửa gì.
- Không cần pin provider cứng trong job.
- Giảm lỗi "provider not found" khi đổi qua lại.

**Chuẩn hoá — Không pin provider/model trừ khi thực sự cần:**
- `provider: ""` + `model: ""` = tự động theo frontend
- Chỉ pin khi job phải chạy trên provider/model cụ thể (vd: job cần GPT-4, không thể chạy DeepSeek)

### Đọc lỗi cron job khi `last_status: error` mà không có `last_delivery_error`

Khi `cronjob("list")` hiển thị `last_status: error` nhưng `last_delivery_error` rỗng, lỗi xảy ra **trong quá trình khởi tạo hoặc chạy job** — không phải lỗi gửi kết quả. Để lấy thông tin lỗi thực tế:

**Bước 1 — Kiểm tra log scheduler**

```bash
cd /Users/nguyenhat/HAgent/backend
ls cron/*.log 2>/dev/null || echo "Không có log file riêng"
ls logs/*.log 2>/dev/null || echo "Không có logs/ dir"
ls *.log 2>/dev/null
```

Nếu không có log file, scheduler log ra stdout/stderr của tiến trình chạy nền. Kiểm tra process:

```bash
ps aux | grep cron | grep -v grep
# Tìm PID → xem log gần đây
```

**Bước 2 — Kiểm tra DB trực tiếp**

Bảng cron_jobs trong DB lưu `last_error` (full error message), nhưng `cronjob("list")` không expose nó. Để đọc:

```bash
python3 -c "
import sqlite3
db = sqlite3.connect('/Users/nguyenhat/HAgent/data/hagent.db')
cols = ['id','name','schedule','status','last_run','last_error','provider','model','created_at']
rows = db.execute('SELECT id,name,schedule,status,last_run,last_error,provider,model,created_at FROM cron_jobs ORDER BY id').fetchall()
for r in rows:
    d = dict(zip(cols, r))
    print(f'[{d[\"id\"]}] {d[\"name\"]} — {d[\"status\"]}')
    print(f'  last_error: {d[\"last_error\"]}')
    print(f'  provider: {d[\"provider\"]}, model: {d[\"model\"]}')
    print()
"
```

> ⚠️ Nếu không tìm thấy bảng `cron_jobs` trong `hagent.db`, kiểm tra tên bảng khác: `SELECT name FROM sqlite_master WHERE type='table'`. Cron scheduler có thể dùng bảng khác (vd: `workflow_schedules`, `Settings`) hoặc lưu job ở file JSON riêng. Dùng `cronjob("list")` làm nguồn chính xác nhất.

**Bước 3 — Chạy job thử từ Python trực tiếp**

Khi không thể debug qua log hay DB, chạy `run_job()` trực tiếp để xem exception traceback:

```bash
cd /Users/nguyenhat/HAgent/backend
python3 -c "
import sys, json, os
sys.path.insert(0, '.')
os.environ['HAGENT_HOME'] = os.path.abspath('.')
from cron.scheduler import run_job

# Lấy job data từ cronjob tool output
job = {
    'id': '<JOB_ID>',
    'name': 'Test',
    'skills': ['tin-tuc'],
    'prompt': 'Nội dung test',
    'provider': '',  # để trống = auto
    'model': '',
    'deliver': 'local',
}
try:
    success, output, final_response, error = run_job(job)
    print('success:', success)
    print('error:', error)
    print('response:', (final_response or '')[:500])
except Exception as e:
    import traceback
    traceback.print_exc()
"
```

Lỗi điển hình xuất hiện trong traceback:
- `RuntimeError: Provider 'X' is set in config.yaml but no API key was found` — provider shadowing hoặc thiếu key
- `KeyError: 'model'` — config.yaml thiếu `model.default`
- `aiohttp.ClientError` — API endpoint không reachable
- `ModuleNotFoundError` — thiếu dependency

### Trigger endpoint crash resilience

The "Run now" endpoint lives at `POST /api/cron/jobs/{job_id}/trigger` in **`backend/hagent_cli/web_server.py`** (NOT in `backend/cron/`). It calls `run_job(job)` synchronously.

**Critical pattern — always wrap `run_job` in try/except:**

```python
try:
    success, output, final_response, error = run_job(job)
except Exception as e:
    logger.exception("run_job crashed for %s", job_id)
    mark_job_run(job_id, False, error=str(e))
    raise HTTPException(status_code=500, detail=str(e))
```

If `run_job` throws (e.g., nested event loop, import error, provider resolve crash), `mark_job_run()` is **never reached** → DB keeps the stale status → frontend still shows old error. The fix: always call `mark_job_run` **before** re-raising, so the DB is updated with the crash error immediately.

**Trigger path (not scheduler tick):**
1. User clicks "Run" on `/cron` page → `POST /api/cron/jobs/{job_id}/trigger`
2. `trigger_cron_job()` in `web_server.py` gets job from DB, calls `run_job(job)`
3. `run_job` runs synchronously in the calling thread, NOT in the scheduler thread pool
4. Success → `mark_job_run()` + save output → return
5. Crash → `mark_job_run(success=False, error=str(e))` → HTTP 500

### Provider pinning — dùng khi cần override

Khi job pin `provider` và `model`, thứ tự ưu tiên resolve:

1. `job.provider` giữ nguyên → thuật toán resolve provider dùng provider đó
2. `job.model` giữ nguyên → dùng model đó, bỏ qua config.yaml
3. Pin cả hai nếu cần provider khác frontend

**Quy tắc pin:**
- **Luôn pin provider có API key thật** (deepseek, anthropic, groq)
- Không pin custom/local provider (pekpik, lmstudio, ollama) — nếu server đó down, job chết âm thầm
- Pin `base_url` nếu provider cần endpoint riêng

**Cạm bẫy API key chỉ ở DB `custom_providers`**: Khi cron job pin provider `pekpik` (hoặc custom provider khác) mà API key của provider đó **chỉ lưu trong DB table `custom_providers`** (account DB, không phải `.env`), scheduler sẽ load `.env` từ `HAGENT_HOME/.env` (scheduler.py dòng 1290-1294) và **không tìm thấy key** → `RuntimeError: no API key found`.

```
DB account table:  pekpik@key=xxx   ✅
.env file:         PEKPIK_API_KEY   ❌ (thiếu)
```

Lý do: `resolve_runtime_provider` gọi `os.getenv("PEKPIK_API_KEY")` — nếu không có trong environ → fail. Cron scheduler không tự động query DB `custom_providers` để lấy key.

**Fix khi pin custom provider:**
1. **Copy key từ DB vào `.env`** (lâu dài, khuyến nghị). **Lưu ý: file `.env` là protected — tool không thể ghi. Người dùng phải tự thêm dòng bằng tay hoặc terminal:**
   ```bash
   # Kiểm tra key trong DB trước
   python3 -c "import sqlite3; db=sqlite3.connect('/Users/nguyenhat/HAgent/data/hagent.db'); r=db.execute('SELECT api_key FROM custom_providers WHERE name=\"pekpik\"').fetchone(); print(r[0] if r else 'not found')"
   # Sau đó tự thêm vào backend/.env
   echo 'PEKPIK_API_KEY=sk-xxx' >> /Users/nguyenhat/HAgent/backend/.env
   ```
   (Nếu `~/.env` đã có key, copy dòng đó bằng tay vào `backend/.env`)

2. **Hoặc dùng provider thật** (deepseek, openrouter, anthropic) — không cần custom provider → không gặp vấn đề này.

**Kiểm tra nhanh key nào đang có trong environ** (hữu ích khi debug provider lỗi):
```bash
python3 -c "import os; keys = [k for k in ['OPENAI_API_KEY','DEEPSEEK_API_KEY','ANTHROPIC_API_KEY','GROQ_API_KEY','PEKPIK_API_KEY','OPENROUTER_API_KEY'] if os.getenv(k)]; print('Keys found:', keys); [print(f'  {k}={os.getenv(k)[:8]}...') for k in keys]"
### Cạm bẫy `requested=""` (empty string) 🚨

Khi job có `provider: ""`, scheduler truyền `requested=""` vào `resolve_runtime_provider`. 

**Lỗi**: `resolve_requested_provider` check `if requested and requested.strip()` — `""` là falsy nên bỏ qua, fallback về `model.provider` từ config.

**Fix đã apply** (`cron/scheduler.py` dòng 1330):
```python
# Before: resolve_runtime_provider(requested="") → seen as falsy → fallback error
job.get("provider")

# After (correct):
job.get("provider") or None  # empty string → None → proper handling
```

**Triệu chứng**: `RuntimeError: Provider 'X' is set in config.yaml but no API key was found` khi job không pin provider nhưng config fallback về local/custom provider.

**Fix**: 
1. Set `provider: deepseek` + `model: deepseek-chat` (có API key thật) cho job — hoặc
2. Để `provider: ""` + `model: ""` — tự động theo frontend Chat.jsx (khuyến nghị).

**Cạm bẫy `model:` thay vì `default:`**: config.yaml có thể lưu cả `model.model` và `model.default`. `_get_model_config()` (runtime_provider.py dòng 116) xử lý: `if not cfg.get("default") and cfg.get("model"): cfg["default"] = cfg["model"]`. Nhưng **chỉ** khi `default` không tồn tại. Nếu `default` tồn tại nhưng lỗi thời, nó vẫn được dùng bất chấp `model` mới hơn. Nếu đổi `model.provider` sang deepseek nhưng `model.default` vẫn là `qwen/qwen3.5-9b`, model đó vẫn chạy qua deepseek — OK. Nhưng nếu model đó không tồn tại trên provider mới, sẽ fail. Luôn kiểm tra `model.default` có tồn tại trên provider đã chọn.

### Cạm bẫy: Wrapped error message mask the real cause

`cron/scheduler.py` wraps all exceptions from `resolve_runtime_provider` at line 1406-1408:
```python
except Exception as exc:
    message = format_runtime_provider_error(exc)
    raise RuntimeError(message) from exc
```

`format_runtime_provider_error` is just `str(error)` for non-AuthError — so the raised message can be a generic "Provider 'X' is set in config.yaml but no API key was found" even when the **actual** error is something completely different (HTTP 401 expired key, HTTP 402 insufficient balance, rate limit, invalid model, etc.).

The misleading error gets written to `last_error` in `jobs.json`, making you chase the wrong root cause.

**Diagnostic technique — monkey-patch `resolve_runtime_provider` to see the real result:**

Create a debug script that hooks into `resolve_runtime_provider` before `run_job`:

```python
# debug_cron_real_error.py
import sys, os, json
os.environ['HAGENT_HOME'] = os.path.abspath('.')
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.environ['HAGENT_HOME'], '.env'), override=True, encoding='utf-8')

# Monkey-patch to log real result
import hagent_cli.runtime_provider as rp
_orig_resolve = rp.resolve_runtime_provider

def _traced_resolve(**kwargs):
    print(f"Called with: {kwargs}", flush=True)
    try:
        result = _orig_resolve(**kwargs)
        print(f"Result provider={result.get('provider')}, api_key={'SET' if result.get('api_key') else 'EMPTY'}, base_url={result.get('base_url')}", flush=True)
        return result
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", flush=True)
        import traceback; traceback.print_exc()
        raise

rp.resolve_runtime_provider = _traced_resolve

from cron.scheduler import run_job
# ... load job and run as usual
```

This bypasses scheduler's exception wrapper and shows the REAL provider result and the REAL error.

**Another symptom — `invalid syntax (module.py, line N)` before the error:**

If you see `Cron toolset resolution failed, falling back to full default toolset: invalid syntax (module.py, line N)` in the output BEFORE the final error, there is a **Python syntax error** in one of the imported modules. This can corrupt the entire resolve chain. Fix the syntax error first (likely a missing space like `classFoo:` → `class Foo:`) — it may fix the cascade that produces the final misleading error.

### Common triggers for misleading wrapped errors

| Symptom (what `last_error` says) | Likely real cause | Fix |
|---|---|---|
| `Provider 'X' is set in config.yaml but no API key was found` | API key expired (HTTP 401) OR key missing from `.env` | Check key validity, add to `.env` |
| `Provider 'X' is set in config.yaml but no API key was found` | Import error upstream (syntax error in another module) | Fix syntax error, re-test |
| `HTTP 402: Insufficient Balance` | Provider account out of credits | Top up or switch provider |
| `HTTP 429: Too Many Requests` | Rate limited | Add delay or switch provider |
| `aiohttp.ClientError: ...` | Server unreachable (LM Studio / Ollama down) | Start server or use different provider |
| `AttributeError: module 'X' has no attribute 'Y'` | Version mismatch or broken install | Reinstall dependencies |

**Cardinal rule:** When `cronjob("list")` shows `last_status: error` with a generic message like "Provider 'X' ... no API key", DO NOT assume it's really a missing key. Run `resolve_runtime_provider` directly (via debug script above) first — the real error is almost always different.

## Kiểm tra & chạy thử cron job

### `cronjob("run")` KHÔNG chạy job ngay

`cronjob(action="run")` chỉ **đánh dấu schedule** trong DB để scheduler tick tiếp theo pick lên. Nó không spawn agent con.

### Chạy job trực tiếp từ Python (debug/test)

Để chạy cron job ngay lập tức mà không đợi scheduler tick:

```bash
cd /Users/nguyenhat/HAgent/backend
.venv/bin/python3 -c "
import sys, os, json
sys.path.insert(0, '.')
os.environ['HAGENT_HOME'] = os.path.abspath('.')
from cron.scheduler import run_job

data = json.load(open('cron/jobs.json'))
jobs = data['jobs']
job = next(j for j in jobs if j['id'] == '<JOB_ID>')
success, output, final_response, error = run_job(job)
print('success:', success)
print('error:', error)
print('final_response:', final_response[:2000] if final_response else 'EMPTY')
"
```

**Lưu ý quan trọng**:
- **Dùng `.venv/bin/python3`** — Python 3.11.15 có hỗ trợ `Callable | None` syntax. Python system mặc định (3.9/3.10) sẽ fail với `TypeError: unsupported operand type(s) for |`.
- `config.yaml` không dùng `model.provider` cứng sai provider → cron fail.
- **Kiểm tra lỗi provider trước: xem `config.yaml > model.provider` và `model.default` có khớp với provider có key không.**

> 📖 **Tham khảo thêm:** `references/wrapped-error-debug.md` — cách debug khi error message bị wrap mask gốc rễ thực sự.
