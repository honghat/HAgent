from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from api.services.user_store import resolve_user_id
from api.services.agent_profiles import list_agent_profiles
from api.services.workflow_store import (
    create_workflow,
    delete_workflow,
    get_workflow,
    list_workflows,
    update_workflow,
)
from api.services.workflow_executor import WorkflowExecutionError, execute_workflow
from api.services.workflow_run_store import get_run, list_runs

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


class WorkflowCreateBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    graph: dict | None = None


class WorkflowUpdateBody(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    graph: dict | None = None


class WorkflowRunBody(BaseModel):
    input: dict = Field(default_factory=dict)
    provider: str | None = None
    model: str | None = None


def _user_id(request: Request) -> str:
    token = request.headers.get("authorization", "").replace("Bearer ", "").strip()
    user_id = resolve_user_id(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user_id


@router.get("")
def list_items(request: Request):
    return {"workflows": list_workflows(_user_id(request))}


@router.get("/catalog")
def get_catalog(request: Request):
    user_id = _user_id(request)
    return {
        "agents": list_agent_profiles(user_id),
        "tools": _tool_catalog(),
    }


@router.post("")
def create_item(body: WorkflowCreateBody, request: Request):
    return create_workflow(_user_id(request), body.name.strip(), body.description, body.graph)


@router.get("/{workflow_id}")
def get_item(workflow_id: str, request: Request):
    item = get_workflow(workflow_id, _user_id(request))
    if not item:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return item


@router.put("/{workflow_id}")
def update_item(workflow_id: str, body: WorkflowUpdateBody, request: Request):
    user_id = _user_id(request)
    if not get_workflow(workflow_id, user_id):
        raise HTTPException(status_code=404, detail="Workflow not found")
    updates = body.model_dump(exclude_unset=True)
    item = update_workflow(workflow_id, user_id, updates)
    return item


@router.delete("/{workflow_id}")
def delete_item(workflow_id: str, request: Request):
    if not delete_workflow(workflow_id, _user_id(request)):
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"deleted": True}


@router.post("/{workflow_id}/run")
def run_item(workflow_id: str, body: WorkflowRunBody, request: Request):
    user_id = _user_id(request)
    item = get_workflow(workflow_id, user_id)
    if not item:
        raise HTTPException(status_code=404, detail="Workflow not found")
    try:
        return execute_workflow(
            item,
            user_id,
            body.input,
            provider=body.provider,
            model=body.model,
        )
    except WorkflowExecutionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{workflow_id}/runs")
def list_item_runs(workflow_id: str, request: Request, limit: int = 30):
    user_id = _user_id(request)
    if not get_workflow(workflow_id, user_id):
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"runs": list_runs(workflow_id, user_id, limit)}


@router.get("/{workflow_id}/runs/{run_id}")
def get_item_run(workflow_id: str, run_id: str, request: Request):
    user_id = _user_id(request)
    if not get_workflow(workflow_id, user_id):
        raise HTTPException(status_code=404, detail="Workflow not found")
    run = get_run(run_id, user_id, include_steps=True)
    if not run:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    if run["workflow_id"] != workflow_id:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    return run


def _tool_catalog() -> list[dict]:
    try:
        import model_tools  # noqa: F401
        from tools.registry import registry
    except Exception:
        return []

    items = []
    for name in registry.get_all_tool_names():
        entry = registry.get_entry(name)
        if not entry:
            continue
        schema = entry.schema if isinstance(entry.schema, dict) else {}
        items.append(
            {
                "name": name,
                "description": entry.description or schema.get("description", ""),
                "toolset": entry.toolset or "",
            }
        )
    return items
