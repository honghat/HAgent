"""Agent Job Hunter — frontend gọi endpoint này, backend gọi trực tiếp tool function thay vì subprocess."""

import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from api.services.db import get_connection
from api.services.user_store import resolve_user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agent/job-hunter", tags=["Agent Job Hunter"])


def _uid(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    token = auth.replace("Bearer ", "").strip() or request.query_params.get("t", "hat")
    uid = resolve_user_id(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return uid


class AgentRequest(BaseModel):
    action: str  # scrape | compare | generate-cv | search | analyze-cv | match-new | top-matches
    # scrape
    keywords: list[str] = []
    sources: list[str] = ["itviec", "topdev", "careerviet"]
    # compare
    job_url: Optional[str] = None
    job_title: Optional[str] = None
    job_company: Optional[str] = None
    job_description: Optional[str] = None
    job_skills: list[str] = []
    job_location: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    # generate-cv
    mode: Optional[str] = "role"  # jd | role
    target_role: Optional[str] = None
    # analyze-cv (file upload handled separately, but we keep the stub)
    cv_filename: Optional[str] = None
    cv_content_base64: Optional[str] = None
    # search
    keyword: Optional[str] = None
    location_filter: Optional[str] = None


async def _run_tool(action: str, params: dict, uid: str) -> dict:
    """Run a job-hunter tool function directly by calling its implementation.

    This replaces the old subprocess approach that had no access to agent tools.
    Instead, we call the actual Python functions from api.routers.* and tools/.
    """
    from tools.job_hunter_tool import (
        cv_generate_docx_tool,
        job_hunter_compare_cv_job,
        job_hunter_match_new,
        job_hunter_scrape,
        job_hunter_search,
        job_hunter_top_matches,
    )

    user_token = uid or "hat"

    if action == "scrape":
        keywords = params.get("keywords", ["data analyst", "business analyst"])
        sources = params.get("sources", ["itviec", "topdev", "careerviet"])
        result = await job_hunter_scrape(keywords=keywords, sources=sources, max_pages=1)
        parsed = json.loads(result) if isinstance(result, str) else result

        # Auto-match new jobs after scrape
        match_result = await job_hunter_match_new(user_token=user_token, recent_hours=4, limit=10)
        match_parsed = json.loads(match_result) if isinstance(match_result, str) else match_result

        return {
            "ok": True,
            "count": parsed.get("count", 0),
            "new_count": parsed.get("new_count", 0),
            "total_cached": parsed.get("total_cached", 0),
            "db_saved_count": parsed.get("db_saved_count", 0),
            "db_table": parsed.get("db_table", "cached_jobs"),
            "message": f"Đã quét {parsed.get('count', 0)} JD, {parsed.get('new_count', 0)} JD mới, xác nhận {parsed.get('db_saved_count', 0)} JD nằm trong DB cached_jobs. Tự động match CV xong.",
            "top_matches": match_parsed.get("top", []),
        }

    elif action == "compare":
        job_url = params.get("job_url", "")
        title = params.get("job_title", "")
        company = params.get("job_company", "")
        provider = params.get("provider")
        model = params.get("model")
        result = await job_hunter_compare_cv_job(
            job_url=job_url,
            title=title,
            company=company,
            user_token=user_token,
            provider=provider,
            model=model,
        )
        parsed = json.loads(result) if isinstance(result, str) else result
        return {"ok": True, "result": parsed.get("result", parsed), "job": parsed.get("job")}

    elif action == "generate-cv":
        mode = params.get("mode", "role")
        target_role = params.get("target_role", "")
        job_url = params.get("job_url", "")
        job_title = params.get("job_title", "")
        job_company = params.get("job_company", "")
        job_description = params.get("job_description", "")
        result = await cv_generate_docx_tool(
            mode=mode,
            user_token=user_token,
            target_role=target_role,
            job_url=job_url,
            job_title=job_title,
            job_company=job_company,
            job_description=job_description,
        )
        parsed = json.loads(result) if isinstance(result, str) else result
        return {"ok": True, **parsed}

    elif action == "search":
        keyword = params.get("keyword", "")
        location = params.get("location_filter", "")
        result = await job_hunter_search(keyword=keyword, location=location, limit=50)
        parsed = json.loads(result) if isinstance(result, str) else result
        return {"ok": True, "jobs": parsed.get("jobs", parsed.get("items", []))}

    elif action == "match-new":
        recent_hours = params.get("recent_hours", 36)
        limit = params.get("limit", 10)
        result = await job_hunter_match_new(user_token=user_token, recent_hours=recent_hours, limit=limit)
        parsed = json.loads(result) if isinstance(result, str) else result
        return {"ok": True, **parsed}

    elif action == "top-matches":
        days = params.get("days", 7)
        min_score = params.get("min_score", 0)
        limit = params.get("limit", 10)
        result = await job_hunter_top_matches(user_token=user_token, days=days, min_score=min_score, limit=limit)
        parsed = json.loads(result) if isinstance(result, str) else result
        return {"ok": True, "matches": parsed.get("items", []), "count": parsed.get("count", 0)}

    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")


@router.post("")
async def agent_job_hunter(body: AgentRequest, request: Request):
    uid = _uid(request)
    params = body.model_dump()
    action = body.action
    return await _run_tool(action, params, uid)


@router.get("/top-matches")
async def agent_top_matches(request: Request, days: int = 7, min_score: int = 0, limit: int = 10):
    uid = _uid(request)
    params = {"days": days, "min_score": min_score, "limit": limit}
    return await _run_tool("top-matches", params, uid)


@router.post("/scrape")
async def agent_scrape(request: Request, body: AgentRequest = None):
    uid = _uid(request)
    body = body or AgentRequest(action="scrape")
    params = body.model_dump()
    return await _run_tool("scrape", params, uid)


@router.post("/compare")
async def agent_compare(request: Request, body: AgentRequest):
    uid = _uid(request)
    return await _run_tool("compare", body.model_dump(), uid)


@router.post("/generate-cv")
async def agent_generate_cv(request: Request, body: AgentRequest):
    uid = _uid(request)
    return await _run_tool("generate-cv", body.model_dump(), uid)


@router.post("/search")
async def agent_search(request: Request, body: AgentRequest):
    uid = _uid(request)
    return await _run_tool("search", body.model_dump(), uid)


@router.post("/match-new")
async def agent_match_new(request: Request, body: AgentRequest = None):
    uid = _uid(request)
    body = body or AgentRequest(action="match-new")
    return await _run_tool("match-new", body.model_dump(), uid)
