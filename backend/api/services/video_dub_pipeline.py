"""Video đàn tranh — pipeline lồng tiếng Trung→Việt (port từ HatTranlated server.cjs).

Tách audio → Groq Whisper (segment timestamp) → dịch (prompt đàn tranh) →
Edge TTS :5002 → atempo khớp cửa sổ → adelay đặt mốc → mux → .srt song ngữ.

Hàng đợi 1 worker (thread nền) để tránh nghẽn ffmpeg / quota API. Lịch sử lưu Postgres
(bảng video_dub_tasks) qua lớp tương thích db.get_connection.
"""

from __future__ import annotations

import json
import logging
import os
import queue
import re
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path

import requests

from api.services.db import DATA_DIR, get_connection

logger = logging.getLogger(__name__)

# ── Cấu hình (kế thừa hạ tầng HAgent) ──────────────────────────────────────
FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GROQ_STT_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_STT_MODEL = "whisper-large-v3"
GROQ_CHAT_MODEL = "llama-3.3-70b-versatile"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
OUTPUT_DIR = Path(DATA_DIR) / "video-dub"
UPLOAD_DIR = OUTPUT_DIR / "uploads"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Prompt đàn tranh — giữ nguyên bản từ server.cjs (thuật ngữ nốt/phách/dây/ngón/kỹ thuật).
GUZHENG_PROMPT = (
    "Bạn là phiên dịch viên cho video giảng dạy đàn tranh cổ/gu zheng Trung-Việt. "
    "Dịch sang tiếng Việt rõ ràng, dễ hiểu như giáo viên hướng dẫn học viên: ngắn gọn, "
    "tự nhiên, mạch lạc, giữ đúng sắc thái giảng bài. Giữ và dịch chuẩn thuật ngữ âm nhạc, "
    "tên nốt, nhịp/phách, tiết tấu, cao độ, dây đàn, tay trái/tay phải, ngón gảy, rung, nhấn, "
    "vuốt, luyến, vê, kỹ thuật luyện tập, tên bài, tên điệu và tên nhạc cụ. Nếu gặp thuật ngữ "
    "chuyên môn khó dịch, ưu tiên cách gọi quen thuộc trong tiếng Việt hoặc giữ phiên âm kèm "
    "nghĩa ngắn; không biến thành thoại phim, không thêm màu cổ trang. "
    "Chỉ trả về danh sách đánh số, mỗi dòng một câu, không giải thích, không thêm gì khác."
)


def _now_ms() -> int:
    return int(time.time() * 1000)


# ── Google Drive helpers ──────────────────────────────────────────────────────
DRIVE_TOKEN_URL = "https://oauth2.googleapis.com/token"
DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3"

def _drive_env(*names: str) -> str:
    for n in names:
        v = os.getenv(n, "").strip()
        if v:
            return v
    for env_path in (Path(__file__).resolve().parents[3] / ".env", Path(__file__).resolve().parents[2] / ".env"):
        if not env_path.exists():
            continue
        try:
            for raw in env_path.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith("export "):
                    line = line[7:].strip()
                if "=" not in line:
                    continue
                k, v = line.split("=", 1)
                if k.strip() in names:
                    return v.strip().strip('"').strip("'")
        except Exception:
            continue
    return ""

def _drive_access_token() -> str | None:
    cid = _drive_env("GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_CLIENT_ID", "YOUTUBE_CLIENT_ID")
    sec = _drive_env("GOOGLE_DRIVE_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET", "YOUTUBE_CLIENT_SECRET")
    ref = _drive_env("GOOGLE_DRIVE_REFRESH_TOKEN", "GDRIVE_REFRESH_TOKEN")
    if not all([cid, sec, ref]):
        return None
    try:
        r = requests.post(DRIVE_TOKEN_URL, data={
            "client_id": cid, "client_secret": sec,
            "refresh_token": ref, "grant_type": "refresh_token",
        }, timeout=30)
        r.raise_for_status()
        return r.json()["access_token"]
    except Exception:
        logger.exception("drive token refresh failed")
        return None

def _upload_file_to_drive(file_path: str, mime: str = "application/octet-stream") -> str | None:
    token = _drive_access_token()
    if not token:
        return None
    size = os.path.getsize(file_path)
    name = os.path.basename(file_path)
    try:
        r = requests.post(
            f"{DRIVE_UPLOAD_API}/files?uploadType=resumable",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": mime,
                "X-Upload-Content-Length": str(size),
            },
            json={"name": name}, timeout=30,
        )
        r.raise_for_status()
        url = r.headers["Location"]
        with open(file_path, "rb") as f:
            r2 = requests.put(url, data=f, headers={
                "Content-Length": str(size), "Content-Type": mime,
            }, timeout=600)
        r2.raise_for_status()
        return r2.json()["id"]
    except Exception:
        logger.exception("drive upload failed for %s", file_path)
        return None

def _maybe_upload_to_drive(task_id: int) -> None:
    task = get_task(task_id)
    if not task or task.get("status") != "done":
        return
    video = task.get("video_file", "") or ""
    srt = task.get("srt_file", "") or ""
    if video and not video.startswith("drive:"):
        p = OUTPUT_DIR / video
        if p.exists():
            fid = _upload_file_to_drive(str(p), "video/mp4")
            if fid:
                _update(task_id, video_file=f"drive:{fid}")
                _rmf(str(p))
    if srt and not srt.startswith("drive:"):
        p = OUTPUT_DIR / srt
        if p.exists():
            fid = _upload_file_to_drive(str(p), "text/plain; charset=utf-8")
            if fid:
                _update(task_id, srt_file=f"drive:{fid}")
                _rmf(str(p))


def _tmp(suffix: str) -> str:
    fd, p = tempfile.mkstemp(prefix="vdub-", suffix=suffix)
    os.close(fd)
    return p


def _rmf(*paths) -> None:
    for p in paths:
        try:
            if p and os.path.exists(p):
                os.unlink(p)
        except Exception:
            pass


def _run_ffmpeg(args: list[str]) -> None:
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", *args], check=True)


def _ffprobe_duration(path: str) -> float:
    out = subprocess.run(
        [FFPROBE, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    try:
        return float(out)
    except ValueError:
        return 0.0


# ── Bảng + truy cập DB ─────────────────────────────────────────────────────
def init_video_dub_tables() -> None:
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS video_dub_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                source_type TEXT NOT NULL,
                source_ref TEXT,
                source_lang TEXT DEFAULT 'zh',
                voice TEXT DEFAULT 'hoaimy',
                status TEXT NOT NULL DEFAULT 'queued',
                progress TEXT,
                video_file TEXT,
                srt_file TEXT,
                segments_count INTEGER,
                duration REAL,
                error TEXT,
                created_at BIGINT NOT NULL,
                updated_at BIGINT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_vdub_user ON video_dub_tasks(user_id, created_at DESC);
            """
        )


def create_task(user_id: str, title: str, source_type: str, source_ref: str,
                source_lang: str = "zh", voice: str = "hoaimy") -> int:
    now = _now_ms()
    with get_connection() as conn:
        row = conn.execute(
            """INSERT INTO video_dub_tasks
               (user_id, title, source_type, source_ref, source_lang, voice, status, created_at, updated_at)
               VALUES (?,?,?,?,?,?, 'queued', ?, ?) RETURNING id""",
            (user_id, title[:200], source_type, source_ref, source_lang, voice, now, now),
        ).fetchone()
    return int(row["id"])


def get_task(task_id: int, user_id: str | None = None) -> dict | None:
    with get_connection() as conn:
        if user_id is None:
            row = conn.execute("SELECT * FROM video_dub_tasks WHERE id=?", (task_id,)).fetchone()
        else:
            row = conn.execute(
                "SELECT * FROM video_dub_tasks WHERE id=? AND user_id=?", (task_id, user_id)
            ).fetchone()
    return dict(row) if row else None


def list_tasks(user_id: str) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT id, title, source_type, voice, status, progress, segments_count,
                      duration, error, created_at, updated_at
               FROM video_dub_tasks WHERE user_id=? ORDER BY created_at DESC LIMIT 200""",
            (user_id,),
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        last = ""
        try:
            arr = json.loads(d.get("progress") or "[]")
            last = arr[-1]["m"] if arr else ""
        except Exception:
            last = d.get("progress") or ""
        d["progress"] = last
        out.append(d)
    return out


def _update(task_id: int, **fields) -> None:
    if not fields:
        return
    fields["updated_at"] = _now_ms()
    cols = ", ".join(f"{k}=?" for k in fields)
    with get_connection() as conn:
        conn.execute(f"UPDATE video_dub_tasks SET {cols} WHERE id=?", (*fields.values(), task_id))


def delete_task(task_id: int, user_id: str) -> bool:
    task = get_task(task_id, user_id)
    if not task:
        return False
    for f in (task.get("video_file"), task.get("srt_file"),
              task.get("source_ref") if task.get("source_type") == "upload" else None):
        if f:
            _rmf(str(UPLOAD_DIR / f) if f == task.get("source_ref") else str(OUTPUT_DIR / f))
    with get_connection() as conn:
        conn.execute("DELETE FROM video_dub_tasks WHERE id=?", (task_id,))
    return True


def make_logger(task_id: int):
    """Append log {t,m} vào cột progress (giữ 500 dòng cuối)."""
    try:
        t = get_task(task_id)
        arr = json.loads(t.get("progress") or "[]") if t else []
        if not isinstance(arr, list):
            arr = []
    except Exception:
        arr = []

    def log(msg: str) -> None:
        line = msg if isinstance(msg, str) else json.dumps(msg)
        logger.info("[vdub %s] %s", task_id, line)
        arr.append({"t": _now_ms(), "m": line})
        if len(arr) > 500:
            del arr[:-500]
        _update(task_id, progress=json.dumps(arr, ensure_ascii=False))

    return log


# ── STT: Groq Whisper (segment timestamps) ─────────────────────────────────
def _extract_audio(video_path: str) -> str:
    out = _tmp(".mp3")
    _run_ffmpeg(["-i", video_path, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", out])
    return out


def _stt_groq_file(audio_path: str, lang: str) -> list[dict]:
    with open(audio_path, "rb") as f:
        files = {"file": (os.path.basename(audio_path), f, "audio/mpeg")}
        data = [
            ("model", GROQ_STT_MODEL),
            ("response_format", "verbose_json"),
            ("timestamp_granularities[]", "segment"),
            ("language", lang),
        ]
        resp = requests.post(
            GROQ_STT_URL, files=files, data=data,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"}, timeout=600,
        )
    resp.raise_for_status()
    segs = resp.json().get("segments") or []
    return [{"start": s["start"], "end": s["end"], "text": (s.get("text") or "").strip()}
            for s in segs if (s.get("text") or "").strip()]


def _stt_groq(audio_path: str, lang: str, log) -> list[dict]:
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY chưa cấu hình")
    size = os.path.getsize(audio_path)
    log(f"  🎤 Groq Whisper STT ({size/1024/1024:.1f} MB, lang={lang})...")
    if size <= 24 * 1024 * 1024:
        return _stt_groq_file(audio_path, lang)
    # chia chunk ~10 phút, cộng offset
    dur = _ffprobe_duration(audio_path)
    out: list[dict] = []
    off = 0.0
    while off < dur:
        length = min(600.0, dur - off)
        chunk = _tmp(".mp3")
        _run_ffmpeg(["-i", audio_path, "-ss", str(off), "-t", str(length),
                     "-c:a", "libmp3lame", chunk])
        log(f"  🎤 chunk {int(off)}s..{int(off+length)}s")
        for s in _stt_groq_file(chunk, lang):
            out.append({"start": s["start"] + off, "end": s["end"] + off, "text": s["text"]})
        _rmf(chunk)
        off += 600.0
    return out


# ── Dịch ───────────────────────────────────────────────────────────────────
_REFUSAL = re.compile(
    r"^(không\s+(dịch|cần|nên)|giữ nguyên|keep|tên\s+(chương trình|phim|bài|nhân vật|riêng)|"
    r"đây là tên)|không\s+cần\s+dịch|là\s+tên\s+(chương trình|phim|riêng|bài)|phiên âm hán",
    re.IGNORECASE,
)


def _is_refusal(t: str) -> bool:
    return bool(t and _REFUSAL.search(t.strip().lower()))


def _parse_numbered(text: str, n: int) -> list[str]:
    out = [""] * n
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    for line in lines:
        m = re.match(r"^(\d+)[.)\]:\-\s]+(.+)$", line)
        if m:
            idx = int(m.group(1)) - 1
            if 0 <= idx < n:
                out[idx] = m.group(2).strip()
    if all(not s for s in out):
        for i, l in enumerate(lines[:n]):
            out[i] = l
    return out


def _translate_groq(texts: list[str]) -> list[str]:
    numbered = "\n".join(f"{i+1}. {t}" for i, t in enumerate(texts))
    resp = requests.post(
        GROQ_CHAT_URL,
        headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
        json={"model": GROQ_CHAT_MODEL, "temperature": 0.3,
              "messages": [{"role": "system", "content": GUZHENG_PROMPT},
                           {"role": "user", "content": numbered}]},
        timeout=120,
    )
    resp.raise_for_status()
    return _parse_numbered(resp.json()["choices"][0]["message"]["content"], len(texts))


def _translate_gemini(texts: list[str]) -> list[str]:
    numbered = "\n".join(f"{i+1}. {t}" for i, t in enumerate(texts))
    resp = requests.post(
        f"{GEMINI_URL}?key={GEMINI_API_KEY}",
        json={"contents": [{"parts": [{"text": f"{GUZHENG_PROMPT}\n\n{numbered}"}]}]},
        timeout=120,
    )
    resp.raise_for_status()
    txt = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
    return _parse_numbered(txt, len(texts))


def _translate_batch(texts: list[str], log) -> list[str]:
    if GROQ_API_KEY:
        fn, name = _translate_groq, "Groq LLaMA"
    elif GEMINI_API_KEY:
        fn, name = _translate_gemini, "Gemini Flash"
    else:
        raise RuntimeError("Chưa có API key dịch (Groq/Gemini)")
    out: list[str] = []
    BATCH = 20
    for i in range(0, len(texts), BATCH):
        chunk = texts[i:i + BATCH]
        log(f"  🌐 Dịch {i+1}–{min(i+BATCH, len(texts))}/{len(texts)} ({name})")
        try:
            res = fn(chunk)
            out.extend("" if _is_refusal(t) else t for t in res)
        except Exception as e:
            log(f"  ⚠️ {name} lỗi ({e}), thử từng câu…")
            for t in chunk:
                try:
                    r = (fn([t]) or [""])[0]
                    out.append("" if _is_refusal(r) else r)
                except Exception:
                    out.append("")
    return out


# ── Google TTS (gtts) ──────────────────────────────────────────────────────
def _tts_google(text: str) -> bytes | None:
    try:
        from gtts import gTTS
        import io
        tts = gTTS(text=text, lang="vi", slow=False)
        fp = io.BytesIO()
        tts.write_to_fp(fp)
        fp.seek(0)
        return fp.read()
    except Exception:
        return None


def _trim_leading_silence(src: str) -> str:
    out = _tmp(".mp3")
    try:
        _run_ffmpeg(["-i", src, "-af",
                     "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05", out])
        if os.path.getsize(out) > 500:
            return out
    except Exception:
        pass
    _rmf(out)
    return src


def _tts_segment(text: str) -> str | None:
    buf = _tts_google(text)
    if not buf:
        return None
    raw = _tmp(".mp3")
    with open(raw, "wb") as f:
        f.write(buf)
    trimmed = _trim_leading_silence(raw)
    if trimmed != raw:
        _rmf(raw)
    return trimmed


def _fit_to_window(tts_path: str, target: float) -> str:
    cur = _ffprobe_duration(tts_path)
    if not cur or not target or target <= 0 or cur / target < 1.0:
        return tts_path
    ratio = min(cur / target, 1.6)
    out = _tmp(".mp3")
    _run_ffmpeg(["-i", tts_path, "-filter:a", f"atempo={ratio:.3f}", out])
    _rmf(tts_path)
    return out


def _build_aligned_track(segments: list[dict], total: float, log) -> str:
    usable = [s for s in segments if s.get("tts_path")]
    log(f"  🎚️  Ghép {len(usable)} clip lồng tiếng lên timeline {total:.1f}s...")
    silence = _tmp(".mp3")
    _run_ffmpeg(["-f", "lavfi", "-t", str(total),
                 "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
                 "-c:a", "libmp3lame", silence])
    if not usable:
        return silence
    current = silence
    BATCH = 25
    for i in range(0, len(usable), BATCH):
        batch = usable[i:i + BATCH]
        nxt = _tmp(".mp3")
        args = ["-i", current]
        for s in batch:
            args += ["-i", s["tts_path"]]
        filters, labels = [], ["[0:a]"]
        for idx, s in enumerate(batch):
            ms = max(0, int(s["start"] * 1000))
            filters.append(f"[{idx+1}:a]adelay={ms}|{ms},volume=1.0[d{idx}]")
            labels.append(f"[d{idx}]")
        filters.append(
            f"{''.join(labels)}amix=inputs={len(labels)}:duration=longest:"
            f"dropout_transition=0:normalize=0[out]"
        )
        args += ["-filter_complex", ";".join(filters),
                 "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "192k", nxt]
        _run_ffmpeg(args)
        if current != silence:
            _rmf(current)
        current = nxt
        log(f"     mix batch {min(i+BATCH, len(usable))}/{len(usable)}")
    if current != silence:
        _rmf(silence)
    return current


def _mux_final(video_path: str, dub_path: str, out_path: str) -> None:
    _run_ffmpeg([
        "-i", video_path, "-i", dub_path,
        "-filter_complex",
        "[0:a]volume=0.15[orig];[1:a]volume=1.6[dub];"
        "[orig][dub]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]",
        "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac",
        "-b:a", "192k", "-shortest", "-movflags", "+faststart", out_path,
    ])


def _fmt_srt(t: float) -> str:
    h, rem = divmod(int(t), 3600)
    m, s = divmod(rem, 60)
    ms = int((t - int(t)) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _build_srt(segments: list[dict]) -> str:
    return "\n".join(
        f"{i+1}\n{_fmt_srt(s['start'])} --> {_fmt_srt(s['end'])}\n{s.get('vi','')}\n{s.get('zh','')}\n"
        for i, s in enumerate(segments)
    )


# ── Pipeline chính ─────────────────────────────────────────────────────────
def dub_video(video_path: str, voice_key: str, lang: str, log) -> dict:
    log(f"🎙️ Giọng: Lồng tiếng Google (vi) | Phong cách: đàn tranh")
    temps: list[str] = []
    try:
        total = _ffprobe_duration(video_path)
        log(f"✓ Video dài {int(total//60)}:{int(total%60):02d}")

        log("Đang tách audio...")
        audio = _extract_audio(video_path)
        temps.append(audio)

        log("Đang nhận diện thoại (Whisper)...")
        raw = _stt_groq(audio, lang, log)
        log(f"✓ Whisper trả về {len(raw)} đoạn thoại")
        if not raw:
            raise RuntimeError("Không nhận diện được thoại nào")

        # Dedup trùng/overlap
        segs = []
        for i, s in enumerate(raw):
            if i and (s["text"].strip() == raw[i-1]["text"].strip()
                      or s["start"] < raw[i-1]["end"] - 0.05):
                continue
            segs.append(s)
        if len(segs) < len(raw):
            log(f"  ℹ️ Loại {len(raw)-len(segs)} segment trùng/overlap")

        log("Đang dịch sang tiếng Việt...")
        vi = _translate_batch([s["text"] for s in segs], log)
        segments = [{"start": s["start"], "end": s["end"], "zh": s["text"], "vi": vi[i] if i < len(vi) else ""}
                    for i, s in enumerate(segs)]

        log(f"Đang lồng tiếng ({len(segments)} câu)...")
        for i, seg in enumerate(segments):
            if not seg["vi"]:
                continue
            try:
                raw_tts = _tts_segment(seg["vi"])
                if not raw_tts:
                    continue
                temps.append(raw_tts)
                fitted = _fit_to_window(raw_tts, seg["end"] - seg["start"])
                if fitted != raw_tts:
                    temps.append(fitted)
                seg["tts_path"] = fitted
                if (i + 1) % 10 == 0:
                    log(f"  Lồng tiếng {i+1}/{len(segments)}")
            except Exception as e:
                log(f"  ⚠️ Lồng tiếng lỗi câu {i+1}: {e}")

        dub_track = _build_aligned_track(segments, total, log)
        temps.append(dub_track)

        log("Đang mux video cuối...")
        stamp = _now_ms()
        video_name = f"final-{stamp}.mp4"
        srt_name = f"final-{stamp}.srt"
        _mux_final(video_path, dub_track, str(OUTPUT_DIR / video_name))
        (OUTPUT_DIR / srt_name).write_text(_build_srt(segments), encoding="utf-8")

        log("✅ Hoàn tất!")
        return {"video_file": video_name, "srt_file": srt_name,
                "segments": len(segments), "duration": total}
    finally:
        _rmf(*temps)


# ── yt-dlp ─────────────────────────────────────────────────────────────────
def youtube_title(url: str) -> str:
    import yt_dlp
    with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True}) as ydl:
        return ydl.extract_info(url, download=False).get("title", "") or ""


def _download_youtube(url: str, log) -> str:
    import yt_dlp
    tmpdir = tempfile.mkdtemp(prefix="vdub-yt-")
    opts = {
        "format": "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b/best",
        "outtmpl": os.path.join(tmpdir, "video.%(ext)s"),
        "merge_output_format": "mp4",
        "quiet": True, "no_warnings": True, "noprogress": True, "retries": 5,
    }
    log(f"Đang tải từ YouTube: {url}")
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])
    files = [f for f in os.listdir(tmpdir) if f.startswith("video.")]
    if not files:
        raise RuntimeError("yt-dlp không tải được file")
    dest = str(UPLOAD_DIR / f"yt-{_now_ms()}.mp4")
    shutil.move(os.path.join(tmpdir, files[0]), dest)
    shutil.rmtree(tmpdir, ignore_errors=True)
    log(f"✓ Đã tải: {os.path.basename(dest)} ({os.path.getsize(dest)/1024/1024:.1f} MB)")
    return dest


# ── Hàng đợi 1 worker (thread nền) ─────────────────────────────────────────
_task_queue: "queue.Queue[int]" = queue.Queue()
_worker_started = False
_worker_lock = threading.Lock()


def enqueue(task_id: int) -> None:
    _ensure_worker()
    _task_queue.put(task_id)


def _ensure_worker() -> None:
    global _worker_started
    with _worker_lock:
        if _worker_started:
            return
        _worker_started = True
        threading.Thread(target=_worker_loop, daemon=True, name="video-dub-worker").start()


def _worker_loop() -> None:
    while True:
        task_id = _task_queue.get()
        try:
            _run_task(task_id)
        except Exception:
            logger.exception("video-dub run_task %s failed", task_id)
        finally:
            _task_queue.task_done()


def _run_task(task_id: int) -> None:
    task = get_task(task_id)
    if not task:
        return
    log = make_logger(task_id)
    _update(task_id, status="running", error=None)
    src_video = None
    cleanup_src = False
    try:
        if task["source_type"] == "youtube":
            src_video = _download_youtube(task["source_ref"], log)
            cleanup_src = True
        else:
            src_video = str(UPLOAD_DIR / task["source_ref"])
        result = dub_video(src_video, task.get("voice") or "hoaimy",
                           task.get("source_lang") or "zh", log)
        _update(task_id, status="done", error=None,
                video_file=result["video_file"], srt_file=result["srt_file"],
                segments_count=result["segments"], duration=result["duration"])
        log("✅ Task hoàn tất")
        if cleanup_src:
            _rmf(src_video)
        # Upload to Drive trong background
        threading.Thread(target=_maybe_upload_to_drive, args=(task_id,), daemon=True).start()
    except Exception as e:
        logger.exception("video-dub task %s error", task_id)
        log(f"❌ Lỗi: {e}")
        _update(task_id, status="error", error=str(e)[:500])
        if cleanup_src and src_video:
            _rmf(src_video)


def requeue_stuck() -> None:
    """Khôi phục task dở dang khi restart + upload task done lên Drive."""
    try:
        with get_connection() as conn:
            rows = conn.execute(
                "SELECT id FROM video_dub_tasks WHERE status IN ('queued','running')"
            ).fetchall()
        for r in rows:
            _update(int(r["id"]), status="queued")
            enqueue(int(r["id"]))
    except Exception:
        logger.exception("video-dub requeue_stuck failed")
    # Upload task done chưa có Drive lên Google Drive
    try:
        with get_connection() as conn:
            rows = conn.execute(
                "SELECT id FROM video_dub_tasks WHERE status='done' AND video_file NOT LIKE 'drive:%'"
            ).fetchall()
        for r in rows:
            threading.Thread(target=_maybe_upload_to_drive, args=(int(r["id"]),), daemon=True).start()
    except Exception:
        logger.exception("video-dub drive_upload_stuck failed")


def health() -> dict:
    gtts_ok = False
    try:
        from gtts import gTTS
        gtts_ok = True
    except Exception:
        pass
    return {"ok": True, "groq": bool(GROQ_API_KEY), "gemini": bool(GEMINI_API_KEY),
            "gtts": gtts_ok, "queue": _task_queue.qsize()}


# ── Quét Drive hằng ngày lúc 2h sáng ──────────────────────────────────────────
DRIVE_SCAN_ACCOUNT = "hatn8354_gmail.com"
DRIVE_SCAN_TOKEN_PATH = str(Path(__file__).resolve().parents[2] / "tokens" / "google_tokens" / f"{DRIVE_SCAN_ACCOUNT}.json")

def _scan_drive_and_link() -> None:
    """Quét Drive của hatn8354, tìm final-* files và cập nhật task thiếu Drive link."""
    from api.services.google_credential_store import load_google_credential
    cred = load_google_credential(str(DRIVE_SCAN_TOKEN_PATH))
    if not cred or not cred.get("refresh_token"):
        logger.warning("drive-scan: no credential for %s", DRIVE_SCAN_ACCOUNT)
        return
    try:
        r = requests.post(DRIVE_TOKEN_URL, data={
            "client_id": cred["client_id"], "client_secret": cred["client_secret"],
            "refresh_token": cred["refresh_token"], "grant_type": "refresh_token",
        }, timeout=30)
        r.raise_for_status()
        token = r.json()["access_token"]
    except Exception:
        logger.exception("drive-scan: token refresh failed")
        return
    headers = {"Authorization": f"Bearer {token}"}
    try:
        r = requests.get(
            "https://www.googleapis.com/drive/v3/files"
            "?q=name contains 'final-'&fields=files(id,name,mimeType)",
            headers=headers, timeout=30,
        )
        r.raise_for_status()
        files = r.json().get("files", [])
    except Exception:
        logger.exception("drive-scan: list failed")
        return
    with get_connection() as conn:
        tasks = conn.execute(
            "SELECT id, video_file, srt_file FROM video_dub_tasks"
            " WHERE status='done' AND video_file NOT LIKE 'drive:%'"
        ).fetchall()
    name_map: dict[str, str] = {}
    for f in files:
        name_map[f["name"]] = f["id"]
    for row in tasks:
        tid = int(row["id"])
        updates: dict[str, str] = {}
        for col in ("video_file", "srt_file"):
            stored = row[col] or ""
            if stored.startswith("drive:"):
                continue
            fid = name_map.get(stored)
            if fid:
                updates[col] = f"drive:{fid}"
        if updates:
            _update(tid, **updates)
            logger.info("drive-scan: linked task %s: %s", tid, updates)


def _drive_sync_loop() -> None:
    """Daemon thread: chạy quét lúc 2h sáng mỗi ngày + 1 lần khi khởi động."""
    # Chạy 1 lần ngay khi start
    time.sleep(5)
    _scan_drive_and_link()
    _last_scan_date = time.localtime().tm_yday
    while True:
        time.sleep(60)
        now = time.localtime()
        today = now.tm_yday
        if now.tm_hour == 2 and today != _last_scan_date:
            _last_scan_date = today
            _scan_drive_and_link()


# Start scheduler ở module import
threading.Thread(target=_drive_sync_loop, daemon=True).start()
