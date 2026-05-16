"""Video dubbing pipeline — ported from Express.js backend/video/services/core/.

Flow: download → STT → translate → TTS → mux audio → burn subtitles.
Uses checkpoint/resume so partial runs survive restarts.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess as sp
import tempfile
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

import edge_tts
import httpx
import yt_dlp
from dotenv import load_dotenv
from groq import Groq

# Load .env so GROQ_API_KEY etc. are available
load_dotenv(Path(__file__).resolve().parents[4] / ".env")

from api.services.db import get_connection

# ── paths ────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parents[5]
DATA_DIR = Path(os.getenv("HAGENT_DATA_DIR") or PROJECT_ROOT / "data")
UPLOAD_DIR = DATA_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

FFMPEG = shutil.which("ffmpeg-full") or "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe-full") or "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe"


# ── helpers ──────────────────────────────────────────────────────────────
def _tmp(suffix: str) -> str:
    return str(UPLOAD_DIR / f"vai-{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}{suffix}")


def _ffprobe_duration(path: str) -> float:
    try:
        r = sp.run(
            [FFPROBE, "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True, timeout=30
        )
        return float(r.stdout.strip())
    except Exception:
        return 0.0


def _run_ffmpeg(*args: str, timeout: int = 300) -> None:
    sp.run([FFMPEG, *args], check=True, capture_output=True, timeout=timeout)


# ── STT (Groq whisper) ──────────────────────────────────────────────────
def _stt_groq(audio_path: str, language_hint: str = "zh") -> list[dict]:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY chưa được cấu hình")
    client = Groq(api_key=api_key)
    size = os.path.getsize(audio_path)
    LIMIT = 24 * 1024 * 1024

    if size <= LIMIT:
        with open(audio_path, "rb") as f:
            r = client.audio.transcriptions.create(
                file=f,
                model="whisper-large-v3",
                response_format="verbose_json",
                timestamp_granularities=["segment"],
                language=language_hint,
            )
        segments_raw = (r.model_extra or {}).get("segments", []) if hasattr(r, "model_extra") else (r.segments or [])
        return [
            {"start": s["start"], "end": s["end"], "text": s.get("text", "").strip()}
            for s in segments_raw
            if s.get("text", "").strip()
        ]

    # Chunk for large files (>24MB)
    dur = _ffprobe_duration(audio_path)
    CHUNK = 600
    segments = []
    off = 0
    while off < dur:
        length = min(CHUNK, dur - off)
        chunk_path = _tmp(f".chunk{off}.mp3")
        _run_ffmpeg(
            "-y", "-i", audio_path,
            "-ss", str(off), "-t", str(length),
            "-c:a", "libmp3lame", chunk_path,
        )
        with open(chunk_path, "rb") as f:
            r = client.audio.transcriptions.create(
                file=f,
                model="whisper-large-v3",
                response_format="verbose_json",
                timestamp_granularities=["segment"],
                language=language_hint,
            )
        segments_raw = (r.model_extra or {}).get("segments", []) if hasattr(r, "model_extra") else (r.segments or [])
        for s in segments_raw:
            text = s.get("text", "").strip()
            if text:
                segments.append({"start": s["start"] + off, "end": s["end"] + off, "text": text})
        try:
            os.unlink(chunk_path)
        except OSError:
            pass
        off += CHUNK
    return segments


# ── Translate (Groq LLM) ────────────────────────────────────────────────
_SYSTEM_PROMPT = (
    "Dịch các câu tiếng Trung sau sang tiếng Việt tự nhiên, "
    "sinh động, ngắn gọn. Mỗi câu một dòng."
)


def _parse_numbered(text: str, n: int) -> list[str]:
    out = [""] * n
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        m = re.match(r"^(\d+)[.)\]:\-\s]+(.+)$", line)
        if m:
            idx = int(m.group(1)) - 1
            if 0 <= idx < n:
                out[idx] = m.group(2).strip()
    if all(not s for s in out):
        lines = [l for l in text.splitlines() if l.strip()]
        for i, l in enumerate(lines[:n]):
            out[i] = l.strip()
    return out


def _translate_groq(texts: list[str]) -> list[str]:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY chưa được cấu hình")
    client = Groq(api_key=api_key)
    numbered = "\n".join(f"{i + 1}. {t}" for i, t in enumerate(texts))
    r = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        temperature=0.3,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": numbered},
        ],
    )
    return _parse_numbered(r.choices[0].message.content, len(texts))


async def translate_batch(texts: list[str]) -> list[str]:
    """Translate in batches of 20 using Groq (sync call in executor)."""
    BATCH = 20
    out: list[str] = []
    loop = asyncio.get_event_loop()
    for i in range(0, len(texts), BATCH):
        batch = texts[i : i + BATCH]
        try:
            results = await loop.run_in_executor(None, _translate_groq, batch)
            out.extend(results)
        except Exception:
            for t in batch:
                try:
                    r = await loop.run_in_executor(None, _translate_groq, [t])
                    out.append(r[0] if r else "")
                except Exception:
                    out.append("")
    return out


# ── TTS (edge-tts) ──────────────────────────────────────────────────────
async def _tts_vietnamese(text: str, voice: str = "vi-VN-HoaiMyNeural") -> str | None:
    if not text or not text.strip():
        return None
    out = _tmp(".mp3")
    try:
        communicate = edge_tts.Communicate(text.strip(), voice)
        await communicate.save(out)
        if os.path.getsize(out) > 500:
            # trim leading silence
            trimmed = _tmp(".mp3")
            _run_ffmpeg(
                "-y", "-i", out,
                "-af", "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05",
                trimmed,
            )
            if os.path.getsize(trimmed) > 500:
                try:
                    os.unlink(out)
                except OSError:
                    pass
                return trimmed
            try:
                os.unlink(trimmed)
            except OSError:
                pass
            return out
        try:
            os.unlink(out)
        except OSError:
            pass
    except Exception:
        pass
    return None


# ── SRT / ASS helpers ────────────────────────────────────────────────────
def _build_srt(segments: list[dict]) -> str:
    def _fmt(t: float) -> str:
        h = int(t // 3600)
        m = int((t % 3600) // 60)
        s = int(t % 60)
        ms = int((t % 1) * 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

    lines = []
    for i, seg in enumerate(segments):
        vi = seg.get("vi", "") or ""
        start = seg.get("start", 0)
        end = seg.get("end", 0)
        if start < end:
            lines.append(f"{i + 1}\n{_fmt(start)} --> {_fmt(end)}\n{vi}\n")
    return "\n".join(lines)


def _srt2ass(srt: str) -> str:
    header = (
        "[Script Info]\nScriptType: v4.00+\nWrapStyle: 0\n"
        "ScaledBorderAndShadow: yes\nPlayResX: 384\nPlayResY: 288\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        "Style: Default,Arial,18,&H0000FFFF,&H0000FFFF,&H00000000,"
        "&H64000000,0,0,0,0,100,100,0,0,3,1,0,2,10,10,20,0\n\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )
    body = []
    for block in srt.replace("\r\n", "\n").split("\n\n"):
        block = block.strip()
        if not block:
            continue
        lines = block.split("\n")
        idx = -1
        for j, l in enumerate(lines):
            if "-->" in l:
                idx = j
                break
        if idx == -1:
            continue
        start_end = lines[idx].split(" --> ")
        start = start_end[0].replace(",", ".").strip()
        end = start_end[1].replace(",", ".").strip()
        text = "\\N".join(lines[idx + 1:]).strip()
        body.append(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{text}")
    return header + "\n".join(body)


# ── Checkpoint ───────────────────────────────────────────────────────────
def _checkpoint_path(task_id: int) -> Path:
    return UPLOAD_DIR / f"ckpt-{task_id}.json"


def _save_checkpoint(task_id: int, data: dict) -> None:
    _checkpoint_path(task_id).write_text(json.dumps(data, ensure_ascii=False))


def _load_checkpoint(task_id: int) -> dict | None:
    p = _checkpoint_path(task_id)
    if p.exists():
        try:
            return json.loads(p.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return None


def _clear_checkpoint(task_id: int) -> None:
    p = _checkpoint_path(task_id)
    try:
        p.unlink()
    except OSError:
        pass


# ── YouTube metadata ────────────────────────────────────────────────────
async def _fetch_yt_info(url: str) -> dict | None:
    """Fetch YouTube video info using yt-dlp."""
    try:
        with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True}) as ydl:
            info = ydl.extract_info(url, download=False)
            return {"title": info.get("title", ""), "duration": info.get("duration", 0)}
    except Exception:
        return None


async def _fetch_bilibili_metadata(url: str) -> dict | None:
    """Fetch Bilibili video metadata via API."""
    bv = re.search(r"BV1[\w\dA-Za-z0-9]+", url)
    if not bv:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"https://api.bilibili.com/x/web-interface/view?bvid={bv.group(0)}",
                headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"},
            )
            data = r.json()
            if data.get("code") == 0 and data.get("data"):
                d = data["data"]
                return {"title": d.get("title", ""), "duration": d.get("duration", 0)}
    except Exception:
        pass
    return None


# ── Download ─────────────────────────────────────────────────────────────
def _download_video(url: str, output_path: str, send: Callable) -> None:
    """Download video using yt-dlp."""
    base = output_path.replace(".mp4", "")
    opts = {
        "format": "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b/best",
        "outtmpl": f"{base}.%(id)s.%(ext)s",
        "quiet": True,
        "no_warnings": True,
        "retries": 5,
        "no_check_certificates": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        try:
            ydl.download([url])
        except Exception as e1:
            err_msg = str(e1)
            if not any(kw in err_msg for kw in ("Sign in", "age", "private", "members")):
                raise
            send("Thử lại với cookie Chrome...")
            opts["cookies_from_browser"] = "chrome"
            with yt_dlp.YoutubeDL(opts) as ydl2:
                ydl2.download([url])

    # Find and rename the downloaded file
    dir_path = os.path.dirname(output_path)
    prefix = os.path.basename(base)
    files = [f for f in os.listdir(dir_path) if f.startswith(prefix) and f.endswith(".mp4")]
    if files:
        os.rename(os.path.join(dir_path, files[0]), output_path)

    # Handle separate video+audio tracks
    all_files = [f for f in os.listdir(dir_path) if f.startswith(prefix)]
    vid_file = next((f for f in all_files if re.search(r"\.f\d+\.mp4$", f)), None)
    aud_file = next((f for f in all_files if re.search(r"\.f\d+\.m4a$", f)), None)
    if vid_file and aud_file:
        _run_ffmpeg(
            "-i", os.path.join(dir_path, vid_file),
            "-i", os.path.join(dir_path, aud_file),
            "-c:v", "copy", "-c:a", "aac", "-y", output_path,
        )
        for f in [vid_file, aud_file]:
            try:
                os.unlink(os.path.join(dir_path, f))
            except OSError:
                pass
    elif vid_file and not os.path.exists(output_path):
        os.rename(os.path.join(dir_path, vid_file), output_path)

    if not os.path.exists(output_path) or os.path.getsize(output_path) < 1024:
        raise RuntimeError("yt-dlp không tải được video")


# ── Aligned dub track ────────────────────────────────────────────────────
def _build_aligned_dub_track(segments: list[dict]) -> str | None:
    usable = [s for s in segments if s.get("tts_path")]
    if not usable:
        return None

    # Build concat list
    list_path = _tmp(".txt")
    with open(list_path, "w") as f:
        f.write("\n".join(f"file '{s['tts_path']}'" for s in usable))

    out_path = _tmp(".mp3")
    _run_ffmpeg("-f", "concat", "-safe", "0", "-i", list_path, "-c", "copy", "-y", out_path)
    try:
        os.unlink(list_path)
    except OSError:
        pass

    audio_cursor = 0.0
    prev_sub_end = 0.0
    for seg in usable:
        dur = _ffprobe_duration(seg["tts_path"])
        if dur < 0.01:
            dur = 0.5
        audio_start = audio_cursor
        audio_end = audio_cursor + dur
        sub_start = max(prev_sub_end, audio_start - 1.0)
        seg["start"] = sub_start
        seg["end"] = sub_start + dur - 0.05
        prev_sub_end = seg["end"]
        audio_cursor = audio_end

    return out_path


def _mux_audio(video_path: str, dub_path: str, out_path: str) -> None:
    _run_ffmpeg(
        "-i", video_path, "-i", dub_path,
        "-map", "0:v:0", "-map", "1:a",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart", "-y", out_path,
    )


def _burn_subtitles(video_path: str, srt_path: str, out_path: str) -> None:
    srt = Path(srt_path).read_text(encoding="utf-8")
    ass_content = _srt2ass(srt)
    ass_path = srt_path.replace(".srt", ".ass")
    Path(ass_path).write_text(ass_content, encoding="utf-8")
    escaped_ass = ass_path.replace("\\", "\\\\").replace(":", "\\:")
    try:
        _run_ffmpeg(
            "-i", video_path,
            "-filter_complex",
            f"[0:v]drawbox=x=0:y=ih*7/8:w=iw:h=ih/8:color=white@0.5:t=fill[w];"
            f"[w]ass={escaped_ass}[out]",
            "-map", "[out]", "-map", "0:a",
            "-c:v", "libx264", "-crf", "22", "-preset", "fast",
            "-c:a", "copy", "-y", out_path,
        )
    finally:
        try:
            os.unlink(ass_path)
        except OSError:
            pass


# ── Queue / SSE ──────────────────────────────────────────────────────────
class VideoQueue:
    """Async queue for video processing tasks with SSE broadcast."""

    _queue: asyncio.Queue[int] = asyncio.Queue()
    _worker_busy = False
    _sse_clients: dict[int, list[asyncio.Queue]] = {}

    @classmethod
    def enqueue(cls, task_id: int) -> None:
        cls._queue.put_nowait(task_id)
        asyncio.create_task(cls._pump())

    @classmethod
    async def _pump(cls) -> None:
        if cls._worker_busy:
            return
        cls._worker_busy = True
        try:
            task_id = await cls._queue.get()
            await run_pipeline(task_id)
        finally:
            cls._worker_busy = False
            if not cls._queue.empty():
                asyncio.create_task(cls._pump())

    @classmethod
    def subscribe(cls, task_id: int) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        cls._sse_clients.setdefault(task_id, []).append(q)
        return q

    @classmethod
    def unsubscribe(cls, task_id: int, queue: asyncio.Queue) -> None:
        if task_id in cls._sse_clients:
            cls._sse_clients[task_id] = [q for q in cls._sse_clients[task_id] if q is not queue]

    @classmethod
    def broadcast(cls, task_id: int, message: str) -> None:
        for q in cls._sse_clients.get(task_id, []):
            q.put_nowait(message)


def make_sender(task_id: int) -> Callable[[str], None]:
    """Create a send() closure that logs + saves + broadcasts progress."""
    conn = get_connection()
    row = conn.execute("SELECT progress FROM video_tasks WHERE id=?", (task_id,)).fetchone()
    log_arr: list[dict] = []
    if row and row["progress"]:
        try:
            parsed = json.loads(row["progress"])
            if isinstance(parsed, list):
                log_arr = parsed
        except (json.JSONDecodeError, TypeError):
            pass
    conn.close()

    def send(msg: str) -> None:
        nonlocal log_arr
        log_arr.append({"t": int(time.time() * 1000), "m": msg})
        if len(log_arr) > 500:
            log_arr = log_arr[-500:]
        conn2 = get_connection()
        conn2.execute(
            "UPDATE video_tasks SET progress=?, updated_at=? WHERE id=?",
            (json.dumps(log_arr, ensure_ascii=False), int(time.time() * 1000), task_id),
        )
        conn2.commit()
        conn2.close()
        VideoQueue.broadcast(task_id, msg)

    return send


# ── Metadata generator ──────────────────────────────────────────────────
_META_PROMPT = (
    "Từ nội dung video dưới đây, viết title hấp dẫn dưới 70 ký tự, "
    "description ngắn 2-3 câu, và 5-10 tags.\n"
    "Trả về:\nTITLE: ...\nDESC: ...\nTAGS: tag1, tag2, ..."
)


def _generate_video_meta(vi_texts: list[str]) -> dict:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        return {"title": "Video hoang dã", "desc": "", "tags": ""}
    client = Groq(api_key=api_key)
    sample = " ".join(vi_texts[:15])
    r = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        temperature=0.7,
        messages=[
            {"role": "system", "content": _META_PROMPT},
            {"role": "user", "content": sample},
        ],
    )
    text = r.choices[0].message.content
    title = (re.search(r"TITLE:\s*(.+)", text).group(1).strip()
             if re.search(r"TITLE:\s*(.+)", text) else "Video hoang dã")
    desc = (re.search(r"DESC:\s*(.+)", text).group(1).strip()
            if re.search(r"DESC:\s*(.+)", text) else "")
    tags = (re.search(r"TAGS:\s*(.+)", text).group(1).strip()
            if re.search(r"TAGS:\s*(.+)", text) else "")
    return {"title": title, "desc": desc, "tags": tags}


# ── Main pipeline ────────────────────────────────────────────────────────
async def run_pipeline(task_id: int) -> None:
    """Run the full video dubbing pipeline with checkpoint/resume."""
    conn = get_connection()
    task = conn.execute("SELECT * FROM video_tasks WHERE id=?", (task_id,)).fetchone()
    conn.close()
    if not task:
        return

    send = make_sender(task_id)
    conn2 = get_connection()
    conn2.execute(
        "UPDATE video_tasks SET status=?, updated_at=? WHERE id=?",
        ("running", int(time.time() * 1000), task_id),
    )
    conn2.commit()
    conn2.close()

    temp_files: list[str] = []
    def _track(f: str | None) -> str | None:
        if f:
            temp_files.append(f)
        return f
    def _rm(f: str | None) -> None:
        if f and os.path.exists(f):
            try:
                os.unlink(f)
            except OSError:
                pass

    video_path: str | None = None
    segments: list[dict] | None = None
    final_path: str | None = None
    srt_path: str | None = None

    checkpoint = _load_checkpoint(task_id)

    try:
        # ── Step 1: Download ──
        if checkpoint and checkpoint.get("step") != "download":
            video_path = checkpoint.get("video_path")
            segments = checkpoint.get("segments")
            if video_path and not os.path.exists(video_path):
                checkpoint = None
                _clear_checkpoint(task_id)

        if not checkpoint or checkpoint.get("step") == "download":
            if task["source_type"] != "upload":
                send("Đang tải từ URL...")
                video_path = _track(_tmp(".mp4"))
                try:
                    await asyncio.get_event_loop().run_in_executor(
                        None, _download_video, task["source_ref"], video_path, send
                    )
                except Exception as e:
                    # Try with cookies
                    if "cookies" in str(e).lower():
                        raise
                    raise
                size_mb = os.path.getsize(video_path) / 1024 / 1024
                send(f"Đã tải ({size_mb:.1f} MB)")
            else:
                video_path = str(UPLOAD_DIR / task["source_ref"])

            dur = _ffprobe_duration(video_path)
            send(f"📹 Video: {int(dur // 60)}:{int(dur % 60):02d}")
            _save_checkpoint(task_id, {"step": "download", "video_path": video_path})

        # ── Step 2: STT ──
        if checkpoint and checkpoint.get("step") == "stt":
            segments = checkpoint.get("segments")

        if segments is None:
            send("🔊 Đang tách audio...")
            audio_path = _track(_tmp(".mp3"))
            _run_ffmpeg(
                "-y", "-i", video_path,
                "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k",
                audio_path,
            )
            engine = os.environ.get("STT_ENGINE", "groq")
            send(f"🎤 Đang nhận diện thoại ({engine})...")
            if engine == "whisper-local":
                raise RuntimeError("whisper-local chưa được port, dùng STT_ENGINE=groq")
            raw = _stt_groq(audio_path)
            send(f"✅ {len(raw)} đoạn thoại")
            # Deduplicate
            segments = []
            for i, s in enumerate(raw):
                if i == 0:
                    segments.append(s)
                else:
                    prev = raw[i - 1]
                    if s["text"].strip() == prev["text"].strip():
                        continue
                    if s["start"] < prev["end"] - 0.05:
                        continue
                    s["end"] = min(s["end"], s["start"] + 5)
                    segments.append(s)
            _save_checkpoint(task_id, {"step": "stt", "video_path": video_path, "segments": segments})

        # ── Step 3: Translate ──
        if segments and not segments[0].get("vi"):
            send("🌐 Đang dịch sang tiếng Việt...")
            vi_texts = await translate_batch([s["text"] for s in segments])
            for s, vi in zip(segments, vi_texts):
                s["vi"] = vi or ""
            _save_checkpoint(task_id, {"step": "translate", "video_path": video_path, "segments": segments})

        # ── Step 4: TTS ──
        if segments and not segments[0].get("tts_path"):
            voice_map = {"hoaimy": "vi-VN-HoaiMyNeural", "namminh": "vi-VN-NamMinhNeural"}
            voice = voice_map.get(task["voice"], "vi-VN-HoaiMyNeural")
            texts_to_speak = [(i, s.get("vi", "")) for i, s in enumerate(segments) if s.get("vi")]
            if texts_to_speak:
                send(f"🔊 Đang sinh giọng đọc ({len(texts_to_speak)} câu, {voice})...")
                sem = asyncio.Semaphore(2)

                async def _do_tts(idx: int, txt: str) -> str | None:
                    async with sem:
                        return await _tts_vietnamese(txt, voice)

                tasks = [_do_tts(idx, txt) for idx, txt in texts_to_speak]
                results = await asyncio.gather(*tasks)
                for (idx, _), tts_path in zip(texts_to_speak, results):
                    segments[idx]["tts_path"] = _track(tts_path)

                # Time-stretch TTS to fit video duration
                v_dur = _ffprobe_duration(video_path) or 60
                total_tts = 0.0
                for s in segments:
                    if s.get("tts_path"):
                        total_tts += _ffprobe_duration(s["tts_path"]) or 0.5
                atempo = max(0.5, min(total_tts / v_dur, 2.0))
                if abs(atempo - 1.0) > 0.02:
                    send(f"⏱ Co dãn {atempo * 100:.0f}% cho vừa video")
                    for s in segments:
                        if not s.get("tts_path"):
                            continue
                        fast = _tmp(".mp3")
                        _run_ffmpeg(
                            "-y", "-i", s["tts_path"],
                            "-af", f"atempo={atempo:.3f}",
                            fast,
                        )
                        _rm(s["tts_path"])
                        s["tts_path"] = _track(fast)

            _save_checkpoint(task_id, {"step": "tts", "video_path": video_path, "segments": segments})

        # ── Step 5: Mux + subtitles ──
        if checkpoint and checkpoint.get("step") == "mux":
            final_path = checkpoint.get("final_path")
            srt_path = checkpoint.get("srt_path")

        if not final_path or not os.path.exists(final_path):
            send(f"🎚️ Ghép {len([s for s in segments if s.get('tts_path')])} clip TTS...")
            dub_track = _build_aligned_dub_track(segments)
            if dub_track:
                send("🎚️ Ghép âm...")
                mixed = _track(_tmp(".mp4"))
                _mux_audio(video_path, dub_track, mixed)
            else:
                mixed = video_path

            send("📝 Chèn phụ đề...")
            srt_path = str(UPLOAD_DIR / f"subs-{task_id}.srt")
            Path(srt_path).write_text(_build_srt(segments), encoding="utf-8")
            final_path = str(UPLOAD_DIR / f"final-{int(time.time()*1000)}.mp4")
            _burn_subtitles(mixed, srt_path, final_path)
            _save_checkpoint(task_id, {
                "step": "mux", "video_path": video_path, "segments": segments,
                "final_path": final_path, "srt_path": srt_path,
            })

        # ── Done ──
        send("✅ Hoàn tất!")
        total_duration = _ffprobe_duration(video_path)

        # Generate video meta
        yt_title = task["title"]
        vi_texts = [s.get("vi", "") for s in segments if s.get("vi")]
        if vi_texts:
            try:
                meta = await asyncio.get_event_loop().run_in_executor(
                    None, _generate_video_meta, vi_texts
                )
                yt_title = meta["title"]
                conn3 = get_connection()
                conn3.execute(
                    "UPDATE video_tasks SET yt_desc=?, yt_tags=? WHERE id=?",
                    (meta["desc"], meta["tags"], task_id),
                )
                conn3.commit()
                conn3.close()
                send(f"📺 Tiêu đề: {yt_title}")
            except Exception:
                pass

        conn4 = get_connection()
        conn4.execute(
            "UPDATE video_tasks SET status='done', video_file=?, srt_file=?, "
            "segments_count=?, duration=?, title=?, updated_at=? WHERE id=?",
            (
                os.path.basename(final_path) if final_path else None,
                os.path.basename(srt_path) if srt_path else None,
                len([s for s in segments if s.get("tts_path")]),
                total_duration,
                yt_title,
                int(time.time() * 1000),
                task_id,
            ),
        )
        conn4.commit()
        conn4.close()

        if task["source_type"] != "upload":
            try:
                os.unlink(video_path)
            except OSError:
                pass
        _clear_checkpoint(task_id)

    except Exception as e:
        send(f"❌ Lỗi: {e}")
        conn5 = get_connection()
        conn5.execute(
            "UPDATE video_tasks SET status='error', error=?, updated_at=? WHERE id=?",
            (str(e), int(time.time() * 1000), task_id),
        )
        conn5.commit()
        conn5.close()
    finally:
        for f in temp_files:
            _rm(f)
