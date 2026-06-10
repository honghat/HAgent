"""Helpers cho auto_video_project_tool — KHÔNG register tool.

Tách riêng để giữ file chính gọn và để registry.discover_builtin_tools không
pickup file này (chỉ pickup file có `registry.register(...)` ở top-level).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)


# Style prompt mapping — copy từ skill video-production-workflow.
STYLE_PROMPTS: dict[str, dict[str, str]] = {
    "stick_figure": {
        "image": (
            "clean minimal stick figure illustration, simple line art, "
            "flat solid white background, cute mascot style, bold black "
            "outline, 2D vector cartoon, no text, no watermark"
        ),
        "motion": (
            "clean minimal stick figure animation, smooth vector stroke "
            "line art motion, bouncy lively physics movement, simple funny "
            "cartoon physics, isolated pure solid background, cute mascot animation"
        ),
        "negative": (
            "photorealistic, realistic, 3D render, complex textures, realistic "
            "human body, detailed face, clothes, cluttered background, shading, "
            "gradient background, texts, words, watermark, logo"
        ),
    },
    "anime": {
        "image": (
            "high-quality 2D anime illustration, vibrant colors, expressive "
            "characters, beautiful background, dynamic composition, masterpiece"
        ),
        "motion": (
            "high-quality 2D anime style, aesthetic animation, extremely smooth "
            "fluid motion, natural character movement, flowing beautiful hair, "
            "waving clothes, dynamic cinematic lighting, wind blowing, masterpieces"
        ),
        "negative": (
            "photorealistic, realistic, 3D render, digital sculpture, real life, "
            "low quality, blurry, static, watermark, text overlay, logo, "
            "deformed body, extra fingers, ugly eyes"
        ),
    },
    "cartoon": {
        "image": (
            "vibrant 2D flat cartoon illustration, cute character design, "
            "classic western animation style, clean shapes, playful, bright colors"
        ),
        "motion": (
            "vibrant 2D flat cartoon style, cute character animation, classic "
            "western animation style, squash and stretch bouncy physics, playful "
            "character motion, clean shapes, smooth keyframes"
        ),
        "negative": (
            "photorealistic, realistic, 3D render, dark tone, blurry, text "
            "overlay, watermark, complex lighting, gradient, real world textures"
        ),
    },
    "photo_realistic": {
        "image": (
            "cinematic photo realistic shot, detailed environment, natural lighting, "
            "high resolution, professional photography"
        ),
        "motion": (
            "cinematic camera movement, slow smooth panning, natural gentle "
            "environmental motion, cinematic lighting, atmospheric parallax depth "
            "effect, highly detailed realism"
        ),
        "negative": (
            "abrupt movement, static, blurry, overexposed, text overlay, "
            "watermark, distorted, CGI look, anime style, stickman"
        ),
    },
}


SCRIPT_PROMPT_TEMPLATE = """Bạn là biên kịch video ngắn cho HAgent.

Hãy viết kịch bản video chủ đề: "{topic}".

Yêu cầu:
- Đúng {n_scenes} cảnh (scene_number từ 0 đến {last}).
- Phong cách hình ảnh: {style_hint} → mô tả tương ứng.
- Mỗi cảnh có: subtitle (ngắn, 6-10 từ), narration (TTS đọc, 2-3 câu tiếng Việt tự nhiên, có dấu câu), duration_seconds (8-12), scene_description (mô tả hình ảnh bằng tiếng Anh để feed image gen, ngắn gọn 1 câu), camera_move (chọn 1 trong: zoom_in, zoom_out, static, fade_in).
- Tổng video 40-60 giây.
- KHÔNG dùng emoji, KHÔNG markdown.

Chỉ trả về **JSON nguyên bản** (không giải thích, không bọc trong ```), đúng schema:

{{
  "title": "Tiêu đề ngắn",
  "topic": "{topic}",
  "scenes": [
    {{
      "scene_number": 0,
      "subtitle": "...",
      "narration": "...",
      "duration_seconds": 10,
      "scene_description": "...",
      "camera_move": "zoom_in"
    }}
  ]
}}
"""


CHATGPT2API_BASE = os.environ.get("CHATGPT2API_BASE_URL", "http://127.0.0.1:3011").rstrip("/")
CHATGPT2API_KEY = os.environ.get("CHATGPT2API_AUTH_KEY") or "chatgpt2api"


def _extract_json(text: str) -> dict | None:
    """Cố gắng parse JSON từ text — strip markdown fence nếu có."""
    if not text:
        return None
    s = text.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\n?", "", s)
        s = re.sub(r"```\s*$", "", s)
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{.*\}", s, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def _validate_script(script: dict, n_scenes: int) -> tuple[bool, str]:
    if not isinstance(script, dict):
        return False, "script không phải dict"
    if not script.get("title") or not isinstance(script.get("scenes"), list):
        return False, "thiếu title/scenes"
    scenes = script["scenes"]
    if not scenes:
        return False, "scenes rỗng"
    required = ("subtitle", "narration", "duration_seconds", "scene_description")
    for i, sc in enumerate(scenes):
        if not isinstance(sc, dict):
            return False, f"scene {i} không phải dict"
        for k in required:
            if not sc.get(k):
                return False, f"scene {i} thiếu '{k}'"
        if "scene_number" not in sc:
            sc["scene_number"] = i
        if "camera_move" not in sc:
            sc["camera_move"] = "static"
    return True, ""


async def gen_script_json(
    topic: str,
    n_scenes: int,
    style: str = "stick_figure",
    model: str | None = None,
    timeout: int = 120,
) -> dict:
    """Sinh script JSON qua proxy chatgpt2api. Throws RuntimeError nếu fail."""
    style_hint = {
        "stick_figure": "người que (stick figure) tối giản, nền trắng",
        "anime": "anime 2D vibrant",
        "cartoon": "hoạt hình cartoon mảng màu phẳng",
        "photo_realistic": "ảnh thực tế cinematic",
    }.get(style, style)

    prompt = SCRIPT_PROMPT_TEMPLATE.format(
        topic=topic, n_scenes=n_scenes, last=n_scenes - 1, style_hint=style_hint
    )

    payload = {
        "model": (model or os.environ.get("CHATGPT2API_ADVISOR_MODEL", "gpt-5-mini")),
        "messages": [
            {"role": "system", "content": "Bạn là biên kịch video ngắn, trả JSON nguyên bản, không giải thích."},
            {"role": "user", "content": prompt},
        ],
        "stream": False,
    }

    def _call() -> str:
        with httpx.Client(timeout=timeout) as client:
            r = client.post(
                f"{CHATGPT2API_BASE}/v1/chat/completions",
                json=payload,
                headers={"Authorization": f"Bearer {CHATGPT2API_KEY}",
                         "Content-Type": "application/json"},
            )
            r.raise_for_status()
            data = r.json()
            choices = data.get("choices") or []
            if not choices:
                raise RuntimeError("Proxy trả choices rỗng")
            return (choices[0].get("message") or {}).get("content") or ""

    text = await asyncio.to_thread(_call)
    script = _extract_json(text)
    if not script:
        raise RuntimeError(f"Không parse được JSON script. Raw: {text[:300]}")
    ok, err = _validate_script(script, n_scenes)
    if not ok:
        raise RuntimeError(f"Script không hợp lệ: {err}")
    return script


def build_image_prompt(scene: dict, style: str) -> str:
    style_meta = STYLE_PROMPTS.get(style, STYLE_PROMPTS["stick_figure"])
    desc = (scene.get("scene_description") or "").strip()
    return f"{desc}, {style_meta['image']}"


def build_motion_prompt(scene: dict, style: str) -> str:
    style_meta = STYLE_PROMPTS.get(style, STYLE_PROMPTS["stick_figure"])
    camera = scene.get("camera_move", "static")
    camera_hint = {
        "zoom_in": "slow zoom in",
        "zoom_out": "slow zoom out",
        "pan_left": "slow pan left",
        "pan_right": "slow pan right",
        "fade_in": "soft fade in",
        "static": "subtle natural motion",
    }.get(camera, "subtle natural motion")
    return f"{style_meta['motion']}, {camera_hint}"


def get_style_negative(style: str) -> str:
    return STYLE_PROMPTS.get(style, STYLE_PROMPTS["stick_figure"])["negative"]


# ── Image generation with fallback ─────────────────────────────────────────────

async def gen_image_with_fallback(prompt: str, size: str = "landscape") -> str:
    """Try image_chatgpt2api → fallback image_generate. Returns local file path."""
    from tools.image_chatgpt2api_tool import image_chatgpt2api

    def _try_chatgpt():
        return image_chatgpt2api({"prompt": prompt, "size": size})

    try:
        raw = await asyncio.to_thread(_try_chatgpt)
        result = json.loads(raw) if isinstance(raw, str) else raw
        if isinstance(result, dict) and result.get("image_path"):
            return result["image_path"]
        logger.warning("image_chatgpt2api fail: %s", (result or {}).get("error"))
    except Exception as e:
        logger.warning("image_chatgpt2api exception: %s", e)

    # Fallback FAL
    try:
        from tools.image_generation_tool import _handle_image_generate

        aspect_map = {
            "landscape": "3:2",
            "portrait": "2:3",
            "square": "1:1",
            "16:9": "16:9",
            "9:16": "9:16",
            "1:1": "1:1",
        }
        ar = aspect_map.get(size, "3:2")
        raw = await asyncio.to_thread(_handle_image_generate, {"prompt": prompt, "aspect_ratio": ar})
        result = json.loads(raw) if isinstance(raw, str) else raw
        if not isinstance(result, dict):
            raise RuntimeError(f"image_generate trả type lạ: {type(result).__name__}")
        if result.get("success") and result.get("image"):
            url = result["image"]
            # FAL trả URL; download về cache
            from hagent_constants import get_hagent_home
            cache_dir = Path(get_hagent_home()) / "cache" / "images"
            cache_dir.mkdir(parents=True, exist_ok=True)
            ext = Path(url.split("?")[0]).suffix or ".png"
            local = cache_dir / f"fal_{uuid.uuid4().hex[:8]}{ext}"
            with httpx.Client(timeout=120) as c:
                r = c.get(url)
                r.raise_for_status()
                local.write_bytes(r.content)
            return str(local)
        raise RuntimeError(result.get("error") or "image_generate fail")
    except Exception as e:
        raise RuntimeError(f"Cả 2 image provider đều fail: {e}") from e


# ── Wan2.1 motion ──────────────────────────────────────────────────────────────

async def gen_wan_safe(
    image_path: str,
    prompt: str,
    negative: str,
    size: str = "landscape",
    length: int = 33,
    timeout: int = 1800,
) -> str | None:
    """Wrap image_to_video_wan; return MP4 path hoặc None nếu fail."""
    from tools.image_to_video_wan_tool import image_to_video_wan

    def _call():
        return image_to_video_wan({
            "image_path": image_path,
            "prompt": prompt,
            "negative": negative,
            "size": size,
            "length": length,
            "timeout": timeout,
        })

    try:
        raw = await asyncio.to_thread(_call)
        result = json.loads(raw) if isinstance(raw, str) else raw
        if isinstance(result, dict) and result.get("video_path"):
            return result["video_path"]
        logger.warning("Wan fail: %s", (result or {}).get("error"))
        return None
    except Exception as e:
        logger.warning("Wan exception: %s", e)
        return None


# ── TTS Edge — voice Nam Minh (hoặc theo param) ────────────────────────────────

async def gen_tts_edge(text: str, voice: str, out_path: Path) -> tuple[str, float]:
    """Sinh TTS bằng edge_tts trực tiếp; return (mp3_path, duration_sec)."""
    text = (text or "").strip()
    if not text:
        raise RuntimeError("TTS text rỗng")

    out_path.parent.mkdir(parents=True, exist_ok=True)

    async def _gen():
        import edge_tts
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(str(out_path))

    last_err: Exception | None = None
    for attempt in range(3):
        try:
            await _gen()
            break
        except Exception as e:
            last_err = e
            logger.warning("edge_tts attempt %d fail: %s", attempt + 1, e)
            await asyncio.sleep(2.5)
    else:
        # Cả 3 lần đều fail → silent audio fallback
        logger.warning("edge_tts gave up, generating silent placeholder")
        await asyncio.to_thread(_silent_mp3, str(out_path), 5.0)
        if last_err is not None:
            pass  # already logged

    duration = await asyncio.to_thread(probe_duration, str(out_path))
    return str(out_path), duration


def _silent_mp3(path: str, seconds: float):
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i",
         "anullsrc=channel_layout=mono:sample_rate=24000",
         "-t", str(seconds), "-q:a", "9", "-acodec", "libmp3lame", path],
        capture_output=True, timeout=30,
    )


def probe_duration(path: str) -> float:
    """Probe duration via ffprobe; return 0 nếu lỗi."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True, timeout=8,
        )
        return float((out.stdout or "0").strip() or 0)
    except Exception:
        return 0.0


def probe_media(path: Path) -> tuple[float, int, int]:
    """Reuse pattern từ video_editor._probe_media."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-print_format", "json",
             "-show_streams", "-show_format", str(path)],
            capture_output=True, text=True, timeout=8,
        )
        data = json.loads(out.stdout or "{}")
        dur = float((data.get("format") or {}).get("duration") or 0)
        w = h = 0
        for s in data.get("streams", []):
            if s.get("codec_type") == "video":
                w = int(s.get("width") or 0)
                h = int(s.get("height") or 0)
                break
        return dur, w, h
    except Exception:
        return 0.0, 0, 0


# ── Editor asset copy + DB insert ──────────────────────────────────────────────

def copy_to_editor_assets(src_path: str, project_id: int, kind: str, conn,
                          assets_dir: Path, display_name: str | None = None) -> tuple[int, str]:
    """Copy file vào data/editor/assets/{pid}_{uuid}{ext}, insert editor_assets.

    Returns (asset_id, "/data/editor/assets/{fname}").
    """
    src = Path(src_path)
    if not src.exists():
        raise FileNotFoundError(f"asset source not found: {src_path}")
    ext = src.suffix.lower()
    fname = f"{project_id}_{uuid.uuid4().hex[:8]}{ext}"
    dst = assets_dir / fname
    shutil.copy2(src, dst)

    dur, w, h = probe_media(dst)
    now = int(time.time() * 1000)
    cur = conn.execute(
        "INSERT INTO editor_assets(project_id,kind,path,name,duration,width,height,created_at)"
        " VALUES(?,?,?,?,?,?,?,?)",
        (project_id, kind, f"/data/editor/assets/{fname}",
         display_name or src.name, dur, w, h, now),
    )
    return cur.lastrowid, f"/data/editor/assets/{fname}"


# ── Timeline builder ───────────────────────────────────────────────────────────

def build_timeline(scenes_meta: list[dict], fps: int, w: int, h: int) -> tuple[dict, float]:
    """Build timeline JSON từ scenes_meta — schema khớp với FE editor (item phải có id).

    scenes_meta[i] = {
      "subtitle": str,
      "audio_path": "/data/editor/assets/...",
      "audio_dur": float (sec),
      "video_path": "/data/editor/assets/..." | None,  # None = ảnh tĩnh
      "image_path": "/data/editor/assets/..." | None,
      "is_static": bool,
    }

    Returns (timeline_dict, total_duration_sec).
    """
    video_items: list[dict] = []
    text_items: list[dict] = []
    audio_items: list[dict] = []

    is_portrait = h > w
    font_size = 72 if is_portrait else 56
    sub_y = 0.88

    def _nid(prefix: str) -> str:
        return f"{prefix}_{uuid.uuid4().hex[:8]}"

    cursor = 0.0
    for i, sc in enumerate(scenes_meta):
        dur = max(1.0, float(sc.get("audio_dur") or 8.0))
        start, end = cursor, cursor + dur
        cursor = end

        vid_path = sc.get("video_path")
        is_static = bool(sc.get("is_static")) or not vid_path
        asset_path = vid_path or sc.get("image_path")
        if not asset_path:
            continue

        v_kind = "image" if is_static else "video"
        v_item: dict[str, Any] = {
            "id": _nid("clip"),
            "asset_path": asset_path,
            "asset_name": f"scene_{i+1:02d}",
            "kind": v_kind,
            "start": start,
            "end": end,
            "in": 0,
            "out": dur,
            "volume": 0 if v_kind == "video" else 1.0,
            "fade_in": min(0.4, dur / 4),
            "fade_out": min(0.4, dur / 4),
            "effects": {},
            "fit": "contain",
        }
        video_items.append(v_item)

        text_items.append({
            "id": _nid("txt"),
            "kind": "text",
            "text": sc.get("subtitle", ""),
            "size": font_size,
            "color": "#ffffff",
            "anim": "fade-in",
            "style": "clean",
            "pos": {"x": 0.5, "y": sub_y},
            "start": start,
            "end": end,
        })

        audio_path = sc.get("audio_path")
        if audio_path:
            audio_items.append({
                "id": _nid("clip"),
                "asset_path": audio_path,
                "asset_name": f"tts_{i+1:02d}",
                "kind": "audio",
                "start": start,
                "end": end,
                "in": 0,
                "out": dur,
                "volume": 1.0,
                "fade_in": 0,
                "fade_out": 0,
                "effects": {},
                "fit": "contain",
            })

    timeline = {
        "tracks": [
            {"id": "v1", "kind": "video", "name": "Video 1", "items": video_items},
            {"id": "t1", "kind": "text", "name": "Text 1", "items": text_items},
            {"id": "a1", "kind": "audio", "name": "Audio 1", "items": audio_items},
            {"id": "m1", "kind": "music", "name": "Nhạc nền", "items": []},
        ]
    }
    return timeline, cursor


# ── Aspect → width/height ──────────────────────────────────────────────────────

ASPECT_SIZES = {
    "landscape": (1536, 1024),
    "16:9": (1920, 1080),
    "3:2": (1536, 1024),
    "wide": (1536, 1024),
    "portrait": (1080, 1920),
    "9:16": (1080, 1920),
    "tall": (1080, 1920),
    "square": (1080, 1080),
    "1:1": (1080, 1080),
}


def resolve_dims(aspect: str) -> tuple[int, int]:
    s = (aspect or "landscape").strip().lower()
    if s in ASPECT_SIZES:
        return ASPECT_SIZES[s]
    if "x" in s:
        try:
            w, h = s.split("x")
            return int(w), int(h)
        except ValueError:
            pass
    return ASPECT_SIZES["landscape"]
