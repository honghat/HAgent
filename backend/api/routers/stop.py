from fastapi import APIRouter

from api.schemas import StopResponse
from api.services.run_control import stop_session

router = APIRouter(tags=["stop"])


@router.post("/sessions/{session_id}/stop", response_model=StopResponse)
def stop_route(session_id: str) -> StopResponse:
    return StopResponse(session_id=session_id, stopped=stop_session(session_id))
