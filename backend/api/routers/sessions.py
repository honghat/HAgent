from fastapi import APIRouter

from api.schemas import CreateSessionRequest, SessionListItem, SessionResponse
from api.services.session_store import create_session, delete_session, list_sessions

router = APIRouter(tags=["sessions"])


@router.get("/sessions", response_model=list[SessionListItem])
def list_sessions_route() -> list[SessionListItem]:
    return [
        SessionListItem(
            id=record.session_id,
            title=record.title,
            status=record.status,
            agentId=record.agent_id,
        )
        for record in list_sessions()
    ]


@router.post("/sessions")
def create_session_route(payload: CreateSessionRequest) -> dict:
    record = create_session(payload.title, payload.agentId)
    session = SessionResponse(
        session_id=record.session_id,
        title=record.title,
        status=record.status,
        agentId=record.agent_id,
    )
    return {
        "id": session.session_id,
        "session_id": session.session_id,
        "title": session.title,
        "status": session.status,
        "agentId": session.agentId,
    }


@router.delete("/sessions/{session_id}")
def delete_session_route(session_id: str) -> dict:
    return {"deleted": delete_session(session_id)}


@router.post("/sessions/clean")
async def clean_sessions():
    import shutil
    from pathlib import Path
    sessions_dir = Path(__file__).parent.parent.parent / "sessions"
    count = 0
    if sessions_dir.exists():
        for p in sessions_dir.iterdir():
            if p.is_file():
                p.unlink()
                count += 1
            elif p.is_dir():
                shutil.rmtree(p)
                count += 1
    return {"ok": True, "deleted": count, "message": f"Đã dọn {count} file sessions"}
