from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from api.routers import agents, auth, config, context, drive, evolution, files, goals, health, job_hunter, messages, omni, services, sessions, skills, status, stop, telegram, video, web, wiki, workspace
from api.services.db import init_db


ALLOWED_ORIGINS = [
    "http://127.0.0.1:3004",
    "http://localhost:3004",
]


def create_app() -> FastAPI:
    init_db()
    app = FastAPI(title="HAgent API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # Static file serving for uploads
    uploads_dir = Path(__file__).resolve().parents[2] / "data" / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(sessions.router, prefix="/api")
    app.include_router(messages.router, prefix="/api")
    app.include_router(status.router, prefix="/api")
    app.include_router(stop.router, prefix="/api")
    app.include_router(workspace.router, prefix="/api")
    app.include_router(files.router)
    app.include_router(omni.router, prefix="/api")
    app.include_router(telegram.router, prefix="/api")
    app.include_router(agents.router, prefix="/api")
    app.include_router(config.router, prefix="/api")
    app.include_router(drive.router)
    app.include_router(job_hunter.router, prefix="/api")
    app.include_router(context.router)
    app.include_router(evolution.router)
    app.include_router(services.router, prefix="/api")
    app.include_router(video.router)
    app.include_router(goals.router)
    app.include_router(skills.router)
    app.include_router(web.router)
    app.include_router(wiki.router)

    @app.on_event("startup")
    async def restore_telegram_listeners():
        omni.restore_active_zalo_listeners()
        telegram.restore_active_listeners()

    return app


app = create_app()
