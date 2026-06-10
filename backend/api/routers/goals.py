"""Goal planner API for Telegram bot, frontend, and agent resume loops."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from api.services.goal_planner import (
    add_task,
    clear_goals,
    create_goal,
    get_goal,
    list_goals,
    replan_goal,
    resume_goal,
    update_goal,
    update_task,
)
from api.services.wiki_memory import resolve_user_id


router = APIRouter(tags=["goals"])


class GoalRequest(BaseModel):
    goal: str | None = None
    title: str | None = None
    description: str = ""
    priority: int = 3
    deadline: str | None = None
    tasks: list[dict] | None = None


class GoalUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: int | None = None
    deadline: str | None = None


class TaskRequest(BaseModel):
    title: str = Field(min_length=1)
    detail: str = ""
    priority: int = 3


class TaskUpdateRequest(BaseModel):
    title: str | None = None
    detail: str | None = None
    status: str | None = None
    priority: int | None = None
    evidence: str | None = None
    result: str | None = None


class ReplanRequest(BaseModel):
    tasks: list[dict] | None = None


def _uid(request: Request) -> str:
    return resolve_user_id(request.headers.get("authorization")) or "hat"


@router.get("/api/goals")
def list_goals_route(request: Request, include_archived: bool = False) -> list[dict]:
    return list_goals(_uid(request), include_archived=include_archived)


@router.post("/api/goals")
def create_goal_route(req: GoalRequest, request: Request) -> dict:
    title = req.title or req.goal or ""
    try:
        goal = create_goal(
            user_id=_uid(request),
            title=title,
            description=req.description,
            priority=req.priority,
            deadline=req.deadline,
            tasks=req.tasks,
            source="api",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return goal


@router.delete("/api/goals")
def clear_goals_route(request: Request) -> dict:
    return clear_goals(_uid(request))


@router.post("/api/goals/resume")
def resume_goals_route(request: Request) -> dict:
    result = resume_goal(_uid(request))
    if not result:
        raise HTTPException(status_code=404, detail="No active goals to resume")
    return result


@router.get("/api/goals/{goal_id}")
def get_goal_route(goal_id: str, request: Request) -> dict:
    goal = get_goal(goal_id, _uid(request))
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return goal


@router.put("/api/goals/{goal_id}")
def update_goal_route(goal_id: str, body: GoalUpdateRequest, request: Request) -> dict:
    goal = update_goal(goal_id, _uid(request), body.model_dump(exclude_none=True))
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return goal


@router.post("/api/goals/{goal_id}/resume")
def resume_goal_route(goal_id: str, request: Request) -> dict:
    result = resume_goal(_uid(request), goal_id=goal_id)
    if not result:
        raise HTTPException(status_code=404, detail="Goal not found or not active")
    return result


@router.post("/api/goals/{goal_id}/replan")
def replan_goal_route(goal_id: str, body: ReplanRequest, request: Request) -> dict:
    goal = replan_goal(goal_id, _uid(request), body.tasks)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return goal


@router.post("/api/goals/{goal_id}/tasks")
def add_task_route(goal_id: str, body: TaskRequest, request: Request) -> dict:
    task = add_task(goal_id, _uid(request), body.title, body.detail, body.priority)
    if not task:
        raise HTTPException(status_code=404, detail="Goal not found")
    return task


@router.put("/api/goals/{goal_id}/tasks/{task_id}")
def update_task_route(goal_id: str, task_id: str, body: TaskUpdateRequest, request: Request) -> dict:
    task = update_task(goal_id, task_id, _uid(request), body.model_dump(exclude_none=True))
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task
