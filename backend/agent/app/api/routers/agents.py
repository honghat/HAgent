from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from api.services.agent_profiles import get_agent_profile, list_agent_profiles
from api.services.wiki_memory import resolve_user_id

router = APIRouter(tags=["agents"])


@router.get("/agents")
def list_agents_route(request: Request) -> list[dict]:
    user_id = resolve_user_id(request.headers.get("authorization"))
    return list_agent_profiles(user_id)


@router.get("/agents/{agent_id}")
def get_agent_route(agent_id: str) -> dict:
    agent = get_agent_profile(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Không tìm thấy agent")
    return agent
