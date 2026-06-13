import asyncio
import base64
import binascii
import html
import json
import os
import re
import shutil
import subprocess
import time
import unicodedata
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from api.routers.auth import _get_user_id
from api.services.db import DATA_DIR, get_connection

router = APIRouter(prefix="/api/entertainment", tags=["entertainment"])
DEFAULT_VIDEO_CATEGORIES = [
    ("travel", "Du lịch"),
    ("ai", "AI"),
    ("life", "Cuộc sống"),
    ("english", "Tiếng Anh"),
    ("other", "Khác"),
]
NON_SPEECH_CUES = {
    "music",
    "musics",
    "background music",
    "intro music",
    "outro music",
    "theme music",
    "music playing",
    "music continues",
    "instrumental",
    "song",
    "singing",
    "applause",
    "clapping",
    "cheering",
    "laughter",
    "laughs",
    "silence",
    "am nhac",
    "nhac",
    "tieng nhac",
    "nhac nen",
    "vo tay",
    "tieng vo tay",
    "cuoi",
    "tieng cuoi",
    "im lang",
}


class VideoLinkIn(BaseModel):
    title: str = ""
    input: str = ""
    src: str
    open_url: str = ""
    video_type: str = "embed"
    category: str = "other"
    source_lang: str = ""
    reset_progress: bool = False


class QuickDubIn(BaseModel):
    url: str
    video_id: int | None = None
    translate_provider: str = "google"
    translate_model: str = "llama-3.3-70b-versatile"
    max_segments: int = 1000
    start_at: float = 0


class VideoProgressIn(BaseModel):
    position: float = 0
    duration: float = 0


class VideoCategoryIn(BaseModel):
    category: str = "other"


class VideoCategoryCreateIn(BaseModel):
    id: str = ""
    label: str = ""


class VideoSnapshotIn(BaseModel):
    title: str = ""
    video_id: int | None = None
    video_type: str = "embed"
    url: str = ""
    image_data: str = ""
    position: float = 0


class VideoSnapshotUpdateIn(BaseModel):
    url: str = ""
    title: str = ""


def _video_category(value: str) -> str:
    return _video_category_id(value) or "other"


def _video_category_id(value: str) -> str:
    text = (value or "").strip().replace("Đ", "D").replace("đ", "d")
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    return slug[:48]


def _ensure_video_category_table(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS entertainment_video_categories (
            id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            label TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, id)
        )
        """
    )


def _ensure_default_video_categories(conn, user_id: str) -> None:
    _ensure_video_category_table(conn)
    now = int(time.time() * 1000)
    for index, (category_id, label) in enumerate(DEFAULT_VIDEO_CATEGORIES):
        conn.execute(
            """
            INSERT OR IGNORE INTO entertainment_video_categories
                (id, user_id, label, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (category_id, user_id, label, index * 10, now, now),
        )


def _row_to_video_category(row) -> dict:
    category_id = _video_category(row["id"])
    return {
        "id": category_id,
        "label": row["label"] or category_id,
        "sortOrder": row["sort_order"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "system": category_id in {item[0] for item in DEFAULT_VIDEO_CATEGORIES},
    }


def _normalize_source_lang(value: str) -> str:
    return re.sub(r"[^a-z0-9-]", "", (value or "").strip().lower().replace("_", "-"))[:24]


def _is_vi_lang(value: str) -> bool:
    return _normalize_source_lang(value).startswith("vi")


def _row_to_video(row) -> dict:
    source_lang = _normalize_source_lang(row["source_lang"] if "source_lang" in row.keys() else "")
    return {
        "id": row["id"],
        "title": row["title"],
        "input": row["input"],
        "src": row["src"],
        "openUrl": row["open_url"],
        "type": row["video_type"],
        "category": _video_category(row["category"]),
        "sourceLang": source_lang,
        "progressPosition": row["progress_position"],
        "progressDuration": row["progress_duration"],
        "watchedAt": row["watched_at"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _slugify_title(value: str) -> str:
    title = (value or "video").strip().replace("Đ", "D").replace("đ", "d")
    normalized = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    return (slug or "video")[:90]


def _snapshot_path(title: str, ext: str, position: float) -> Path:
    slug = _slugify_title(title)
    stamp = time.strftime("%Y%m%d-%H%M%S", time.localtime())
    millis = int(time.time() * 1000) % 1000
    seconds = max(0, int(position or 0))
    out_dir = DATA_DIR / "entertainment" / "captures" / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir / f"{slug}_{stamp}-{millis:03d}_{seconds}s.{ext}"


def _snapshot_payload(path: Path) -> dict:
    return {"ok": True, **_snapshot_item(path)}


def _snapshot_item(path: Path) -> dict:
    stat = path.stat()
    rel = path.relative_to(DATA_DIR / "entertainment").as_posix()
    match = re.search(r"_(\d+)s\.[^.]+$", path.name)
    return {
        "filename": path.name,
        "title": path.parent.name.replace("-", " "),
        "url": f"/data/entertainment/{rel}",
        "path": str(path),
        "size": stat.st_size,
        "createdAt": int(stat.st_mtime * 1000),
        "position": int(match.group(1)) if match else 0,
    }


def _list_snapshot_items(limit: int = 80) -> list[dict]:
    root = DATA_DIR / "entertainment" / "captures"
    if not root.exists():
        return []
    files = [
        path
        for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
    ]
    files.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    return [_snapshot_item(path) for path in files[: max(1, min(limit, 300))]]


def _resolve_snapshot_delete_path(value: str) -> Path:
    raw = urllib.parse.unquote((value or "").split("?", 1)[0]).strip()
    if raw.startswith("/data/entertainment/"):
        rel = raw.removeprefix("/data/entertainment/")
    elif raw.startswith("data/entertainment/"):
        rel = raw.removeprefix("data/entertainment/")
    else:
        rel = raw.lstrip("/")
    if not rel.startswith("captures/"):
        rel = f"captures/{rel}"
    root = (DATA_DIR / "entertainment" / "captures").resolve()
    path = (DATA_DIR / "entertainment" / rel).resolve()
    if not path.is_relative_to(root) or path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=400, detail="Đường dẫn ảnh không hợp lệ")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Không tìm thấy ảnh")
    return path


def _rename_snapshot(value: str, title: str) -> Path:
    src = _resolve_snapshot_delete_path(value)
    slug = _slugify_title(title)
    if not slug:
        raise HTTPException(status_code=400, detail="Tên ảnh không hợp lệ")
    suffix_match = re.match(r"^[^_]+(_\d{8}-\d{6}-\d{3}_\d+s\.[^.]+)$", src.name)
    suffix = suffix_match.group(1) if suffix_match else f"_{int(time.time())}s{src.suffix.lower()}"
    out_dir = DATA_DIR / "entertainment" / "captures" / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    dst = out_dir / f"{slug}{suffix}"
    if dst.exists() and dst != src:
        dst = out_dir / f"{slug}_{int(time.time() * 1000)}{src.suffix.lower()}"
    src.rename(dst)
    try:
        src.parent.rmdir()
    except OSError:
        pass
    return dst


def _save_snapshot_image_data(image_data: str, title: str, position: float) -> Path:
    match = re.match(r"^data:image/(png|jpe?g|webp);base64,(.+)$", image_data or "", re.S | re.I)
    if not match:
        raise HTTPException(status_code=400, detail="image_data không đúng định dạng ảnh base64")
    ext = "jpg" if match.group(1).lower() in {"jpg", "jpeg"} else match.group(1).lower()
    try:
        raw = base64.b64decode(match.group(2), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="image_data base64 không hợp lệ") from exc
    if len(raw) > 30 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Ảnh chụp quá lớn")
    out_path = _snapshot_path(title, ext, position)
    out_path.write_bytes(raw)
    return out_path


def _ensure_http_url(value: str) -> str:
    url = (value or "").strip()
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Video này không có URL http/https để backend chụp")
    return url


def _snapshot_stream_url(url: str) -> tuple[str, dict]:
    parsed = urllib.parse.urlsplit(url)
    host = parsed.netloc.lower().removeprefix("www.")
    is_youtube = host in {"youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "youtu.be"}
    if not is_youtube:
        return url, {}

    import yt_dlp

    errors = []
    for browser in ("chrome", "brave", "chromium", "safari", None):
        opts = _yt_dlp_caption_options(browser)
        opts.update({
            "format": "bestvideo[height<=2160][ext=mp4]/bestvideo[height<=2160]/best[height<=2160]/best",
        })
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
            stream_url = info.get("url")
            if stream_url:
                return stream_url, info.get("http_headers") or {}
        except Exception as exc:
            errors.append(str(exc))
    detail = errors[-1] if errors else "Không lấy được stream YouTube"
    raise RuntimeError(detail)


def _capture_snapshot_with_ffmpeg(url: str, title: str, position: float) -> Path:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("Máy chưa có ffmpeg nên chưa chụp được frame video")
    stream_url, headers = _snapshot_stream_url(_ensure_http_url(url))
    out_path = _snapshot_path(title, "jpg", position)
    seek = max(0.0, float(position or 0))
    pre_seek = max(0.0, seek - 1.0)
    post_seek = seek - pre_seek
    args = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error"]
    if headers:
        args.extend(["-headers", "".join(f"{key}: {value}\r\n" for key, value in headers.items())])
    if pre_seek > 0:
        args.extend(["-ss", f"{pre_seek:.3f}"])
    args.extend(["-i", stream_url])
    if post_seek > 0:
        args.extend(["-ss", f"{post_seek:.3f}"])
    args.extend(["-frames:v", "1", "-q:v", "2", str(out_path)])
    proc = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=90)
    if proc.returncode != 0 or not out_path.exists() or out_path.stat().st_size == 0:
        out_path.unlink(missing_ok=True)
        detail = (proc.stderr or proc.stdout or "ffmpeg không tạo được ảnh").strip()[-500:]
        raise RuntimeError(detail)
    return out_path


def _caption_cache_key(url: str) -> str:
    value = (url or "").strip()
    try:
        parsed = urllib.parse.urlsplit(value)
        host = parsed.netloc.lower().removeprefix("www.")
        query = urllib.parse.parse_qs(parsed.query)
        video_id = query.get("v", [""])[0]
        if host in {"youtube.com", "m.youtube.com", "music.youtube.com"} and video_id:
            return f"youtube:{video_id}"
        if host == "youtu.be":
            video_id = parsed.path.strip("/").split("/")[0]
            if video_id:
                return f"youtube:{video_id}"
    except Exception:
        pass
    return value


def _caption_cue_key(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", normalized.lower()).strip()


def _is_non_speech_cue(text: str) -> bool:
    key = _caption_cue_key(text)
    return not key or key in NON_SPEECH_CUES


def _clean_caption_for_tts(text: str) -> str:
    clean = html.unescape(text or "")
    clean = re.sub(r"<[^>]+>", " ", clean)
    clean = re.sub(r"^\s*(?:>{1,}|[›»]{1,})\s*", "", clean)
    clean = re.sub(r"[<>]+", " ", clean)
    clean = re.sub(r"\[\s*[_\W]+\s*\]", " ", clean)
    clean = re.sub(
        r"[\[\(【{]\s*([^\]\)】}]{0,80})\s*[\]\)】}]",
        lambda match: " " if _is_non_speech_cue(match.group(1)) else match.group(0),
        clean,
    )
    clean = re.sub(r"\s+", " ", clean).strip()
    cue = clean.strip("[](){}【】♪♫♬♩-–—:：.。!！ ")
    if _is_non_speech_cue(cue):
        return ""
    return clean


def _load_cached_captions(user_id: str, url: str) -> dict | None:
    key = _caption_cache_key(url)
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT title, source_lang, segments_json, updated_at
            FROM entertainment_video_captions
            WHERE user_id=? AND url_key=?
            """,
            (user_id, key),
        ).fetchone()
    if not row:
        return None
    try:
        segments = json.loads(row["segments_json"] or "[]")
    except Exception:
        segments = []
    if not isinstance(segments, list) or not segments:
        return None
    cleaned_segments = []
    changed = False
    for segment in segments:
        text = _clean_caption_for_tts(segment.get("text", ""))
        if text:
            cleaned_segments.append({**segment, "text": text})
        if text != segment.get("text", ""):
            changed = True
    segments = cleaned_segments
    if not segments:
        return None
    if changed:
        _save_cached_captions(user_id, url, row["title"], row["source_lang"], segments)
    return {
        "title": row["title"],
        "source_lang": _normalize_source_lang(row["source_lang"]),
        "sourceLang": _normalize_source_lang(row["source_lang"]),
        "segments": segments,
        "cached": True,
        "cachedAt": row["updated_at"],
    }


def _save_cached_captions(user_id: str, url: str, title: str, source_lang: str, segments: list[dict]) -> None:
    key = _caption_cache_key(url)
    now = int(time.time() * 1000)
    source_lang = _normalize_source_lang(source_lang)
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO entertainment_video_captions
                (user_id, url_key, title, source_lang, segments_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, url_key) DO UPDATE SET
                title=excluded.title,
                source_lang=excluded.source_lang,
                segments_json=excluded.segments_json,
                updated_at=excluded.updated_at
            """,
            (
                user_id,
                key,
                title or "",
                source_lang or "",
                json.dumps(segments, ensure_ascii=False),
                now,
                now,
            ),
        )
        conn.commit()


def _update_video_source_lang(user_id: str, video_id: int | None, url: str, source_lang: str) -> dict | None:
    lang = _normalize_source_lang(source_lang)
    if not lang:
        return None
    now = int(time.time() * 1000)
    row = None
    with get_connection() as conn:
        if video_id is not None:
            conn.execute(
                """
                UPDATE entertainment_videos
                SET source_lang=?, updated_at=?
                WHERE user_id=? AND id=?
                """,
                (lang, now, user_id, video_id),
            )
            row = conn.execute(
                """
                SELECT id, title, input, src, open_url, video_type, category, source_lang,
                       progress_position, progress_duration, watched_at,
                       created_at, updated_at
                FROM entertainment_videos
                WHERE user_id=? AND id=?
                """,
                (user_id, video_id),
            ).fetchone()
        if not row and url:
            conn.execute(
                """
                UPDATE entertainment_videos
                SET source_lang=?, updated_at=?
                WHERE user_id=? AND (open_url=? OR input=? OR src=?)
                """,
                (lang, now, user_id, url, url, url),
            )
            row = conn.execute(
                """
                SELECT id, title, input, src, open_url, video_type, category, source_lang,
                       progress_position, progress_duration, watched_at,
                       created_at, updated_at
                FROM entertainment_videos
                WHERE user_id=? AND (open_url=? OR input=? OR src=?)
                ORDER BY updated_at DESC, id DESC
                LIMIT 1
                """,
                (user_id, url, url, url),
            ).fetchone()
        conn.commit()
    return _row_to_video(row) if row else None


@router.get("/videos")
def list_videos(request: Request):
    user_id = _get_user_id(request)
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, title, input, src, open_url, video_type, category, source_lang,
                   progress_position, progress_duration, watched_at,
                   created_at, updated_at
            FROM entertainment_videos
            WHERE user_id=?
            ORDER BY updated_at DESC, id DESC
            """,
            (user_id,),
        ).fetchall()
    return {"videos": [_row_to_video(row) for row in rows]}


@router.get("/videos/categories")
def list_video_categories(request: Request):
    user_id = _get_user_id(request)
    with get_connection() as conn:
        _ensure_default_video_categories(conn, user_id)
        rows = conn.execute(
            """
            SELECT id, label, sort_order, created_at, updated_at
            FROM entertainment_video_categories
            WHERE user_id=?
            ORDER BY sort_order ASC, LOWER(label) ASC
            """,
            (user_id,),
        ).fetchall()
        conn.commit()
    return {"categories": [_row_to_video_category(row) for row in rows]}


@router.post("/videos/categories")
def add_video_category(body: VideoCategoryCreateIn, request: Request):
    user_id = _get_user_id(request)
    label = re.sub(r"\s+", " ", (body.label or "").strip())[:40]
    if not label:
        raise HTTPException(status_code=400, detail="label is required")
    category_id = _video_category_id(body.id) or _video_category_id(label)
    if not category_id or category_id == "all":
        raise HTTPException(status_code=400, detail="category id is invalid")
    now = int(time.time() * 1000)
    with get_connection() as conn:
        _ensure_default_video_categories(conn, user_id)
        row = conn.execute(
            """
            SELECT COALESCE(MAX(sort_order), 0) AS max_order
            FROM entertainment_video_categories
            WHERE user_id=?
            """,
            (user_id,),
        ).fetchone()
        sort_order = int(row["max_order"] or 0) + 10
        conn.execute(
            """
            INSERT INTO entertainment_video_categories
                (id, user_id, label, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, id) DO UPDATE SET
                label=excluded.label,
                updated_at=excluded.updated_at
            """,
            (category_id, user_id, label, sort_order, now, now),
        )
        saved = conn.execute(
            """
            SELECT id, label, sort_order, created_at, updated_at
            FROM entertainment_video_categories
            WHERE user_id=? AND id=?
            """,
            (user_id, category_id),
        ).fetchone()
        conn.commit()
    return {"category": _row_to_video_category(saved)}


@router.post("/videos")
def save_video(body: VideoLinkIn, request: Request):
    user_id = _get_user_id(request)
    src = body.src.strip()
    if not src:
        raise HTTPException(status_code=400, detail="src is required")
    now = int(time.time() * 1000)
    video_type = body.video_type if body.video_type in {"youtube", "direct", "embed"} else "embed"
    category = _video_category(body.category)
    source_lang = _normalize_source_lang(body.source_lang)
    title = body.title.strip() or src
    input_url = body.input.strip() or src
    open_url = body.open_url.strip() or input_url
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO entertainment_videos
                (user_id, title, input, src, open_url, video_type, category, source_lang, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, src) DO UPDATE SET
                title=excluded.title,
                input=excluded.input,
                open_url=excluded.open_url,
                video_type=excluded.video_type,
                category=excluded.category,
                source_lang=CASE
                    WHEN excluded.source_lang != '' THEN excluded.source_lang
                    ELSE entertainment_videos.source_lang
                END,
                progress_position=CASE
                    WHEN ? THEN 0
                    ELSE entertainment_videos.progress_position
                END,
                progress_duration=CASE
                    WHEN ? THEN 0
                    ELSE entertainment_videos.progress_duration
                END,
                watched_at=CASE
                    WHEN ? THEN excluded.updated_at
                    ELSE entertainment_videos.watched_at
                END,
                updated_at=excluded.updated_at
            """,
            (
                user_id,
                title,
                input_url,
                src,
                open_url,
                video_type,
                category,
                source_lang,
                now,
                now,
                body.reset_progress,
                body.reset_progress,
                body.reset_progress,
            ),
        )
        row = conn.execute(
            """
            SELECT id, title, input, src, open_url, video_type, category, source_lang,
                   progress_position, progress_duration, watched_at,
                   created_at, updated_at
            FROM entertainment_videos
            WHERE user_id=? AND src=?
            """,
            (user_id, src),
        ).fetchone()
        conn.commit()
    return {"video": _row_to_video(row)}


@router.patch("/videos/{video_id}/category")
def save_video_category(video_id: int, body: VideoCategoryIn, request: Request):
    user_id = _get_user_id(request)
    category = _video_category(body.category)
    now = int(time.time() * 1000)
    with get_connection() as conn:
        cur = conn.execute(
            """
            UPDATE entertainment_videos
            SET category=?, updated_at=?
            WHERE user_id=? AND id=?
            """,
            (category, now, user_id, video_id),
        )
        row = conn.execute(
            """
            SELECT id, title, input, src, open_url, video_type, category, source_lang,
                   progress_position, progress_duration, watched_at,
                   created_at, updated_at
            FROM entertainment_videos
            WHERE user_id=? AND id=?
            """,
            (user_id, video_id),
        ).fetchone()
        conn.commit()
    if cur.rowcount == 0 or not row:
        raise HTTPException(status_code=404, detail="Video not found")
    return {"video": _row_to_video(row)}


@router.delete("/videos/{video_id}")
def delete_video(video_id: int, request: Request):
    user_id = _get_user_id(request)
    with get_connection() as conn:
        cur = conn.execute(
            "DELETE FROM entertainment_videos WHERE user_id=? AND id=?",
            (user_id, video_id),
        )
        conn.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Video not found")
    return {"ok": True}


@router.patch("/videos/{video_id}/progress")
def save_video_progress(video_id: int, body: VideoProgressIn, request: Request):
    user_id = _get_user_id(request)
    position = max(0.0, float(body.position or 0))
    duration = max(0.0, float(body.duration or 0))
    if duration > 0 and position >= duration - 8:
        position = 0.0
    now = int(time.time() * 1000)
    with get_connection() as conn:
        cur = conn.execute(
            """
            UPDATE entertainment_videos
            SET progress_position=?, progress_duration=?, watched_at=?, updated_at=?
            WHERE user_id=? AND id=?
            """,
            (position, duration, now, now, user_id, video_id),
        )
        row = conn.execute(
            """
            SELECT id, title, input, src, open_url, video_type, category, source_lang,
                   progress_position, progress_duration, watched_at,
                   created_at, updated_at
            FROM entertainment_videos
            WHERE user_id=? AND id=?
            """,
            (user_id, video_id),
        ).fetchone()
        conn.commit()
    if cur.rowcount == 0 or not row:
        raise HTTPException(status_code=404, detail="Video not found")
    return {"video": _row_to_video(row)}


@router.get("/videos/snapshots")
def list_video_snapshots(request: Request, limit: int = 80):
    _get_user_id(request)
    return {"captures": _list_snapshot_items(limit)}


@router.post("/videos/snapshots")
async def save_video_snapshot(body: VideoSnapshotIn, request: Request):
    _get_user_id(request)
    title = body.title.strip() or "video"
    position = max(0.0, float(body.position or 0))
    if body.image_data.strip():
        out_path = await asyncio.to_thread(_save_snapshot_image_data, body.image_data, title, position)
        return _snapshot_payload(out_path)
    url = _ensure_http_url(body.url)
    try:
        out_path = await asyncio.to_thread(_capture_snapshot_with_ffmpeg, url, title, position)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=f"Không chụp được ảnh video: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=408, detail="Chụp ảnh video quá lâu, thử lại ở đoạn khác") from exc
    return _snapshot_payload(out_path)


@router.patch("/videos/snapshots")
def update_video_snapshot(body: VideoSnapshotUpdateIn, request: Request):
    _get_user_id(request)
    path = _rename_snapshot(body.url, body.title)
    return {"ok": True, "capture": _snapshot_item(path)}


@router.delete("/snapshots")
def delete_video_snapshot(request: Request, url: str = ""):
    _get_user_id(request)
    path = _resolve_snapshot_delete_path(url)
    path.unlink()
    try:
        path.parent.rmdir()
    except OSError:
        pass
    return {"ok": True}


def _parse_numbered(text: str, n: int) -> list[str]:
    out = [""] * n
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        match = re.match(r"^(\d+)[.)\]:\-\s]+(.+)$", line)
        if match:
            idx = int(match.group(1)) - 1
            if 0 <= idx < n:
                out[idx] = match.group(2).strip()
    if any(out):
        return out
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return lines[:n] + [""] * max(0, n - len(lines))


def _translate_to_vi(texts: list[str], provider: str, model: str) -> list[str]:
    if provider == "google":
        return _translate_google(texts)

    from api.services.provider_config import get_provider_config

    cfg = get_provider_config(provider, model)
    if not cfg.api_key:
        raise RuntimeError(f"Provider '{provider}' chưa có API key")
    numbered = "\n".join(f"{idx + 1}. {text}" for idx, text in enumerate(texts))
    body = json.dumps({
        "model": cfg.model,
        "temperature": 0.2,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Dịch phụ đề video sang tiếng Việt tự nhiên, ngắn gọn, dễ nghe. "
                    "Giữ đúng số dòng, mỗi dòng là một câu dịch tương ứng."
                ),
            },
            {"role": "user", "content": numbered},
        ],
    }).encode()
    req = urllib.request.Request(
        f"{cfg.base_url.rstrip('/')}/chat/completions",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {cfg.api_key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
            return _parse_numbered(data["choices"][0]["message"]["content"], len(texts))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:200]
        raise RuntimeError(f"Dịch lỗi HTTP {exc.code}: {detail}") from exc


def _translate_google(texts: list[str]) -> list[str]:
    translated: list[str] = []
    batch_size = 30
    for idx in range(0, len(texts), batch_size):
        batch = texts[idx:idx + batch_size]
        joined = "\n".join(batch)
        query = urllib.parse.urlencode({
            "client": "gtx",
            "sl": "auto",
            "tl": "vi",
            "dt": "t",
            "q": joined,
        })
        url = f"https://translate.googleapis.com/translate_a/single?{query}"
        with urllib.request.urlopen(url, timeout=30) as resp:
            data = json.loads(resp.read())
        text = "".join(part[0] for part in data[0] if part and part[0])
        lines = [line.strip() for line in text.splitlines()]
        if len(lines) == len(batch):
            translated.extend(lines)
        else:
            translated.extend(_translate_google_single(batch))
    return translated


def _translate_google_single(texts: list[str]) -> list[str]:
    out: list[str] = []
    for text in texts:
        value = (text or "").strip()
        if not value:
            out.append("")
            continue
        query = urllib.parse.urlencode({
            "client": "gtx",
            "sl": "auto",
            "tl": "vi",
            "dt": "t",
            "q": value,
        })
        url = f"https://translate.googleapis.com/translate_a/single?{query}"
        with urllib.request.urlopen(url, timeout=30) as resp:
            data = json.loads(resp.read())
        out.append("".join(part[0] for part in data[0] if part and part[0]).strip())
    return out


async def _translate_batches(texts: list[str], provider: str, model: str) -> list[str]:
    out: list[str] = []
    batch_size = 30
    for idx in range(0, len(texts), batch_size):
        batch = texts[idx:idx + batch_size]
        translated = await asyncio.to_thread(_translate_to_vi, batch, provider, model)
        out.extend(translated)
    return out


def _yt_dlp_caption_options(browser: str | None = None) -> dict:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "cachedir": False,
        "ignore_no_formats_error": True,
        "js_runtimes": {"node": {}},
    }
    if browser:
        opts["cookiesfrombrowser"] = (browser,)
    return opts


def _extract_caption_data(url: str) -> tuple[str, dict, list[dict]]:
    import yt_dlp

    errors = []
    # Chrome cookies avoid YouTube's bot check. Other local browsers and the
    # anonymous session remain fallbacks for machines without Chrome cookies.
    for browser in ("chrome", "brave", "chromium", "safari", None):
        try:
            with yt_dlp.YoutubeDL(_yt_dlp_caption_options(browser)) as ydl:
                info = ydl.extract_info(url, download=False)
                tracks = []
                for source, mapping in (
                    ("subtitles", info.get("subtitles") or {}),
                    ("automatic_captions", info.get("automatic_captions") or {}),
                ):
                    for lang, formats in mapping.items():
                        for fmt in formats or []:
                            if fmt.get("url"):
                                tracks.append({**fmt, "lang": lang, "source": source})
                if not tracks:
                    continue
                for track in sorted(tracks, key=_caption_score):
                    try:
                        caption_url = _without_query_params(track["url"], {"tlang"})
                        with ydl.urlopen(caption_url) as response:
                            raw = response.read().decode("utf-8", errors="replace")
                        segments = (
                            _parse_json3_captions(raw)
                            if (track.get("ext") or "").lower() == "json3"
                            else _parse_vtt_captions(raw)
                        )
                        if segments:
                            return info.get("title") or "", track, segments
                    except Exception as exc:
                        errors.append(str(exc))
        except Exception as exc:
            errors.append(str(exc))
    detail = errors[-1] if errors else "Video này không có phụ đề/auto-caption"
    raise RuntimeError(detail)


# ── Fallback: tự tạo phụ đề bằng STT (Whisper) khi video không có sẵn caption ──

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
STT_MAX_AUDIO_BYTES = 24 * 1024 * 1024  # Groq giới hạn 25MB, chừa biên an toàn


def _download_audio_for_stt(url: str) -> tuple[str, str]:
    """Tải audio của video về file mp3 16kHz mono (gọn cho STT). Trả (path, title)."""
    import tempfile
    import yt_dlp

    tmp_dir = tempfile.mkdtemp(prefix="hagent-stt-")
    out_tmpl = str(Path(tmp_dir) / "audio.%(ext)s")
    title = ""
    last_err = ""
    for browser in ("chrome", "brave", "chromium", "safari", None):
        opts = {
            **_yt_dlp_caption_options(browser),
            "skip_download": False,
            "format": "bestaudio/best",
            "outtmpl": out_tmpl,
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "64",
            }],
            "postprocessor_args": ["-ac", "1", "-ar", "16000"],
        }
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
                title = info.get("title") or ""
            mp3 = Path(tmp_dir) / "audio.mp3"
            if mp3.is_file() and mp3.stat().st_size > 0:
                if mp3.stat().st_size > STT_MAX_AUDIO_BYTES:
                    raise RuntimeError("Audio quá dài để tự tạo phụ đề (giới hạn ~25MB)")
                return str(mp3), title
        except Exception as exc:
            last_err = str(exc)
            continue
    raise RuntimeError(last_err or "Không tải được audio để tạo phụ đề")


def _transcribe_audio_to_segments(audio_path: str) -> tuple[str, list[dict]]:
    """Gọi Groq Whisper (verbose_json) → (lang, segments[{start,duration,text}])."""
    import httpx

    if not GROQ_API_KEY:
        raise RuntimeError("Chưa cấu hình GROQ_API_KEY để tự tạo phụ đề")
    with open(audio_path, "rb") as fh:
        content = fh.read()
    files = {"file": ("audio.mp3", content, "audio/mpeg")}
    data = {"model": "whisper-large-v3", "response_format": "verbose_json"}
    with httpx.Client(timeout=180) as client:
        resp = client.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            data=data,
            files=files,
        )
    if not resp.is_success:
        raise RuntimeError(f"STT thất bại: {resp.status_code} {resp.text[:200]}")
    result = resp.json()
    lang = _normalize_source_lang(result.get("language") or "")
    segments = []
    for seg in result.get("segments") or []:
        text = re.sub(r"\s+", " ", str(seg.get("text") or "")).strip()
        if not text:
            continue
        start = float(seg.get("start") or 0)
        end = float(seg.get("end") or start)
        segments.append({"start": start, "duration": max(0.8, end - start), "text": text})
    if not segments:
        raise RuntimeError("STT không nhận diện được lời thoại")
    return lang, segments


def _autocaption_via_stt(url: str) -> tuple[str, str, list[dict]]:
    """Tự tạo phụ đề: tải audio → Whisper. Trả (title, lang, segments). Tự dọn file tạm."""
    import shutil as _shutil

    audio_path, title = _download_audio_for_stt(url)
    try:
        lang, segments = _transcribe_audio_to_segments(audio_path)
    finally:
        _shutil.rmtree(Path(audio_path).parent, ignore_errors=True)
    return title, lang, segments


def _caption_score(track: dict) -> tuple[int, int, int]:
    lang = _track_source_lang(track)
    ext = (track.get("ext") or "").lower()
    source = track.get("source")
    lang_score = 0 if lang.startswith("vi") else 1 if lang.startswith("en") else 2
    source_score = 0 if source == "subtitles" else 1
    ext_score = 0 if ext == "json3" else 1 if ext == "vtt" else 2
    return (lang_score, source_score, ext_score)


def _track_source_lang(track: dict) -> str:
    url = track.get("url") or ""
    try:
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
    except Exception:
        query = {}
    return (query.get("lang", [""])[0] or track.get("lang") or "").lower()


def _parse_json3_captions(raw: str) -> list[dict]:
    data = json.loads(raw)
    segments = []
    for event in data.get("events") or []:
        text = "".join(seg.get("utf8", "") for seg in event.get("segs") or []).strip()
        text = re.sub(r"\s+", " ", text)
        if not text:
            continue
        start = (event.get("tStartMs") or 0) / 1000
        duration = (event.get("dDurationMs") or 1800) / 1000
        segments.append({"start": start, "duration": max(0.8, duration), "text": text})
    return segments


def _vtt_time_to_seconds(value: str) -> float:
    parts = value.replace(",", ".").split(":")
    if len(parts) == 3:
        hours, minutes, seconds = parts
        return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    minutes, seconds = parts
    return int(minutes) * 60 + float(seconds)


def _parse_vtt_captions(raw: str) -> list[dict]:
    segments = []
    pattern = re.compile(
        r"(?P<start>\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})\s+-->\s+"
        r"(?P<end>\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}).*?\n(?P<text>.*?)(?=\n\n|\Z)",
        re.S,
    )
    for match in pattern.finditer(raw):
        text = re.sub(r"<[^>]+>", "", match.group("text"))
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            continue
        start = _vtt_time_to_seconds(match.group("start"))
        end = _vtt_time_to_seconds(match.group("end"))
        segments.append({"start": start, "duration": max(0.8, end - start), "text": text})
    return segments


def _is_non_speech_caption(text: str) -> bool:
    clean = _clean_caption_for_tts(text).lower()
    clean = re.sub(r"\s+", " ", clean)
    if not clean:
        return True
    bracket = clean.strip("[](){}♪♫♬♩-–—:：.。!！ ")
    if _is_non_speech_cue(bracket):
        return True
    return bool(re.fullmatch(r"[\[\](){}【】♪♫♬♩\s:：.\-–—!！]*(music|applause|clapping|cheering|laughter|âm nhạc|nhạc|vỗ tay|cười)[\[\](){}【】♪♫♬♩\s:：.\-–—!！]*", clean))


def _without_query_params(url: str, names: set[str]) -> str:
    parsed = urllib.parse.urlsplit(url)
    query = [
        (key, value)
        for key, value in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
        if key not in names
    ]
    return urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode(query)))


@router.post("/videos/quick-dub")
async def quick_dub(body: QuickDubIn, request: Request):
    user_id = _get_user_id(request)
    url = body.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="url is required")
    max_segments = max(1, min(body.max_segments, 1000))
    start_at = max(0.0, float(body.start_at or 0))
    cached = _load_cached_captions(user_id, url)
    cached_segments = cached.get("segments", []) if cached else []
    # Cache đầu video vẫn dùng tốt cho lần mở đầu tiên. Khi người dùng đã xem sâu
    # hơn (start_at > 0), cần trích lại theo cửa sổ hiện tại để video dài không
    # bị dừng thoại ở mốc max_segments.
    if cached and start_at <= 0 and len(cached_segments) != 500:
        video = _update_video_source_lang(user_id, body.video_id, url, cached.get("source_lang", ""))
        if video:
            cached["video"] = video
        cached["translated"] = not _is_vi_lang(cached.get("source_lang", ""))
        cached["target_lang"] = "vi"
        cached["has_more"] = len(cached_segments) >= max_segments
        cached["window_start"] = float(cached_segments[0].get("start") or 0) if cached_segments else 0.0
        cached["window_end"] = (
            float(cached_segments[-1].get("start") or 0) + max(0.0, float(cached_segments[-1].get("duration") or 0))
            if cached_segments else 0.0
        )
        return cached
    try:
        title, track, segments = await asyncio.to_thread(_extract_caption_data, url)
        lang = _normalize_source_lang(_track_source_lang(track))
    except Exception:
        # Không có phụ đề sẵn → tự tạo phụ đề bằng STT (Whisper).
        try:
            title, lang, segments = await asyncio.to_thread(_autocaption_via_stt, url)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Không lấy được phụ đề và tự tạo cũng thất bại: {exc}") from exc
    if start_at > 0:
        floor_at = max(0.0, start_at - 1.25)
        segments = [
            seg for seg in segments
            if float(seg.get("start") or 0) + max(0.0, float(seg.get("duration") or 0)) >= floor_at
        ]
    has_more = len(segments) > max_segments
    segments = segments[:max_segments]
    if not segments:
        raise HTTPException(status_code=404, detail="Không đọc được nội dung phụ đề")
    segments = [seg for seg in segments if not _is_non_speech_caption(seg.get("text", ""))]
    if not segments:
        raise HTTPException(status_code=404, detail="Phụ đề chỉ có âm thanh nền, không có lời thoại để đọc")

    source_is_vi = _is_vi_lang(lang)
    if source_is_vi:
        translated = [seg["text"] for seg in segments]
    else:
        try:
            translated = await _translate_batches(
                [seg["text"] for seg in segments],
                body.translate_provider,
                body.translate_model,
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    out = []
    for seg, text in zip(segments, translated):
        text = _clean_caption_for_tts(text or seg["text"] if source_is_vi else text or "")
        if text:
            out.append({**seg, "text": text})
    payload = {
        "title": title,
        "source_lang": lang,
        "sourceLang": lang,
        "target_lang": "vi",
        "translated": not source_is_vi,
        "segments": out,
        "cached": False,
        "has_more": has_more,
        "window_start": float(out[0].get("start") or 0) if out else start_at,
        "window_end": (
            float(out[-1].get("start") or 0) + max(0.0, float(out[-1].get("duration") or 0))
            if out else start_at
        ),
    }
    if start_at <= 0:
        _save_cached_captions(user_id, url, title, lang, out)
    video = _update_video_source_lang(user_id, body.video_id, url, lang)
    if video:
        payload["video"] = video
    return payload


@router.delete("/videos")
def clear_videos(request: Request):
    user_id = _get_user_id(request)
    with get_connection() as conn:
        conn.execute("DELETE FROM entertainment_videos WHERE user_id=?", (user_id,))
        conn.commit()
    return {"ok": True}
