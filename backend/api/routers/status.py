from fastapi import APIRouter, HTTPException

from api.services.run_control import is_running, is_stop_requested
from api.services.session_store import get_session

router = APIRouter(tags=["status"])


@router.get("/sessions/{session_id}/status")
def session_status(session_id: str) -> dict:
    record = get_session(session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy session")

    status = "busy" if is_running(session_id) else record.status
    return {
        "id": session_id,
        "status": status,
        "stopRequested": is_stop_requested(session_id),
        "messageCount": len(record.messages),
    }
