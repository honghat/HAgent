from fastapi import APIRouter, HTTPException

from api.schemas import WorkspaceResponse
from api.services.run_control import is_running, is_stop_requested
from api.services.session_store import get_session
from api.services.workspace_state import get_workspace_state

router = APIRouter(tags=["workspace"])


@router.get("/sessions/{session_id}/workspace", response_model=WorkspaceResponse)
def workspace_route(session_id: str) -> WorkspaceResponse:
    record = get_session(session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy session")

    runtime = get_workspace_state(session_id)
    tools = runtime["tools"]
    if not tools:
        tools = _python_tool_catalog()
    todos = runtime["todos"]

    return WorkspaceResponse(
        session_id=session_id,
        tools=tools,
        todos=todos,
        summary={
            "messageCount": len(record.messages),
            "processing": is_running(session_id),
            "stopRequested": is_stop_requested(session_id),
            "status": record.status,
            "toolCount": len(tools),
            "todoCount": len(todos),
        },
    )


def _python_tool_catalog() -> list[dict]:
    try:
        import model_tools  # noqa: F401
        from tools.registry import registry
    except Exception:
        return []

    items: list[dict] = []
    for name in registry.get_all_tool_names():
        entry = registry.get_entry(name)
        if not entry:
            continue
        items.append(
            {
                "name": name,
                "desc": _compact_desc(entry.description or entry.schema.get("description", "")),
                "toolset": entry.toolset,
                "status": "available",
            }
        )
    return items


def _compact_desc(value: str, limit: int = 220) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text
    return f"{text[:limit].rstrip()}..."
