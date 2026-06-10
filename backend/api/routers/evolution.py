from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from api.services.wiki_memory import resolve_user_id
from api.services import self_evolution


router = APIRouter(prefix="/api/evolution", tags=["evolution"])


class StatusBody(BaseModel):
    status: str


def _uid(request: Request) -> str:
    return resolve_user_id(request.headers.get("authorization"))


@router.get("/summary")
def get_summary(request: Request) -> dict:
    return self_evolution.summary(_uid(request))


@router.get("/events")
def list_events(
    request: Request,
    status: str | None = None,
    event_type: str | None = None,
    limit: int = 100,
) -> list[dict]:
    return self_evolution.list_events(_uid(request), status=status, event_type=event_type, limit=limit)


@router.put("/events/{event_id}/status")
def set_status(event_id: str, body: StatusBody, request: Request) -> dict:
    try:
        event = self_evolution.update_event_status(event_id, _uid(request), body.status)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.post("/events/{event_id}/apply")
def apply_event(event_id: str, request: Request) -> dict:
    result = self_evolution.apply_event(event_id, _uid(request))
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error") or "Could not apply event")
    return result


@router.post("/daily-review")
def daily_review(request: Request) -> dict:
    return self_evolution.run_daily_review(_uid(request))
