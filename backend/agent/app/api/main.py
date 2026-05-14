from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import agents, config, health, messages, sessions, status, stop, workspace, job_hunter
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
    app.include_router(health.router)
    app.include_router(sessions.router, prefix="/api")
    app.include_router(messages.router, prefix="/api")
    app.include_router(status.router, prefix="/api")
    app.include_router(stop.router, prefix="/api")
    app.include_router(workspace.router, prefix="/api")
    app.include_router(agents.router, prefix="/api")
    app.include_router(config.router, prefix="/api")
    app.include_router(job_hunter.router, prefix="/api")
    return app


app = create_app()
