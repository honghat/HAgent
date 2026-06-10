from fastapi import APIRouter

from api.schemas import SteerRequest, SteerResponse, StopResponse
from api.services.run_control import steer_session, stop_session

router = APIRouter(tags=["stop"])


@router.post("/sessions/{session_id}/stop", response_model=StopResponse)
def stop_route(session_id: str) -> StopResponse:
    return StopResponse(session_id=session_id, stopped=stop_session(session_id))


@router.post("/sessions/{session_id}/steer", response_model=SteerResponse)
def steer_route(session_id: str, payload: SteerRequest) -> SteerResponse:
    return SteerResponse(session_id=session_id, accepted=steer_session(session_id, payload.content))
