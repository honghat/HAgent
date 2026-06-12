from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pathlib import Path
import asyncio
import importlib
import logging
import traceback

from api.routers import agent_stream, agents, app_tools, auth, auto_fetch, browser_view, camera, chat_bridge, coach, comfyui_workflows, config, context, cron, cv, cv_generate, drive, english, entertainment, evolution, files, goals, google_accounts, google_photos, health, i2v, learn_admin, learn_ai, learn_core, learn_stt, lessons, media, messages, mindmap, music, omni, pdf_tools, photo, quick_commands, services, sessions, skills, status, stop, telegram, tts, truyencv, video, video_editor, voice, web, wiki, workflows, workspace, admin, db_admin, expenses, balance, personal_notes, personal_tasks
from api.routers import blog
from api.routers import ketoan
from api.routers import pdf_translate
from api.routers import iot

from api.services.db import DATA_DIR, init_db
from api.services.workflow_scheduler import start_workflow_scheduler


ALLOWED_ORIGINS = [
    "http://127.0.0.1:3004",
    "http://localhost:3004",
    "https://hatai.io.vn",
    "https://www.hatai.io.vn",
]


def _optional_router(module_name: str):
    full_name = f"api.routers.{module_name}"
    try:
        return importlib.import_module(full_name)
    except ModuleNotFoundError as exc:
        if exc.name != full_name:
            raise
        logging.warning("Optional router %s is unavailable: %s", module_name, exc)
        return None


def create_app() -> FastAPI:
    # Discover plugins synchronously BEFORE creating the app, so image_gen
    # / video_gen providers are registered by the time any route handler runs.
    try:
        from hagent_cli.plugins import discover_plugins
        discover_plugins(force=True)
    except Exception:
        logging.exception("Plugin discovery failed at module level")

    init_db()
    app = FastAPI(title="HAgent API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Global exception handler: catch unhandled errors to prevent process crash
    @app.exception_handler(Exception)
    async def global_exception_handler(request, exc):
        logging.error("Unhandled exception: %s\n%s", exc, traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal server error: {type(exc).__name__}"},
        )
    # Static file serving for uploads
    uploads_dir = Path(__file__).resolve().parents[2] / "data" / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

    # Static file serving for cached images (ComfyUI outputs, etc.)
    from hagent_constants import get_hagent_home
    cache_images_dir = get_hagent_home() / "cache" / "images"
    cache_images_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/cache-images", StaticFiles(directory=str(cache_images_dir)), name="cache_images")

    cache_videos_dir = get_hagent_home() / "cache" / "videos"
    cache_videos_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/cache-videos", StaticFiles(directory=str(cache_videos_dir)), name="cache_videos")

    cache_i2v_inputs_dir = get_hagent_home() / "cache" / "i2v_inputs"
    cache_i2v_inputs_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/cache-i2v-inputs", StaticFiles(directory=str(cache_i2v_inputs_dir)), name="cache_i2v_inputs")



    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(admin.router)
    app.include_router(db_admin.router)
    app.include_router(chat_bridge.router)
    app.include_router(i2v.router)
    app.include_router(comfyui_workflows.router)
    app.include_router(sessions.router, prefix="/api")
    app.include_router(messages.router, prefix="/api")
    app.include_router(expenses.router, prefix="/api")
    app.include_router(balance.router, prefix="/api")
    app.include_router(personal_notes.router)
    app.include_router(personal_tasks.router)
    app.include_router(mindmap.router)
    app.include_router(status.router, prefix="/api")
    app.include_router(stop.router, prefix="/api")
    app.include_router(quick_commands.router, prefix="/api")
    app.include_router(workspace.router, prefix="/api")
    app.include_router(files.router)
    app.include_router(omni.router, prefix="/api")
    app.include_router(telegram.router, prefix="/api")
    app.include_router(tts.tts_router, prefix="/api")
    app.include_router(agents.router, prefix="/api")
    app.include_router(config.router, prefix="/api")
    app.include_router(drive.router)
    app.include_router(pdf_tools.router)
    app.include_router(pdf_translate.router)
    app.include_router(iot.router)
    app.include_router(cv.router)
    app.include_router(cv_generate.router)
    job_hunter = _optional_router("job_hunter")
    if job_hunter:
        app.include_router(job_hunter.router, prefix="/api")
        app.add_api_route("/api/jobs", job_hunter.delete_job_alias, methods=["DELETE"])
        app.add_api_route("/api/jobs/{job_ref:path}", job_hunter.delete_job_by_ref_alias, methods=["DELETE"])
    agent_job_hunter = _optional_router("agent_job_hunter")
    if agent_job_hunter:
        app.include_router(agent_job_hunter.router, prefix="/api")
    app.include_router(agent_stream.router, prefix="/api")
    app.include_router(app_tools.router, prefix="/api")
    app.include_router(coach.router)
    app.include_router(context.router)
    app.include_router(evolution.router)
    app.include_router(services.router, prefix="/api")
    app.include_router(cron.router)
    app.include_router(browser_view.router, prefix="/api")
    app.include_router(camera.router)
    app.include_router(video.router)
    app.include_router(goals.router)
    app.include_router(google_accounts.router)
    app.include_router(google_photos.router)
    app.include_router(skills.router)
    app.include_router(web.router)
    app.include_router(wiki.router)
    app.include_router(workflows.router)
    app.include_router(auto_fetch.router)
    app.include_router(lessons.router)
    app.include_router(english.router)
    app.include_router(entertainment.router)
    app.include_router(media.router)
    app.include_router(voice.router, prefix="/api")
    app.include_router(truyencv.router)
    app.include_router(photo.router)
    app.include_router(music.router)
    app.include_router(video_editor.router)
    app.include_router(learn_core.router)
    app.include_router(learn_ai.router)
    app.include_router(learn_admin.router)
    app.include_router(learn_stt.router)
    app.include_router(blog.router)
    app.include_router(ketoan.router, prefix="/api/ketoan")


    # Serve editor data
    editor_dir = Path(__file__).resolve().parents[2] / "data" / "editor"
    editor_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/data/editor", StaticFiles(directory=str(editor_dir)), name="editor_data")

    # Serve saved entertainment captures
    entertainment_dir = DATA_DIR / "entertainment"
    entertainment_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/data/entertainment", StaticFiles(directory=str(entertainment_dir)), name="entertainment_data")

    # Serve audio library (shared, per-user folders)
    audio_lib_dir = Path(__file__).resolve().parents[2] / "data" / "audio-library"
    audio_lib_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/data/audio-library", StaticFiles(directory=str(audio_lib_dir)), name="audio_library")

    # Serve frontend SPA from dist/
    frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if frontend_dist.exists():
        from fastapi.responses import FileResponse
        app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="spa_assets")

        @app.get("/")
        async def serve_spa_root():
            return FileResponse(str(frontend_dist / "index.html"))

        @app.get("/{full_path:path}")
        async def serve_spa_fallback(full_path: str):
            # Don't interfere with API routes
            if full_path.startswith("api/") or full_path.startswith("uploads/"):
                from fastapi.responses import JSONResponse
                return JSONResponse({"detail": "Not Found"}, status_code=404)
            fp = frontend_dist / "index.html"
            if not fp.exists():
                return JSONResponse({"detail": "Not Found"}, status_code=404)
            return FileResponse(str(fp))
    else:
        @app.get("/")
        async def root():
            return {"status": "API running", "frontend": "build not found"}

    @app.on_event("startup")
    async def restore_telegram_listeners():
        # Discover plugins so image_gen/video_gen backends register
        try:
            from hagent_cli.plugins import discover_plugins
            discover_plugins(force=True)
        except Exception as exc:
            logging.warning("Plugin discovery failed: %s", exc)
        # Scheduler tự spawn daemon thread, return ngay
        start_workflow_scheduler()
        # Drive backup scheduler — tự chạy các map đã bật lúc 2h sáng
        try:
            from api.services.drive_sync import start_backup_scheduler
            start_backup_scheduler()
        except Exception as exc:
            logging.warning("start_backup_scheduler failed: %s", exc)
        try:
            from api.services.google_email_keepalive import start_google_email_keepalive_scheduler
            start_google_email_keepalive_scheduler()
        except Exception as exc:
            logging.warning("start_google_email_keepalive_scheduler failed: %s", exc)
        # Các hàm restore chạy subprocess/HTTP có thể block 5-30s tuỳ mạng.
        # Tách ra task nền để /health serve được ngay sau startup,
        # tránh watchdog tưởng service chết và restart vô cớ.
        asyncio.create_task(_restore_listeners_in_background())

    return app


async def _restore_listeners_in_background() -> None:
    # Facebook cần event loop chính để asyncio.create_task() — gọi trực tiếp.
    # Hàm này chỉ load DB + spawn task nên không block lâu.
    try:
        omni.restore_active_facebook_sync_tasks()
    except Exception as exc:
        logging.warning("restore facebook listeners failed: %s", exc)
    # Zalo + Telegram tự spawn subprocess/thread riêng — đẩy vào thread pool
    # để subprocess.Popen / Thread.start không block event loop.
    for name, fn in (
        ("zalo", omni.restore_active_zalo_listeners),
        ("telegram", telegram.restore_active_listeners),
    ):
        try:
            await asyncio.to_thread(fn)
        except Exception as exc:
            logging.warning("restore %s listeners failed: %s", name, exc)


app = create_app()
