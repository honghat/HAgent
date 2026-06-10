"""Tool: auto_video_project — agent tạo video hoàn chỉnh qua Video Editor.

Pipeline: tạo project editor → lên ý tưởng (script JSON) → tạo ảnh (chatgpt2api,
fallback FAL Flux) → tạo hoạt ảnh (Wan2.1, fail → ảnh tĩnh) → tạo TTS (edge_tts
vi-VN-NamMinhNeural) → build timeline + assets → enqueue render → poll → báo cáo.

Tất cả asset copy vào data/editor/assets/, ghi DB editor_projects/editor_assets,
render qua api.services.video_editor_render.enqueue. Progress track ở bảng
auto_video_jobs.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from pathlib import Path
from typing import Any

from tools.registry import registry, tool_error, tool_result
from tools._auto_video_helpers import (
    build_image_prompt,
    build_motion_prompt,
    build_timeline,
    copy_to_editor_assets,
    gen_image_with_fallback,
    gen_script_json,
    gen_tts_edge,
    gen_wan_safe,
    get_style_negative,
    resolve_dims,
)

logger = logging.getLogger(__name__)


REPO_ROOT = Path(__file__).resolve().parents[2]
EDITOR_ASSETS_DIR = REPO_ROOT / "data" / "editor" / "assets"
EDITOR_OUTPUT_DIR = REPO_ROOT / "data" / "editor" / "output"
TMP_DIR = REPO_ROOT / "data" / "tmp" / "auto-video"
EDITOR_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
TMP_DIR.mkdir(parents=True, exist_ok=True)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _default_user_id() -> str:
    """Resolve thực user UUID giống auth.router._get_user_id (token 'hat' → user UUID)."""
    token = os.environ.get("HAGENT_USER_ID") or "hat"
    try:
        from api.services.user_store import resolve_user_id
        uid = resolve_user_id(token)
        if uid:
            return uid
    except Exception as e:
        logger.warning("resolve_user_id fail: %s", e)
    return token


# ── DB helpers (sync, wrap with to_thread khi gọi từ async) ────────────────────

def _db_create_project(uid: str, title: str, w: int, h: int, fps: int) -> int:
    from api.services.db import get_connection
    now = _now_ms()
    conn = get_connection()
    try:
        cur = conn.execute(
            "INSERT INTO editor_projects(user_id,title,width,height,fps,duration,"
            "timeline_json,created_at,updated_at) VALUES(?,?,?,?,?,0,?,?,?)",
            (uid, title, w, h, fps,
             '{"tracks":[{"id":"v1","kind":"video","name":"Video","items":[]},'
             '{"id":"t1","kind":"text","name":"Subtitle","items":[]},'
             '{"id":"a1","kind":"audio","name":"TTS","items":[]}]}',
             now, now),
        )
        pid = cur.lastrowid
        conn.commit()
        return pid
    finally:
        conn.close()


def _db_create_job(uid: str, topic: str, total_scenes: int, project_id: int) -> int:
    from api.services.db import get_connection
    now = _now_ms()
    conn = get_connection()
    try:
        cur = conn.execute(
            "INSERT INTO auto_video_jobs(project_id,user_id,topic,status,step,"
            "current_scene,total_scenes,message,created_at,updated_at)"
            " VALUES(?,?,?,?,?,?,?,?,?,?)",
            (project_id, uid, topic, "running", "idea", 0, total_scenes,
             "Bắt đầu pipeline", now, now),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def _db_update_job(jid: int, **fields):
    if not fields:
        return
    from api.services.db import get_connection
    fields["updated_at"] = _now_ms()
    sets = ",".join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [jid]
    conn = get_connection()
    try:
        conn.execute(f"UPDATE auto_video_jobs SET {sets} WHERE id=?", vals)
        conn.commit()
    finally:
        conn.close()


def _db_finalize_project(pid: int, timeline: dict, duration: float):
    from api.services.db import get_connection
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE editor_projects SET timeline_json=?,duration=?,updated_at=? WHERE id=?",
            (json.dumps(timeline, ensure_ascii=False), duration, _now_ms(), pid),
        )
        conn.commit()
    finally:
        conn.close()


def _db_enqueue_render(pid: int) -> int:
    from api.services.db import get_connection
    from api.services.video_editor_render import enqueue
    now = _now_ms()
    conn = get_connection()
    try:
        cur = conn.execute(
            "INSERT INTO editor_render_jobs(project_id,status,progress,created_at,updated_at)"
            " VALUES(?,?,?,?,?)",
            (pid, "queued", 0, now, now),
        )
        jid = cur.lastrowid
        conn.commit()
    finally:
        conn.close()
    enqueue(jid)
    return jid


def _db_poll_render(render_jid: int) -> dict:
    from api.services.db import get_connection
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT status,progress,output_path,error FROM editor_render_jobs WHERE id=?",
            (render_jid,),
        ).fetchone()
        return dict(row) if row else {}
    finally:
        conn.close()


def _db_copy_assets(scenes: list[dict], pid: int) -> None:
    """Mutate scenes in-place: replace local paths with /data/editor/assets/ refs."""
    from api.services.db import get_connection
    conn = get_connection()
    try:
        for sc in scenes:
            if sc.get("video_local"):
                _, ref = copy_to_editor_assets(
                    sc["video_local"], pid, "video", conn,
                    EDITOR_ASSETS_DIR, display_name=f"scene_{sc['n']+1:02d}.mp4",
                )
                sc["video_path"] = ref
            if sc.get("image_local"):
                # Insert image asset luôn (kể cả khi có Wan video) — để user thấy trong asset panel
                _, ref = copy_to_editor_assets(
                    sc["image_local"], pid, "image", conn,
                    EDITOR_ASSETS_DIR, display_name=f"scene_{sc['n']+1:02d}.png",
                )
                sc["image_path"] = ref
            if sc.get("audio_local"):
                _, ref = copy_to_editor_assets(
                    sc["audio_local"], pid, "audio", conn,
                    EDITOR_ASSETS_DIR, display_name=f"audio_{sc['n']+1:02d}.mp3",
                )
                sc["audio_path"] = ref
        conn.commit()
    finally:
        conn.close()


# ── Per-scene work ─────────────────────────────────────────────────────────────

async def _make_image(scene: dict, style: str, aspect: str, sem: asyncio.Semaphore) -> str | None:
    async with sem:
        prompt = build_image_prompt(scene, style)
        try:
            return await gen_image_with_fallback(prompt, size=aspect)
        except Exception as e:
            logger.error("image gen scene %d fail: %s", scene.get("scene_number"), e)
            return None


async def _make_tts(scene: dict, voice: str, tmp_dir: Path,
                    sem: asyncio.Semaphore) -> tuple[str | None, float]:
    async with sem:
        n = scene.get("scene_number", 0)
        out = tmp_dir / f"tts_{n+1:02d}.mp3"
        try:
            path, dur = await gen_tts_edge(scene.get("narration", ""), voice, out)
            return path, dur
        except Exception as e:
            logger.error("tts scene %d fail: %s", n, e)
            return None, float(scene.get("duration_seconds", 8))


async def _make_motion(image_path: str, scene: dict, style: str, aspect: str) -> str | None:
    motion_prompt = build_motion_prompt(scene, style)
    negative = get_style_negative(style)
    # Wan size mapping
    wan_size = aspect if aspect in {"landscape", "portrait", "square",
                                    "16:9", "9:16", "1:1"} else "landscape"
    return await gen_wan_safe(image_path, motion_prompt, negative, size=wan_size)


# ── Main handler ───────────────────────────────────────────────────────────────

async def _handle_auto_video_project(args: dict, **kwargs: Any) -> str:
    topic = (args.get("topic") or "").strip()
    if not topic:
        return tool_error("Missing 'topic'")

    n_scenes = int(args.get("scenes") or 5)
    n_scenes = max(2, min(12, n_scenes))
    aspect = (args.get("aspect") or "landscape").strip().lower()
    style = (args.get("style") or "stick_figure").strip().lower()
    voice = (args.get("voice") or "vi-VN-NamMinhNeural").strip()
    fps = int(args.get("fps") or 24)
    model = args.get("model") or args.get("script_model")
    user_id = (args.get("user_id") or _default_user_id()).strip()
    skip_animation = bool(args.get("skip_animation") or False)
    render_timeout = int(args.get("render_timeout") or 1800)

    width, height = resolve_dims(aspect)

    # 1. Tạo project + job
    try:
        pid = await asyncio.to_thread(_db_create_project, user_id, topic, width, height, fps)
        jid = await asyncio.to_thread(_db_create_job, user_id, topic, n_scenes, pid)
    except Exception as e:
        logger.exception("create project/job fail")
        return tool_error(f"DB lỗi khi tạo project: {e}")

    logger.info("[auto_video] project=%d job=%d topic=%r scenes=%d", pid, jid, topic, n_scenes)

    # 2. Sinh script
    await asyncio.to_thread(_db_update_job, jid, step="idea", message="Đang lên ý tưởng + viết kịch bản")
    try:
        script = await gen_script_json(topic, n_scenes, style=style, model=model)
    except Exception as e:
        await asyncio.to_thread(_db_update_job, jid, status="error",
                                message=f"Sinh script fail: {e}")
        return tool_error(f"Sinh script fail: {e}", project_id=pid, job_id=jid)

    scenes = script.get("scenes", [])[:n_scenes]
    scenes_meta: list[dict] = [
        {"n": i, "scene_number": sc.get("scene_number", i),
         "subtitle": sc.get("subtitle", ""),
         "narration": sc.get("narration", ""),
         "duration_seconds": float(sc.get("duration_seconds", 8)),
         "scene_description": sc.get("scene_description", ""),
         "camera_move": sc.get("camera_move", "static")}
        for i, sc in enumerate(scenes)
    ]

    # 3. Tạo ảnh + TTS song song (image_chatgpt2api proxy, edge_tts)
    await asyncio.to_thread(_db_update_job, jid, step="image",
                            message=f"Đang tạo {len(scenes_meta)} ảnh + TTS")
    img_sem = asyncio.Semaphore(3)
    tts_sem = asyncio.Semaphore(2)

    img_tasks = [_make_image(sc, style, aspect, img_sem) for sc in scenes_meta]
    tts_tasks = [_make_tts(sc, voice, TMP_DIR, tts_sem) for sc in scenes_meta]
    img_results = await asyncio.gather(*img_tasks, return_exceptions=False)
    tts_results = await asyncio.gather(*tts_tasks, return_exceptions=False)

    for sc, img_path, (tts_path, tts_dur) in zip(scenes_meta, img_results, tts_results):
        sc["image_local"] = img_path
        sc["audio_local"] = tts_path
        sc["audio_dur"] = tts_dur if tts_dur > 0.3 else sc["duration_seconds"]

    missing_imgs = sum(1 for sc in scenes_meta if not sc["image_local"])
    if missing_imgs == len(scenes_meta):
        await asyncio.to_thread(_db_update_job, jid, status="error",
                                message="Cả 2 image provider đều fail trên mọi scene")
        return tool_error("Không tạo được ảnh nào", project_id=pid, job_id=jid)

    # 4. Tạo hoạt ảnh tuần tự (GPU đơn) — fail thì giữ ảnh tĩnh
    if skip_animation:
        wan_done, wan_skip = 0, len(scenes_meta)
        for sc in scenes_meta:
            sc["video_local"] = None
            sc["is_static"] = True
    else:
        await asyncio.to_thread(_db_update_job, jid, step="animation",
                                message="Đang tạo hoạt ảnh Wan2.1 (~10p/scene)")
        wan_done = wan_skip = 0
        for i, sc in enumerate(scenes_meta):
            await asyncio.to_thread(_db_update_job, jid, current_scene=i + 1,
                                    message=f"Wan2.1 scene {i+1}/{len(scenes_meta)}")
            if not sc.get("image_local"):
                sc["video_local"] = None
                sc["is_static"] = True
                wan_skip += 1
                continue
            vp = await _make_motion(sc["image_local"], sc, style, aspect)
            sc["video_local"] = vp
            sc["is_static"] = vp is None
            if vp:
                wan_done += 1
            else:
                wan_skip += 1

    # 5. Copy assets vào editor + insert DB
    await asyncio.to_thread(_db_update_job, jid, step="assemble",
                            message="Đang lắp ráp timeline")
    try:
        await asyncio.to_thread(_db_copy_assets, scenes_meta, pid)
    except Exception as e:
        logger.exception("copy assets fail")
        await asyncio.to_thread(_db_update_job, jid, status="error",
                                message=f"Copy assets fail: {e}")
        return tool_error(f"Copy assets fail: {e}", project_id=pid, job_id=jid)

    # 6. Build timeline + update project
    timeline, total_dur = build_timeline(scenes_meta, fps, width, height)
    await asyncio.to_thread(_db_finalize_project, pid, timeline, total_dur)

    # 7. Enqueue render
    await asyncio.to_thread(_db_update_job, jid, step="render",
                            message="Đang render qua editor")
    render_jid = await asyncio.to_thread(_db_enqueue_render, pid)
    await asyncio.to_thread(_db_update_job, jid, render_job_id=render_jid)

    # 8. Poll render
    output_path = None
    render_error = None
    deadline = time.time() + render_timeout
    while time.time() < deadline:
        status = await asyncio.to_thread(_db_poll_render, render_jid)
        if not status:
            break
        if status.get("status") == "done":
            output_path = status.get("output_path")
            break
        if status.get("status") == "error":
            render_error = status.get("error")
            break
        await asyncio.sleep(2)

    if render_error:
        await asyncio.to_thread(_db_update_job, jid, status="error",
                                message=f"Render fail: {render_error[:200]}")
        return tool_error(f"Render fail: {render_error}",
                          project_id=pid, job_id=jid, render_job_id=render_jid)

    if not output_path:
        await asyncio.to_thread(_db_update_job, jid, status="error",
                                message="Render timeout")
        return tool_error("Render timeout", project_id=pid, job_id=jid,
                          render_job_id=render_jid)

    await asyncio.to_thread(
        _db_update_job, jid, status="done", step="done",
        output_path=output_path,
        message=f"Hoàn tất ({total_dur:.1f}s, {wan_done}/{wan_done+wan_skip} cảnh có Wan)",
    )

    # 9. Báo cáo
    return tool_result({
        "ok": True,
        "project_id": pid,
        "project_url": f"/video?project={pid}",
        "job_id": jid,
        "render_job_id": render_jid,
        "output_path": output_path,
        "title": script.get("title", topic),
        "topic": topic,
        "aspect": aspect,
        "style": style,
        "fps": fps,
        "total_duration_sec": round(total_dur, 2),
        "scenes": [
            {"n": sc["n"], "subtitle": sc["subtitle"],
             "audio_dur": round(sc["audio_dur"], 2),
             "has_animation": not sc["is_static"],
             "has_image": bool(sc.get("image_path"))}
            for sc in scenes_meta
        ],
        "wan_done": wan_done,
        "wan_skipped": wan_skip,
        "summary": (
            f"Đã tạo project {pid} '{script.get('title', topic)}', "
            f"{len(scenes_meta)} cảnh, {total_dur:.1f}s, render → {output_path}. "
            f"Wan2.1: {wan_done}/{wan_done+wan_skip} cảnh có hoạt ảnh."
        ),
    })


registry.register(
    name="auto_video_project",
    toolset="video",
    schema={
        "name": "auto_video_project",
        "description": (
            "Tự động tạo video hoàn chỉnh: lên ý tưởng, tạo ảnh (ChatGPT image "
            "→ fallback FAL Flux), tạo hoạt ảnh (Wan2.1, fail thì giữ ảnh tĩnh), "
            "tạo TTS giọng Nam Minh, build timeline + tracks trong Video Editor, "
            "render và trả về output. Chạy chậm (mỗi scene Wan ~10 phút trên GPU "
            "remote — 5 cảnh có thể mất ~50 phút). Dùng khi user chỉ nói 'tạo "
            "video về X' và không yêu cầu kiểm soát từng bước."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "topic": {"type": "string",
                          "description": "Chủ đề video (vd 'Vì sao bầu trời màu xanh')."},
                "scenes": {"type": "integer",
                           "description": "Số cảnh, 2-12. Mặc định 5."},
                "aspect": {"type": "string",
                           "description": "'landscape' (1536x1024, mặc định), "
                                          "'portrait' (1080x1920), 'square' (1080x1080)."},
                "style": {"type": "string",
                          "description": "'stick_figure' (mặc định, người que), "
                                         "'anime', 'cartoon', 'photo_realistic'."},
                "voice": {"type": "string",
                          "description": "Edge TTS voice id. Mặc định 'vi-VN-NamMinhNeural'."},
                "fps": {"type": "integer",
                        "description": "FPS render, mặc định 24."},
                "script_model": {"type": "string",
                                 "description": "Model cho ChatGPT2API proxy sinh script. "
                                                "Mặc định gpt-5-mini."},
                "skip_animation": {"type": "boolean",
                                   "description": "True = bỏ qua Wan2.1, dùng ảnh tĩnh "
                                                  "+ pan/zoom. Tiết kiệm thời gian (~1 phút/cảnh)."},
                "render_timeout": {"type": "integer",
                                   "description": "Timeout chờ render giây, mặc định 1800."},
                "user_id": {"type": "string",
                            "description": "User id cho project editor, mặc định 'hat'."},
            },
            "required": ["topic"],
        },
    },
    handler=_handle_auto_video_project,
    is_async=True,
    description="Tạo video tự động đầu-cuối qua Video Editor (project + assets + timeline + render).",
    emoji="🎬",
)
