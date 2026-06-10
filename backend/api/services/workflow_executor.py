from __future__ import annotations

import json
import os
import re
import asyncio
import time
from collections import Counter, defaultdict, deque
from datetime import datetime, timedelta
from html import unescape
from pathlib import Path
from urllib import error, parse, request
from xml.etree import ElementTree

from api.services.agent_profiles import get_agent_profile
from api.services.db import get_connection
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


JOB_CACHE_FILE = Path(__file__).resolve().parent.parent / "data" / "jobs_cache.json"

_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"
if _ENV_PATH.exists():
    try:
        import dotenv

        dotenv.load_dotenv(_ENV_PATH, override=True)
    except ImportError:
        pass
    except Exception:
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
    if node_type in {"trigger", "manual_trigger", "schedule_trigger", "webhook_trigger", "no_op"}:
        return node_input
    if node_type == "wait":
        return _execute_wait_node(config, node_input)
    if node_type in {"webhook", "http_request"}:
        return _execute_http_node(config, node_input)
    if node_type == "set":
        return _execute_set_node(config, node_input)
    if node_type == "format_output":
        return _execute_format_output_node(config, node_input)
    if node_type in {"condition", "if"}:
        return _execute_condition_node(config, node_input)
    if node_type == "switch":
        return _execute_switch_node(config, node_input)
    if node_type == "merge":
        return _execute_merge_node(config, node_input)
    if node_type == "code":
        return _execute_code_node(config, node_input)
    if node_type == "database":
        artifact = save_artifact(run_id, workflow_id, user_id, str(node.get("id") or ""), node_input)
        return {"artifact_id": artifact["id"], "payload": node_input}
    if node_type == "ai":
        return _execute_ai_node(config, node_input, provider=provider, model=model)
    if node_type == "agent":
        return _execute_agent_node(config, node_input, user_id=user_id, provider=provider, model=model)
    if node_type == "tool":
        return _execute_tool_node(config, node_input, run_id=run_id, workflow_id=workflow_id)
    if node_type == "rss":
        return _execute_rss_node(config)
    if node_type == "telegram":
        return _execute_telegram_node(config, node_input)
    if node_type == "price_report":
        return _execute_price_report_node(config)
    if node_type == "zalo":
        return _execute_zalo_node(config, node_input, user_id=user_id)
    if node_type == "job_search":
        return _execute_job_search_node(config, user_id=user_id)
    if node_type == "facebook_hot_topics":
        return _execute_facebook_hot_topics_node(config, user_id=user_id)
    if node_type == "facebook":
        return _execute_facebook_node(config, node_input, user_id=user_id)
    if node_type == "facebook_page_post":
        return _execute_facebook_page_post_node(config, node_input)
    if node_type == "drive_backup":
        return _execute_drive_backup_node(config)
    if node_type == "shell":
        return _execute_shell_node(config)
    return node_input


def _execute_shell_node(config: dict):
    import subprocess
    command = str(config.get("command") or "").strip()
    if not command:
        return {"ok": False, "error": "Empty command"}
    timeout = float(config.get("timeout") or 600)
    try:
        result = subprocess.run(
            ["/bin/zsh", "-lc", command],
            capture_output=True, text=True, timeout=timeout, check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise WorkflowExecutionError(f"Shell timed out after {timeout}s") from exc
    except Exception as exc:
        raise WorkflowExecutionError(f"Shell failed: {exc}") from exc
    return {
        "ok": result.returncode == 0,
        "exit_code": result.returncode,
        "stdout": result.stdout[-4000:],
        "stderr": result.stderr[-4000:],
    }


def _execute_drive_backup_node(config: dict):
    scope = str(config.get("scope") or "data").strip().lower()
    if scope not in {"data", "config", "workspace"}:
        scope = "data"
    folder_id = str(config.get("folder_id") or "").strip()
    port = os.environ.get("HAGENT_PORT") or "8010"
    payload = json.dumps({"scope": scope, "folder_id": folder_id}).encode("utf-8")
    req = request.Request(
        f"http://127.0.0.1:{port}/api/drive/backup",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=600) as response:
            raw = response.read().decode("utf-8")
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return {"raw": raw}
    except Exception as exc:
        raise WorkflowExecutionError(f"Drive backup failed: {exc}") from exc


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


def _execute_wait_node(config: dict, node_input):
    seconds = config.get("seconds", config.get("delay", 0))
    try:
        seconds = float(seconds or 0)
    except (TypeError, ValueError):
        seconds = 0
    if seconds > 0:
        time.sleep(min(seconds, 30))
    return node_input


def _execute_set_node(config: dict, node_input):
    include_input = bool(config.get("include_input", True)) and not bool(config.get("keep_only_set", False))
    output = _deep_copy_json(node_input) if include_input else {}
    if not isinstance(output, dict):
        output = {"value": output} if include_input else {}

    fields = config.get("fields", config.get("values", {}))
    if isinstance(fields, dict):
        fields = [{"name": key, "value": value} for key, value in fields.items()]
    if not isinstance(fields, list):
        return output

    for field in fields:
        if not isinstance(field, dict):
            continue
        path = str(field.get("name") or field.get("path") or "").strip()
        if not path:
            continue
        if "source" in field:
            value = _extract_field(node_input, str(field.get("source") or ""))
        else:
            value = _resolve_workflow_value(field.get("value"), node_input)
        _set_field(output, path, value)
    return output


def _execute_format_output_node(config: dict, node_input):
    template = str(config.get("template") or "").rstrip()
    if not template:
        return node_input
    rendered = _render_output_template(template, node_input)
    output_field = str(config.get("output_field") or "message").strip()
    if not output_field:
        return rendered

    include_input = bool(config.get("include_input", True))
    output = _deep_copy_json(node_input) if include_input else {}
    if not isinstance(output, dict):
        output = {"input": output} if include_input else {}
    _set_field(output, output_field, rendered)
    return output


def _execute_condition_node(config: dict, node_input):
    field = str(config.get("field") or "").strip()
    expected = config.get("equals", True)
    actual = _extract_field(node_input, field) if field else bool(node_input)
    operation = str(config.get("operation") or "equals").lower()
    return {
        "matched": _matches_rule(actual, expected, operation) if field else bool(actual),
        "value": actual,
        "input": node_input,
    }


def _execute_switch_node(config: dict, node_input):
    field = str(config.get("field") or "").strip()
    actual = _extract_field(node_input, field) if field else node_input
    rules = config.get("rules")
    if not isinstance(rules, list):
        rules = []
    matched = None
    for index, rule in enumerate(rules):
        if not isinstance(rule, dict):
            continue
        operation = str(rule.get("operation") or "equals").lower()
        expected = rule.get("value", rule.get("equals"))
        if _matches_rule(actual, expected, operation):
            matched = {
                "index": index,
                "name": rule.get("name") or rule.get("output") or f"Output {index + 1}",
                "value": expected,
            }
            break
    return {
        "matched": matched,
        "value": actual,
        "input": node_input,
    }


def _execute_merge_node(config: dict, node_input):
    if not isinstance(node_input, dict):
        return node_input
    values = list(node_input.values())
    mode = str(config.get("mode") or "append").lower()
    if mode in {"combine", "merge"}:
        merged = {}
        for value in values:
            if isinstance(value, dict):
                merged.update(value)
            else:
                merged.setdefault("items", []).append(value)
        return merged
    if mode in {"choose_branch", "pass_through", "passthrough"}:
        branch = str(config.get("branch") or "").strip()
        return node_input.get(branch) if branch else (values[0] if values else None)
    items = []
    for value in values:
        if isinstance(value, list):
            items.extend(value)
        else:
            items.append(value)
    return {"items": items}


def _execute_code_node(config: dict, node_input):
    if "output" in config:
        return _resolve_workflow_value(config.get("output"), node_input)
    if "fields" in config or "values" in config:
        return _execute_set_node(config, node_input)
    return node_input


def _extract_field(payload, dotted_path: str):
    dotted_path = _normalize_field_path(dotted_path)
    if not dotted_path:
        return payload
    current = payload
    for part in dotted_path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list) and part.isdigit():
            index = int(part)
            current = current[index] if 0 <= index < len(current) else None
        else:
            return None
    return current


def _set_field(payload: dict, dotted_path: str, value):
    parts = [part for part in _normalize_field_path(dotted_path).split(".") if part]
    if not parts:
        return
    current = payload
    for part in parts[:-1]:
        next_value = current.get(part) if isinstance(current, dict) else None
        if not isinstance(next_value, dict):
            next_value = {}
            current[part] = next_value
        current = next_value
    current[parts[-1]] = value


def _normalize_field_path(value: str) -> str:
    text = str(value or "").strip()
    for prefix in ("$json.", "json.", "input.", "output."):
        if text.startswith(prefix):
            return text[len(prefix):]
    if text in {"$json", "json", "input", "output"}:
        return ""
    return text


def _resolve_workflow_value(value, node_input):
    if isinstance(value, dict):
        return {key: _resolve_workflow_value(item, node_input) for key, item in value.items()}
    if isinstance(value, list):
        return [_resolve_workflow_value(item, node_input) for item in value]
    if isinstance(value, str):
        text = value.strip()
        match = re.fullmatch(r"=\{\{\s*(.*?)\s*\}\}", text)
        if match:
            return _extract_field(node_input, match.group(1))
    return value


def _render_output_template(template: str, node_input) -> str:
    def replace(match: re.Match) -> str:
        value = _resolve_template_expression(match.group(1), node_input)
        if value is None:
            return ""
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False)
        return str(value)

    return re.sub(r"\{\{\s*(.*?)\s*\}\}", replace, template)


def _resolve_template_expression(expression: str, node_input):
    for part in re.split(r"\s*\|\|\s*", str(expression or "")):
        token, filters = _split_template_filters(part)
        if not token:
            continue
        if (token.startswith("'") and token.endswith("'")) or (token.startswith('"') and token.endswith('"')):
            return _apply_template_filters(token[1:-1], filters)
        lowered = token.lower()
        if lowered == "true":
            return _apply_template_filters(True, filters)
        if lowered == "false":
            return _apply_template_filters(False, filters)
        if lowered in {"null", "none"}:
            continue
        value = _extract_field(node_input, token)
        if value is not None and value != "":
            return _apply_template_filters(value, filters)
    return ""


def _split_template_filters(part: str) -> tuple[str, list[str]]:
    pieces = [piece.strip() for piece in re.split(r"\s+\|\s+", str(part or "")) if piece.strip()]
    if not pieces:
        return "", []
    return pieces[0], pieces[1:]


def _apply_template_filters(value, filters: list[str]):
    current = value
    for filter_name in filters:
        name = _normalize_vietnamese(str(filter_name or "")).strip()
        if name in {"thousand", "thousand_unit", "vnd_thousand", "nghin"}:
            current = _format_thousand_unit(current)
        elif name in {"json", "to_json"}:
            current = json.dumps(current, ensure_ascii=False)
        elif name == "upper":
            current = str(current).upper()
        elif name == "lower":
            current = str(current).lower()
        elif name in {"trim", "strip"}:
            current = str(current).strip()
    return current


def _matches_rule(actual, expected, operation: str) -> bool:
    if operation in {"exists", "isnotempty"}:
        return actual is not None and actual != ""
    if operation in {"notexists", "isempty"}:
        return actual is None or actual == ""
    if operation in {"contains", "includes"}:
        return str(expected) in str(actual)
    if operation in {"not_equals", "notequals", "!="}:
        return actual != expected
    return actual == expected


def _deep_copy_json(value):
    try:
        return json.loads(json.dumps(value, ensure_ascii=False))
    except (TypeError, ValueError):
        return value


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


def _execute_rss_node(config: dict):
    url = str(config.get("url") or "https://vnexpress.net/rss/tin-moi-nhat.rss").strip()
    limit = max(1, min(20, int(config.get("limit") or 5)))
    req = request.Request(
        url,
        headers={
            "User-Agent": "HAgent Workflow/1.0 (+https://vnexpress.net)",
            "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
        method="GET",
    )
    try:
        with request.urlopen(req, timeout=float(config.get("timeout") or 30)) as response:
            raw = response.read()
    except (error.HTTPError, OSError) as exc:
        raise WorkflowExecutionError(f"RSS request failed: {exc}") from exc

    try:
        root = ElementTree.fromstring(raw)
    except ElementTree.ParseError as exc:
        raise WorkflowExecutionError(f"RSS parse failed: {exc}") from exc

    items = []
    for item in root.findall(".//item")[:limit]:
        title = _node_text(item, "title")
        link = _node_text(item, "link")
        summary = _clean_html(_node_text(item, "description"))
        published = _node_text(item, "pubDate")
        if title or link:
            items.append(
                {
                    "title": title,
                    "link": link,
                    "summary": summary,
                    "published": published,
                }
            )

    source = str(config.get("source") or "VnExpress").strip()
    message = _format_news_message(source, items)
    return {
        "source": source,
        "url": url,
        "count": len(items),
        "items": items,
        "message": message,
    }


def _execute_telegram_node(config: dict, node_input):
    message = str(config.get("message") or "").strip()
    if not message:
        if isinstance(node_input, dict) and node_input.get("message"):
            message = str(node_input["message"])
        elif isinstance(node_input, dict) and isinstance(node_input.get("items"), list):
            message = _format_news_message(str(node_input.get("source") or "Tin mới"), node_input["items"])
        else:
            message = json.dumps(node_input, ensure_ascii=False, indent=2)

    token = str(config.get("bot_token") or os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    target = str(config.get("target") or "telegram").strip()
    chat_id = str(config.get("chat_id") or "").strip()
    if not chat_id:
        if target.startswith("telegram:"):
            chat_id = target.split(":", 1)[1].strip()
        else:
            chat_id = str(os.getenv("TELEGRAM_HOME_CHANNEL") or os.getenv("TELEGRAM_HOME_CHANNEL_ID") or "").strip()
    if not token:
        raise WorkflowExecutionError("Telegram node requires TELEGRAM_BOT_TOKEN or config.bot_token")
    if not chat_id:
        raise WorkflowExecutionError("Telegram node requires TELEGRAM_HOME_CHANNEL or config.chat_id")

    payload = {
        "chat_id": chat_id,
        "text": message[:3900],
        "disable_web_page_preview": bool(config.get("disable_web_page_preview", False)),
    }
    req = request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=float(config.get("timeout") or 30)) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (error.HTTPError, OSError, ValueError) as exc:
        raise WorkflowExecutionError(f"Telegram send failed: {exc}") from exc
    if not data.get("ok"):
        raise WorkflowExecutionError(f"Telegram send failed: {data}")
    return {
        "sent": True,
        "target": "telegram",
        "chat_id": chat_id,
        "message_id": data.get("result", {}).get("message_id"),
    }


def _execute_price_report_node(config: dict):
    gold_url = str(config.get("gold_url") or "https://giavang.doji.vn/trangchu.html").strip()
    silver_url = str(config.get("silver_url") or "https://giabac.org/").strip()
    errors = []
    tool_raw = {}
    gold_items, gold_updated, silver_items, silver_updated = [], "", [], ""
    if config.get("use_tools", True):
        gold_items, gold_updated, silver_items, silver_updated, tool_raw = _fetch_price_report_from_finance_tools(errors)
    if not gold_items:
        try:
            gold_items, gold_updated = _fetch_doji_gold(gold_url)
        except WorkflowExecutionError as exc:
            gold_items, gold_updated = [], ""
            errors.append(str(exc))
    if not silver_items:
        silver_items, silver_updated = _fetch_silver_prices_with_fallbacks(config, silver_url, errors)
    gold_ring = _pick_gold_ring_item(gold_items)
    silver_luong = _pick_silver_luong_item(silver_items)
    message = _format_compact_price_report_message(gold_ring, silver_luong, gold_updated, silver_updated)
    if errors:
        message = f"{message}\n⚠️ Nguồn lỗi: " + " | ".join(errors[:2])
    return {
        "source": {
            "gold": gold_url,
            "silver": silver_url,
        },
        "errors": errors,
        "tool_raw": tool_raw,
        "gold": {
            "updated": gold_updated,
            "items": gold_items,
            "selected": gold_ring,
        },
        "silver": {
            "updated": silver_updated,
            "items": silver_items,
            "selected": silver_luong,
        },
        "message": message,
    }


def _execute_zalo_node(config: dict, node_input, *, user_id: str):
    message = str(config.get("message") or "").strip()
    if not message:
        if isinstance(node_input, dict) and node_input.get("message"):
            message = str(node_input["message"])
        else:
            message = json.dumps(node_input, ensure_ascii=False, indent=2)

    conversation_id = str(config.get("conversation_id") or "").strip()
    external_id = str(config.get("external_id") or "").strip()
    target_name = str(config.get("target_name") or "").strip()
    thread_type = str(config.get("thread_type") or "").strip().lower()

    conv = _resolve_zalo_target(
        user_id,
        conversation_id=conversation_id,
        external_id=external_id,
        target_name=target_name,
        thread_type=thread_type,
    )
    if not conv:
        raise WorkflowExecutionError("Zalo target not found")

    try:
        from api.routers.omni import _send_omni_text
    except Exception as exc:  # noqa: BLE001
        raise WorkflowExecutionError(f"Zalo sender unavailable: {exc}") from exc

    try:
        result = _send_omni_text(user_id, conv, message)
    except Exception as exc:  # noqa: BLE001
        detail = getattr(exc, "detail", None) or str(exc)
        raise WorkflowExecutionError(f"Zalo send failed: {detail}") from exc
    return {
        "sent": True,
        "target": "zalo",
        "conversation_id": conv.get("id"),
        "external_id": conv.get("external_id"),
        "thread_type": conv.get("thread_type") or thread_type or "user",
        "result": result,
    }


def _execute_job_search_node(config: dict, *, user_id: str):
    keywords = config.get("keywords")
    if isinstance(keywords, str):
        keywords = [part.strip() for part in re.split(r"[,;\n]", keywords) if part.strip()]
    if not isinstance(keywords, list) or not keywords:
        keywords = ["python", "react", "node", "ai", "automation"]
    keyword_terms = [_normalize_vietnamese(str(item)) for item in keywords if str(item).strip()]
    sources = config.get("sources")
    if isinstance(sources, str):
        sources = [part.strip().lower() for part in re.split(r"[,;\n]", sources) if part.strip()]
    if not isinstance(sources, list):
        sources = []
    sources = [str(source).lower() for source in sources if str(source).strip()]
    location = _normalize_vietnamese(str(config.get("location") or ""))
    days_old = int(config.get("days_old") or 7)
    limit = max(1, min(30, int(config.get("limit") or 10)))

    jobs = _load_cached_jobs()
    cutoff = datetime.now() - timedelta(days=max(1, days_old))
    matched = []
    for job in jobs:
        haystack = _normalize_vietnamese(
            " ".join(
                str(job.get(key) or "")
                for key in ("title", "company", "location", "source", "description_snippet")
            )
            + " "
            + " ".join(job.get("skills") if isinstance(job.get("skills"), list) else [])
        )
        if keyword_terms and not any(term in haystack for term in keyword_terms):
            continue
        if sources and str(job.get("source") or "").lower() not in sources:
            continue
        if location and location not in _normalize_vietnamese(str(job.get("location") or "")):
            continue
        job_date = _parse_loose_datetime(job.get("updated_at") or job.get("created_at") or job.get("posted_date"))
        if job_date and job_date < cutoff:
            continue
        matched.append(job)

    matched = sorted(
        matched,
        key=lambda item: str(item.get("updated_at") or item.get("created_at") or item.get("posted_date") or ""),
        reverse=True,
    )[:limit]
    message = _format_job_search_message(matched, keywords)
    return {
        "count": len(matched),
        "keywords": keywords,
        "jobs": matched,
        "message": message,
    }


def _execute_facebook_hot_topics_node(config: dict, *, user_id: str):
    limit = max(20, min(300, int(config.get("limit") or 120)))
    days_old = max(1, min(30, int(config.get("days_old") or 7)))
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT m.content, m.created_at, c.title, c.custom_name
            FROM omni_messages m
            JOIN omni_conversations c ON c.id = m.conversation_id
            WHERE m.user_id = ? AND COALESCE(m.platform, c.platform) = 'facebook'
              AND datetime(m.created_at) >= datetime('now', ?)
              AND LENGTH(TRIM(m.content)) > 0
            ORDER BY m.created_at DESC
            LIMIT ?
            """,
            (user_id, f"-{days_old} days", limit),
        ).fetchall()

    texts = [str(row["content"] or "") for row in rows]
    topics = _extract_hot_terms(texts, max_topics=int(config.get("max_topics") or 8))
    if not topics:
        fallback = config.get("fallback_topics")
        if isinstance(fallback, list):
            topics = [{"topic": str(item), "score": 1} for item in fallback if str(item).strip()][:8]
        if not topics:
            topics = [
                {"topic": "AI automation", "score": 1},
                {"topic": "kiếm tiền online", "score": 1},
                {"topic": "công cụ tăng năng suất", "score": 1},
            ]

    message = _format_hot_topics_message(topics)
    return {
        "source": "facebook_messages",
        "count": len(rows),
        "topics": topics,
        "message": message,
    }


def _execute_facebook_node(config: dict, node_input, *, user_id: str):
    message = str(config.get("message") or "").strip() or _input_message(node_input)
    if not message:
        message = json.dumps(node_input, ensure_ascii=False, indent=2)

    conversation_id = str(config.get("conversation_id") or "").strip()
    external_id = str(config.get("external_id") or "").strip()
    target_name = str(config.get("target_name") or "").strip()
    conv = _resolve_facebook_target(
        user_id,
        conversation_id=conversation_id,
        external_id=external_id,
        target_name=target_name,
    )
    if not conv:
        raise WorkflowExecutionError("Facebook target not found. Set config.conversation_id, external_id, or target_name.")

    try:
        from api.routers.omni import _send_omni_text
    except Exception as exc:  # noqa: BLE001
        raise WorkflowExecutionError(f"Facebook sender unavailable: {exc}") from exc

    try:
        result = _send_omni_text(user_id, conv, message[:3900])
    except Exception as exc:  # noqa: BLE001
        detail = getattr(exc, "detail", None) or str(exc)
        raise WorkflowExecutionError(f"Facebook send failed: {detail}") from exc
    return {
        "sent": True,
        "target": "facebook",
        "conversation_id": conv.get("id"),
        "external_id": conv.get("external_id"),
        "result": result,
    }


def _execute_facebook_page_post_node(config: dict, node_input):
    message = str(config.get("message") or "").strip() or _input_message(node_input)
    if not message:
        message = json.dumps(node_input, ensure_ascii=False, indent=2)

    page_id = str(config.get("page_id") or os.getenv("FACEBOOK_PAGE_ID") or "").strip()
    access_token = str(
        config.get("page_access_token")
        or config.get("access_token")
        or os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN")
        or ""
    ).strip()
    graph_version = str(config.get("graph_version") or os.getenv("FACEBOOK_GRAPH_VERSION") or "v24.0").strip()
    link = str(config.get("link") or "").strip()
    published = config.get("published", True)

    if not page_id:
        raise WorkflowExecutionError("Facebook Page Post requires config.page_id or FACEBOOK_PAGE_ID")
    if not access_token:
        raise WorkflowExecutionError("Facebook Page Post requires config.page_access_token or FACEBOOK_PAGE_ACCESS_TOKEN")

    payload = {
        "message": message[:60000],
        "access_token": access_token,
        "published": "true" if bool(published) else "false",
    }
    if link:
        payload["link"] = link

    endpoint = f"https://graph.facebook.com/{graph_version}/{parse.quote(page_id)}/feed"
    req = request.Request(
        endpoint,
        data=parse.urlencode(payload).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=float(config.get("timeout") or 45)) as response:
            data = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        raise WorkflowExecutionError(f"Facebook Page post failed: HTTP {exc.code}: {body_text[:500]}") from exc
    except (OSError, ValueError) as exc:
        raise WorkflowExecutionError(f"Facebook Page post failed: {exc}") from exc

    post_id = data.get("id") or data.get("post_id")
    if not post_id:
        raise WorkflowExecutionError(f"Facebook Page post returned no post id: {data}")
    return {
        "posted": True,
        "target": "facebook_page",
        "page_id": page_id,
        "post_id": post_id,
        "graph_version": graph_version,
    }


def _load_cached_jobs() -> list[dict]:
    with get_connection() as conn:
        try:
            rows = conn.execute(
                """
                SELECT url, title, company, location, salary, salary_min, salary_max, source,
                       posted_date, skills, description_snippet, created_at, updated_at
                FROM cached_jobs
                ORDER BY updated_at DESC
                LIMIT 500
                """
            ).fetchall()
        except Exception:
            rows = []
    jobs = []
    for row in rows:
        item = dict(row)
        try:
            item["skills"] = json.loads(item.get("skills") or "[]")
        except json.JSONDecodeError:
            item["skills"] = []
        jobs.append(item)
    if jobs:
        return jobs
    if JOB_CACHE_FILE.exists():
        try:
            data = json.loads(JOB_CACHE_FILE.read_text())
            return data if isinstance(data, list) else []
        except (OSError, json.JSONDecodeError):
            return []
    return []


def _parse_loose_datetime(value) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    for candidate in (text, text[:19], text[:10]):
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(candidate.replace("Z", ""), fmt)
            except ValueError:
                continue
    return None


def _format_job_search_message(jobs: list[dict], keywords: list) -> str:
    lines = [f"💼 Job mới: {', '.join(str(item) for item in keywords[:5])}"]
    if not jobs:
        lines.append("Chưa tìm thấy job phù hợp trong cache hiện tại.")
        return "\n".join(lines)
    for idx, job in enumerate(jobs[:10], start=1):
        title = job.get("title") or "Không tiêu đề"
        company = job.get("company") or "Không rõ công ty"
        salary = job.get("salary") or "Thỏa thuận"
        source = job.get("source") or ""
        url = job.get("url") or ""
        lines.append(f"{idx}. {title} — {company}")
        lines.append(f"   {salary}{f' · {source}' if source else ''}")
        if url:
            lines.append(f"   {url}")
    return "\n".join(lines)


def _extract_hot_terms(texts: list[str], *, max_topics: int = 8) -> list[dict]:
    stopwords = {
        "mình", "minh", "bạn", "ban", "anh", "chị", "chi", "em", "của", "cua", "cho", "với", "voi",
        "là", "la", "thì", "thi", "mà", "ma", "được", "duoc", "không", "khong", "này", "nay",
        "đang", "dang", "trong", "các", "cac", "những", "nhung", "một", "mot", "the", "and",
        "that", "this", "you", "your", "http", "https", "com", "www",
    }
    counter: Counter[str] = Counter()
    for text in texts:
        normalized = _normalize_vietnamese(text)
        words = [word for word in re.findall(r"[a-z0-9]{3,}", normalized) if word not in stopwords]
        counter.update(words)
        for idx in range(len(words) - 1):
            phrase = f"{words[idx]} {words[idx + 1]}"
            if not any(part in stopwords for part in phrase.split()):
                counter[phrase] += 2
    return [{"topic": topic, "score": score} for topic, score in counter.most_common(max_topics)]


def _format_hot_topics_message(topics: list[dict]) -> str:
    lines = ["🔥 Chủ đề hot Facebook"]
    for idx, item in enumerate(topics, start=1):
        lines.append(f"{idx}. {item.get('topic')} ({item.get('score')})")
    return "\n".join(lines)


def _input_message(node_input) -> str:
    if isinstance(node_input, dict):
        if node_input.get("content"):
            return str(node_input["content"])
        if node_input.get("message"):
            return str(node_input["message"])
        if isinstance(node_input.get("payload"), dict):
            return _input_message(node_input["payload"])
    return ""


def _resolve_facebook_target(user_id: str, *, conversation_id: str = "", external_id: str = "", target_name: str = "") -> dict | None:
    from api.services.omni_store import ensure_conversation, get_conversation

    if conversation_id:
        conv = get_conversation(conversation_id)
        if conv and conv.get("user_id") == user_id and conv.get("platform") == "facebook":
            return conv

    with get_connection() as conn:
        row = None
        if external_id:
            row = conn.execute(
                "SELECT * FROM omni_conversations WHERE user_id = ? AND platform = 'facebook' AND external_id = ? LIMIT 1",
                (user_id, external_id),
            ).fetchone()
        if not row and target_name:
            like = f"%{target_name}%"
            row = conn.execute(
                """
                SELECT * FROM omni_conversations
                WHERE user_id = ? AND platform = 'facebook'
                  AND (title LIKE ? OR custom_name LIKE ?)
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (user_id, like, like),
            ).fetchone()
        if row:
            return dict(row)
    if external_id:
        return ensure_conversation(user_id, "facebook", target_name or external_id, external_id, "user", "")
    return None


def _node_text(parent, name: str) -> str:
    node = parent.find(name)
    return (node.text or "").strip() if node is not None and node.text else ""


def _clean_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value or "")
    return " ".join(unescape(text).split())


def _format_news_message(source: str, items: list[dict]) -> str:
    lines = [f"📰 {source} — tin mới"]
    if not items:
        lines.append("Không có tin mới.")
        return "\n".join(lines)
    for idx, item in enumerate(items, start=1):
        title = item.get("title") or "(không tiêu đề)"
        link = item.get("link") or ""
        lines.append(f"{idx}. {title}")
        if link:
            lines.append(link)
    return "\n".join(lines)


def _http_text(url: str, timeout: float = 30) -> str:
    req = request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 HAgent Workflow/1.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        method="GET",
    )
    with request.urlopen(req, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace")


def _fetch_doji_gold(url: str) -> tuple[list[dict], str]:
    try:
        html = _http_text(url, 30)
    except (error.HTTPError, OSError) as exc:
        raise WorkflowExecutionError(f"Gold price request failed: {exc}") from exc

    items = []
    for tr in re.finditer(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL | re.IGNORECASE):
        cols = re.findall(r"<td[^>]*>(.*?)</td>", tr.group(1), re.DOTALL | re.IGNORECASE)
        if len(cols) < 3:
            continue
        name = _clean_html(cols[0])
        buy = _clean_html(cols[1])
        sell = _clean_html(cols[2])
        if name and re.search(r"\d", buy):
            items.append({"name": name, "buy": buy, "sell": sell})
    updated_match = re.search(r"C(?:ậ|a)p\s*nh(?:ậ|a)t\s*l(?:ú|u)c:?\s*([^<\n]+)", html, re.IGNORECASE)
    updated = _clean_update_text(updated_match.group(1)) if updated_match else "Vừa cập nhật"
    return items[:20], updated


def _fetch_price_report_from_finance_tools(errors: list[str]) -> tuple[list[dict], str, list[dict], str, dict]:
    raw = {}
    gold_items, gold_updated = [], ""
    silver_items, silver_updated = [], ""
    try:
        from tools.finance_tools import get_gold_price, _handle_get_silver_price
    except Exception as exc:  # noqa: BLE001
        errors.append(f"Finance tools unavailable: {exc}")
        return gold_items, gold_updated, silver_items, silver_updated, raw

    try:
        gold_text = asyncio.run(get_gold_price())
        raw["gold"] = gold_text
        gold_items, gold_updated = _parse_gold_tool_output(gold_text)
        if gold_text.lower().startswith("lỗi") or gold_text.lower().startswith("loi"):
            errors.append(gold_text)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"Gold tool failed: {exc}")

    try:
        silver_text = asyncio.run(_handle_get_silver_price({}))
        raw["silver"] = silver_text
        silver_items, silver_updated = _parse_silver_tool_output(silver_text)
        if silver_text.lower().startswith("loi") or silver_text.lower().startswith("khong"):
            errors.append(silver_text)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"Silver tool failed: {exc}")

    return gold_items, gold_updated, silver_items, silver_updated, raw


def _parse_gold_tool_output(text: str) -> tuple[list[dict], str]:
    updated = ""
    match = re.search(r"C(?:ậ|a)p\s*nh(?:ậ|a)t:?\s*([^\n]+)", text, re.IGNORECASE)
    if match:
        updated = _clean_update_text(match.group(1))
    items = []
    for line in text.splitlines():
        match = re.search(r"[-•]\s*(.*?):\s*Mua\s*([^|]+)\|\s*B(?:á|a)n\s*(.+)$", line.strip(), re.IGNORECASE)
        if match:
            items.append({
                "name": match.group(1).strip(),
                "buy": match.group(2).strip(),
                "sell": match.group(3).strip(),
            })
    return items, updated or "Vừa cập nhật"


def _parse_silver_tool_output(text: str) -> tuple[list[dict], str]:
    updated = ""
    match = re.search(r"C(?:ậ|a)p\s*nh(?:ậ|a)t:?\s*([^\n]+)", text, re.IGNORECASE)
    if match:
        updated = _clean_update_text(match.group(1))
    items = []
    for line in text.splitlines():
        match = re.search(r"[-•]\s*(.*?):\s*Mua\s*([^|]+)\|\s*B(?:á|a)n\s*(.+)$", line.strip(), re.IGNORECASE)
        if not match:
            continue
        name = match.group(1).strip()
        unit = "1 lượng" if re.search(r"1\s*luong|1\s*lượng", name, re.IGNORECASE) else ""
        if not unit and re.search(r"kg", name, re.IGNORECASE):
            unit = "1 kg"
        if not unit and re.search(r"5\s*luong|5\s*lượng", name, re.IGNORECASE):
            unit = "5 lượng"
        items.append({
            "name": name,
            "unit": unit,
            "buy": match.group(2).strip(),
            "sell": match.group(3).strip(),
        })
    return items, updated or "Vừa cập nhật"


def _fetch_silver_prices_with_fallbacks(config: dict, primary_url: str, errors: list[str]) -> tuple[list[dict], str]:
    raw_urls = config.get("silver_urls")
    urls = []
    if isinstance(raw_urls, list):
        urls.extend(str(url).strip() for url in raw_urls if str(url).strip())
    elif isinstance(raw_urls, str):
        urls.extend(part.strip() for part in re.split(r"[,;\n]", raw_urls) if part.strip())
    urls.append(primary_url)
    urls.extend(["https://giabac.net/", "https://giabac.org/"])

    seen = set()
    for url in urls:
        if not url or url in seen:
            continue
        seen.add(url)
        try:
            return _fetch_silver_prices(url)
        except WorkflowExecutionError as exc:
            errors.append(str(exc))
    return [], ""


def _fetch_silver_prices(url: str) -> tuple[list[dict], str]:
    try:
        html = _http_text(url, 30)
    except (error.HTTPError, OSError) as exc:
        raise WorkflowExecutionError(f"Silver price request failed: {exc}") from exc

    items = []
    for tr in re.finditer(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL | re.IGNORECASE):
        cols = [_clean_html(col) for col in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr.group(1), re.DOTALL | re.IGNORECASE)]
        cols = [col for col in cols if col]
        joined = " | ".join(cols)
        if len(cols) >= 5 and re.search(r"\d", joined) and re.search(r"bạc|phú|999|kg|lượng", joined, re.IGNORECASE):
            # giabac.org style: Hãng | Mua 1 lượng | Bán 1 lượng | Mua 1 kg | Bán 1 kg
            items.append({
                "name": cols[0],
                "unit": "1 lượng",
                "buy": cols[1],
                "sell": cols[2],
                "kg_buy": cols[3],
                "kg_sell": cols[4],
            })
        elif len(cols) >= 4 and re.search(r"\d", joined) and re.search(r"bạc|phú|999|kg|lượng", joined, re.IGNORECASE):
            # giabac.co style: Sản phẩm | Đơn vị | Giá mua vào | Giá bán ra
            items.append({"name": cols[0], "unit": cols[1], "buy": cols[2], "sell": cols[3]})

    if not items:
        text = _clean_html(html)
        for match in re.finditer(r"((?:Phú Quý|Bạc)[^\n]{0,120}?)(\d[\d.,]+)\s+(\d[\d.,]+)", text, re.IGNORECASE):
            items.append({"name": match.group(1).strip(), "unit": "", "buy": match.group(2), "sell": match.group(3)})

    updated_match = re.search(r"C(?:ậ|a)p\s*nh(?:ậ|a)t[^:<]*:?\s*([^<\n]{6,80})", html, re.IGNORECASE)
    updated = _clean_update_text(updated_match.group(1)) if updated_match else "Vừa cập nhật"
    return items[:10], updated


def _pick_gold_ring_item(items: list[dict]) -> dict | None:
    def score(item: dict) -> int:
        name = _normalize_vietnamese(str(item.get("name") or ""))
        value = 0
        if "nhan" in name:
            value += 10
        if "tron" in name or "trơn" in str(item.get("name") or "").lower():
            value += 8
        if "hung thinh vuong" in name or "htv" in name:
            value += 5
        if "9999" in name or "999.9" in name:
            value += 3
        return value

    ranked = sorted((item for item in items if item.get("buy") or item.get("sell")), key=score, reverse=True)
    if ranked and score(ranked[0]) > 0:
        return ranked[0]
    return ranked[0] if ranked else None


def _pick_silver_luong_item(items: list[dict]) -> dict | None:
    def score(item: dict) -> int:
        name = _normalize_vietnamese(str(item.get("name") or ""))
        unit = _normalize_vietnamese(str(item.get("unit") or ""))
        value = 0
        if "luong" in unit or "luong" in name:
            value += 10
        if "1 luong" in unit or "1 luong" in name:
            value += 6
        if "5 luong" in unit or "5 luong" in name:
            value -= 4
        if "phu quy" in name:
            value += 4
        if "999" in name:
            value += 2
        return value

    ranked = sorted((item for item in items if item.get("buy") or item.get("sell")), key=score, reverse=True)
    if ranked and score(ranked[0]) > 0:
        return ranked[0]
    return ranked[0] if ranked else None


def _format_compact_price_report_message(gold_item: dict | None, silver_item: dict | None, gold_updated: str, silver_updated: str) -> str:
    lines = ["📊 Giá vàng/bạc hôm nay"]
    if gold_item:
        lines.append(f"🥇 Vàng nhẫn trơn: Mua {gold_item.get('buy')} | Bán {gold_item.get('sell')}")
    else:
        lines.append("🥇 Vàng nhẫn trơn: chưa đọc được giá.")
    if silver_item:
        lines.append(f"🥈 Bạc/lượng: Mua {_format_thousand_unit(silver_item.get('buy'))} | Bán {_format_thousand_unit(silver_item.get('sell'))}")
    else:
        lines.append("🥈 Bạc/lượng: chưa đọc được giá.")
    updated = _clean_update_text(gold_updated) or _clean_update_text(silver_updated)
    if updated:
        lines.append(f"⏱ Cập nhật: {updated}")
    return "\n".join(lines)


def _clean_update_text(value) -> str:
    text = _clean_html(str(value or "")).strip()
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"^(?:c(?:ậ|a)p\s*nh(?:ậ|a)t(?:\s*l(?:ú|u)c)?\s*:?\s*)+", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"\s+c(?:ậ|a)p\s*nh(?:ậ|a)t(?:\s*l(?:ú|u)c)?\s*:?\s*", " ", text, flags=re.IGNORECASE).strip()
    words = text.split()
    if len(words) % 2 == 0:
        half = len(words) // 2
        first = " ".join(words[:half])
        second = " ".join(words[half:])
        if _normalize_vietnamese(first) == _normalize_vietnamese(second):
            text = first
    return text


def _format_thousand_unit(value) -> str:
    """Format VND values as thousand-VND units, e.g. 2.865.000 -> 2,865."""
    text = str(value or "").strip()
    digits = re.sub(r"[^\d]", "", text)
    if not digits:
        return text
    try:
        number = int(digits)
    except ValueError:
        return text
    if number >= 1000:
        number = round(number / 1000)
    return f"{number:,}"


def _normalize_vietnamese(value: str) -> str:
    table = str.maketrans(
        "àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ"
        "ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ",
        "aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd"
        "AAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD",
    )
    return value.translate(table).lower()


def _resolve_zalo_target(user_id: str, *, conversation_id: str = "", external_id: str = "", target_name: str = "", thread_type: str = "") -> dict | None:
    from api.services.omni_store import ensure_conversation, get_conversation

    if conversation_id:
        conv = get_conversation(conversation_id)
        if conv and conv.get("user_id") == user_id and conv.get("platform") == "zalo":
            return conv

    with get_connection() as conn:
        row = None
        if external_id:
            row = conn.execute(
                "SELECT * FROM omni_conversations WHERE user_id = ? AND platform = 'zalo' AND external_id = ? LIMIT 1",
                (user_id, external_id),
            ).fetchone()
        if not row and target_name:
            like = f"%{target_name}%"
            row = conn.execute(
                """
                SELECT * FROM omni_conversations
                WHERE user_id = ? AND platform = 'zalo'
                  AND (title LIKE ? OR custom_name LIKE ?)
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (user_id, like, like),
            ).fetchone()
        if row:
            conv = dict(row)
            stored_thread_type = str(conv.get("thread_type") or "").lower()
            # If sync already knows this target is a group, never downgrade it to user
            # because Zalo bridge must use the correct ThreadType for delivery.
            if thread_type and stored_thread_type != "group" and stored_thread_type != thread_type:
                conv["thread_type"] = thread_type
            return conv

        contact = None
        if external_id:
            contact = conn.execute(
                "SELECT platform, external_id, name, avatar_url FROM omni_contacts WHERE user_id = ? AND platform = 'zalo' AND external_id = ? LIMIT 1",
                (user_id, external_id),
            ).fetchone()
        if not contact and target_name:
            like = f"%{target_name}%"
            contact = conn.execute(
                """
                SELECT platform, external_id, name, avatar_url
                FROM omni_contacts
                WHERE user_id = ? AND platform = 'zalo' AND name LIKE ?
                ORDER BY last_message_at DESC, created_at DESC
                LIMIT 1
                """,
                (user_id, like),
            ).fetchone()
    if contact and contact["external_id"]:
        return ensure_conversation(
            user_id,
            "zalo",
            contact["name"] or contact["external_id"],
            contact["external_id"],
            thread_type or "user",
            contact["avatar_url"] or "",
        )
    if external_id:
        return ensure_conversation(user_id, "zalo", target_name or external_id, external_id, thread_type or "user")
    return None
