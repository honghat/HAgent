from __future__ import annotations

import json
from collections import defaultdict, deque
from urllib import error, request

from api.services.agent_profiles import get_agent_profile
from api.services.provider_config import get_provider_config
from api.services.session_store import add_message, create_session
from api.services.source_core_agent import run_source_agent
from api.services.workflow_run_store import (
    create_run,
    finish_run,
    finish_step,
    save_artifact,
    start_step,
)


class WorkflowExecutionError(RuntimeError):
    pass


def execute_workflow(workflow: dict, user_id: str, payload: dict | None = None, *, provider: str | None = None, model: str | None = None) -> dict:
    graph = workflow.get("graph") or {}
    nodes = graph.get("nodes") or []
    edges = graph.get("edges") or []
    if not nodes:
        raise WorkflowExecutionError("Workflow has no nodes")

    node_by_id = {str(node.get("id")): node for node in nodes if node.get("id")}
    order = _topological_order(node_by_id, edges)
    incoming = defaultdict(list)
    outgoing = defaultdict(list)
    for edge in edges:
        source = str(edge.get("from") or "")
        target = str(edge.get("to") or "")
        if source in node_by_id and target in node_by_id:
            incoming[target].append(source)
            outgoing[source].append(target)

    initial_input = payload if isinstance(payload, dict) else {}
    run = create_run(workflow["id"], user_id, initial_input)
    outputs: dict[str, object] = {}
    try:
        for node_id in order:
            node = node_by_id[node_id]
            node_input = _collect_input(node_id, incoming, outputs, initial_input)
            step_id = start_step(run["id"], node, node_input)
            try:
                output = _execute_node(
                    node,
                    node_input,
                    run_id=run["id"],
                    workflow_id=workflow["id"],
                    user_id=user_id,
                    provider=provider,
                    model=model,
                )
                outputs[node_id] = output
                finish_step(step_id, "success", output=output)
            except Exception as exc:
                finish_step(step_id, "error", error=str(exc))
                raise
        terminal_ids = [node_id for node_id in order if not outgoing[node_id]]
        final_output = {node_id: outputs.get(node_id) for node_id in terminal_ids}
        return finish_run(run["id"], user_id, "success", output=final_output)
    except Exception as exc:
        return finish_run(run["id"], user_id, "error", error=str(exc))


def _topological_order(node_by_id: dict[str, dict], edges: list[dict]) -> list[str]:
    indegree = {node_id: 0 for node_id in node_by_id}
    outgoing = defaultdict(list)
    for edge in edges:
        source = str(edge.get("from") or "")
        target = str(edge.get("to") or "")
        if source in node_by_id and target in node_by_id:
            outgoing[source].append(target)
            indegree[target] += 1

    queue = deque(sorted(node_id for node_id, degree in indegree.items() if degree == 0))
    order = []
    while queue:
        node_id = queue.popleft()
        order.append(node_id)
        for target in outgoing[node_id]:
            indegree[target] -= 1
            if indegree[target] == 0:
                queue.append(target)
    if len(order) != len(node_by_id):
        raise WorkflowExecutionError("Workflow graph contains a cycle")
    return order


def _collect_input(node_id: str, incoming, outputs: dict[str, object], initial_input: dict) -> object:
    parents = incoming[node_id]
    if not parents:
        return initial_input
    if len(parents) == 1:
        return outputs.get(parents[0])
    return {parent_id: outputs.get(parent_id) for parent_id in parents}


def _execute_node(node: dict, node_input, *, run_id: str, workflow_id: str, user_id: str, provider: str | None, model: str | None):
    node_type = str(node.get("type") or "")
    config = node.get("config") if isinstance(node.get("config"), dict) else {}
    if node_type == "trigger":
        return node_input
    if node_type == "webhook":
        return _execute_http_node(config, node_input)
    if node_type == "condition":
        return _execute_condition_node(config, node_input)
    if node_type == "database":
        artifact = save_artifact(run_id, workflow_id, user_id, str(node.get("id") or ""), node_input)
        return {"artifact_id": artifact["id"], "payload": node_input}
    if node_type == "ai":
        return _execute_ai_node(config, node_input, provider=provider, model=model)
    if node_type == "agent":
        return _execute_agent_node(config, node_input, user_id=user_id, provider=provider, model=model)
    if node_type == "tool":
        return _execute_tool_node(config, node_input, run_id=run_id, workflow_id=workflow_id)
    return node_input


def _execute_http_node(config: dict, node_input):
    url = str(config.get("url") or "").strip()
    if not url:
        return node_input
    method = str(config.get("method") or "GET").upper()
    headers = config.get("headers") if isinstance(config.get("headers"), dict) else {}
    body = config.get("body", node_input if method in {"POST", "PUT", "PATCH"} else None)
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", **{str(k): str(v) for k, v in headers.items()}},
        method=method,
    )
    try:
        with request.urlopen(req, timeout=float(config.get("timeout") or 30)) as response:
            raw = response.read().decode("utf-8")
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                parsed = raw
            return {"status": response.status, "body": parsed}
    except error.HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        raise WorkflowExecutionError(f"HTTP {exc.code}: {body_text[:300]}") from exc
    except OSError as exc:
        raise WorkflowExecutionError(f"HTTP request failed: {exc}") from exc


def _execute_condition_node(config: dict, node_input):
    field = str(config.get("field") or "").strip()
    expected = config.get("equals", True)
    actual = _extract_field(node_input, field) if field else bool(node_input)
    return {
        "matched": actual == expected if field else bool(actual),
        "value": actual,
        "input": node_input,
    }


def _extract_field(payload, dotted_path: str):
    current = payload
    for part in dotted_path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def _execute_ai_node(config: dict, node_input, *, provider: str | None, model: str | None):
    cfg = get_provider_config(provider, model)
    if cfg.type != "openai" or not cfg.base_url or not cfg.api_key:
        raise WorkflowExecutionError("AI node requires an OpenAI-compatible provider")
    prompt = str(config.get("prompt") or "Process this input.")
    payload = {
        "model": cfg.model,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": json.dumps(node_input, ensure_ascii=False)},
        ],
        "temperature": float(config.get("temperature") or 0.2),
    }
    req = request.Request(
        f"{cfg.base_url.rstrip('/')}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cfg.api_key}",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=float(config.get("timeout") or 60)) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (error.HTTPError, OSError, ValueError) as exc:
        raise WorkflowExecutionError(f"AI request failed: {exc}") from exc
    return {
        "content": data.get("choices", [{}])[0].get("message", {}).get("content", ""),
        "usage": data.get("usage"),
    }


def _execute_agent_node(config: dict, node_input, *, user_id: str, provider: str | None, model: str | None):
    agent_id = str(config.get("agent_id") or "").strip()
    if not agent_id:
        raise WorkflowExecutionError("Agent node requires config.agent_id")
    profile = get_agent_profile(agent_id)
    if not profile:
        raise WorkflowExecutionError("Agent not found")

    session = create_session(
        title=f"Workflow agent · {profile.get('name') or agent_id}",
        agent_id=agent_id,
        user_id=user_id,
    )
    prompt = str(config.get("prompt") or "").strip()
    input_text = json.dumps(node_input, ensure_ascii=False)
    content = f"{prompt}\n\nInput:\n{input_text}" if prompt else input_text
    add_message(session.session_id, "user", content, provider=provider)
    reply, usage = run_source_agent(
        session_id=session.session_id,
        user_message=content,
        provider_name=provider,
        model_override=model,
    )
    add_message(session.session_id, "assistant", reply, provider=provider, usage=usage)
    return {
        "content": reply,
        "usage": usage,
        "agent_id": agent_id,
        "session_id": session.session_id,
    }


def _execute_tool_node(config: dict, node_input, *, run_id: str, workflow_id: str):
    tool_name = str(config.get("tool_name") or "").strip()
    if not tool_name:
        raise WorkflowExecutionError("Tool node requires config.tool_name")
    args = config.get("args")
    if not isinstance(args, dict):
        args = node_input if isinstance(node_input, dict) else {"input": node_input}

    try:
        import model_tools  # noqa: F401
        from tools.registry import registry
    except Exception as exc:  # noqa: BLE001
        raise WorkflowExecutionError(f"Tool registry unavailable: {exc}") from exc

    raw = registry.dispatch(
        tool_name,
        args,
        task_id=run_id,
        user_task=f"workflow:{workflow_id}",
    )
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"content": raw}
    return raw
