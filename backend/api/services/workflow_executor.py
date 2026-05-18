from __future__ import annotations

import json
import os
import re
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
    gold_items, gold_updated = _fetch_doji_gold(gold_url)
    silver_items, silver_updated = _fetch_silver_prices(silver_url)
    gold_ring = _pick_gold_ring_item(gold_items)
    silver_luong = _pick_silver_luong_item(silver_items)
    message = _format_compact_price_report_message(gold_ring, silver_luong, gold_updated, silver_updated)
    return {
        "source": {
            "gold": gold_url,
            "silver": silver_url,
        },
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
    updated = _clean_html(updated_match.group(1)) if updated_match else "Vừa cập nhật"
    return items[:20], updated


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
    updated = _clean_html(updated_match.group(1)) if updated_match else "Vừa cập nhật"
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
        lines.append(f"🥈 Bạc/lượng: Mua {silver_item.get('buy')} | Bán {silver_item.get('sell')}")
    else:
        lines.append("🥈 Bạc/lượng: chưa đọc được giá.")
    updated = gold_updated or silver_updated
    if updated:
        lines.append(f"⏱ Cập nhật: {updated}")
    return "\n".join(lines)


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
            if thread_type and conv.get("thread_type") != thread_type:
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
