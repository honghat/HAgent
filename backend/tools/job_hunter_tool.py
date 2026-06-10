#!/usr/bin/env python3
import json
from datetime import datetime, timedelta
from typing import List, Optional

from tools.registry import registry

from api.routers.cv import CVJobCompareBody, _call_ai_job_compare, _fallback_job_compare
from api.routers.job_hunter import ScrapeRequest, load_prefs, scrape_jobs, search_jobs
from api.services.db import get_connection
from api.services.user_store import resolve_user_id


def _json(data) -> str:
    return json.dumps(data, ensure_ascii=False, default=str)


def _resolve_user_id(user_token: str | None) -> str:
    uid = resolve_user_id((user_token or "hat").strip() or "hat")
    if not uid:
        raise ValueError("Không tìm thấy user để lấy CV.")
    return uid


def _latest_cv_text(user_id: str) -> str:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT extracted_text
            FROM cv_documents
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (user_id,),
        ).fetchone()
    return str(row["extracted_text"] or "") if row else ""


def _find_job(job_url: str = "", title: str = "", company: str = "") -> dict | None:
    with get_connection() as conn:
        if job_url:
            row = conn.execute(
                """
                SELECT url, title, company, location, salary, salary_min, salary_max, source,
                       posted_date, skills, description_snippet, created_at, updated_at
                FROM cached_jobs
                WHERE url = ?
                LIMIT 1
                """,
                (job_url,),
            ).fetchone()
            if row:
                item = dict(row)
                item["skills"] = json.loads(item.get("skills") or "[]")
                return item
        clauses = []
        params = []
        if title:
            clauses.append("LOWER(title) LIKE ?")
            params.append(f"%{title.lower()}%")
        if company:
            clauses.append("LOWER(company) LIKE ?")
            params.append(f"%{company.lower()}%")
        if not clauses:
            return None
        row = conn.execute(
            f"""
            SELECT url, title, company, location, salary, salary_min, salary_max, source,
                   posted_date, skills, description_snippet, created_at, updated_at
            FROM cached_jobs
            WHERE {' AND '.join(clauses)}
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            params,
        ).fetchone()
    if not row:
        return None
    item = dict(row)
    item["skills"] = json.loads(item.get("skills") or "[]")
    return item


# 👇 MỚI: Hàm thay thế _match_new_jobs (không cần file riêng)
def __match_new_jobs(user_id: str, cv_text: str, recent_hours: int = 36) -> dict:
    cutoff = (datetime.now() - timedelta(hours=max(1, min(168, int(recent_hours or 36))))).isoformat()
    matched_count = 0
    total_checked = 0
    top_matches = []

    with get_connection() as conn:
        # Lấy tất cả JD mới
        rows = conn.execute(
            """
            SELECT url, title, company, location, salary, salary_min, salary_max, source,
                   posted_date, skills, description_snippet
            FROM cached_jobs
            WHERE updated_at >= ?
            ORDER BY updated_at DESC
            """,
            (cutoff,),
        ).fetchall()

        for row in rows:
            total_checked += 1
            job = dict(row)
            job["skills"] = json.loads(job.get("skills") or "[]")

            try:
                prefs = load_prefs(user_id)
            except Exception:
                prefs = None

            body = CVJobCompareBody(
                title=job.get("title") or "",
                company=job.get("company") or "",
                url=job.get("url") or "",
                description=job.get("description_snippet") or "",
                skills=job.get("skills") or [],
                location=job.get("location") or "",
                salary=job.get("salary"),
                salary_min=job.get("salary_min"),
                salary_max=job.get("salary_max"),
                source=job.get("source"),
                provider=None,
                model=None,
            )

            try:
                result = _fallback_job_compare(cv_text, body, prefs)
            except Exception as e:
                result = {
                    "match_score": 0,
                    "verdict": "Lỗi so sánh",
                    "error": str(e),
                    "matched": [],
                    "missing": [],
                }

            match_score = result.get("match_score", 0)
            verdict = result.get("verdict", "Không rõ")
            matched = result.get("matched", [])
            missing = result.get("missing", [])

            # Lưu vào cv_match_scores
            conn.execute(
                """
                INSERT OR REPLACE INTO cv_match_scores
                (user_id, job_url, match_score, verdict, matched_json, missing_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    job["url"],
                    match_score,
                    verdict,
                    json.dumps(matched, ensure_ascii=False),
                    json.dumps(missing, ensure_ascii=False),
                    datetime.now().isoformat(),
                ),
            )
            conn.commit()

            if match_score > 0:
                matched_count += 1
                top_matches.append({
                    "job_url": job["url"],
                    "title": job["title"],
                    "company": job["company"],
                    "match_score": match_score,
                    "verdict": verdict,
                    "location": job.get("location"),
                    "salary": job.get("salary"),
                })

    # Sắp xếp top matches theo điểm số giảm dần
    top_matches.sort(key=lambda x: x["match_score"], reverse=True)
    return {
        "total_checked": total_checked,
        "matched_count": matched_count,
        "top": top_matches[:10],
        "message": f"Đã so sánh {total_checked} JD, tìm được {matched_count} JD phù hợp.",
    }


@registry.register(
    name="job_hunter_scrape",
    toolset="job_hunter",
    emoji="🔍",
    description="Scrape real Vietnamese job posts and persist JD results into the HAgent SQLite cached_jobs database.",
    parameters={
        "type": "object",
        "properties": {
            "keywords": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Keywords to search for, e.g. ['data analyst', 'finance analyst'].",
            },
            "sources": {
                "type": "array",
                "items": {"type": "string", "enum": ["itviec", "topdev", "vietnamworks", "careerlink", "careerviet"]},
                "description": "Job sources to scrape. Defaults to all supported sources.",
            },
            "max_pages": {
                "type": "integer",
                "default": 1,
                "description": "Number of pages to scrape per source.",
            },
        },
        "required": ["keywords"],
    },
)
async def job_hunter_scrape(keywords: List[str], sources: Optional[List[str]] = None, max_pages: int = 1):
    req = ScrapeRequest(
        keywords=[str(item).strip() for item in keywords if str(item).strip()],
        sources=sources or ["itviec", "topdev", "vietnamworks", "careerlink", "careerviet"],
        max_pages=max(1, min(5, int(max_pages or 1))),
    )
    result = await scrape_jobs(req)
    return _json({
        "count": result.get("count", 0),
        "new_count": result.get("new_count", 0),
        "total_cached": result.get("total_cached", 0),
        "db_saved_count": result.get("db_saved_count", 0),
        "db_table": result.get("db_table", "cached_jobs"),
        "jobs": (result.get("jobs") or [])[:10],
        "message": "Đã quét JD thật và xác nhận lưu vào SQLite bảng cached_jobs. Dùng job_hunter_match_new/top_matches để tiếp tục.",
    })


@registry.register(
    name="job_hunter_search",
    toolset="job_hunter",
    emoji="🔎",
    description="Search persisted JD records from the HAgent SQLite cached_jobs database.",
    parameters={
        "type": "object",
        "properties": {
            "keyword": {"type": "string", "description": "Search keyword in title, company, description, or skills."},
            "source": {"type": "string", "enum": ["itviec", "topdev", "vietnamworks", "careerlink", "careerviet"]},
            "location": {"type": "string", "description": "Filter by city, e.g. 'Hồ Chí Minh', 'Hà Nội'."},
            "salary_min": {"type": "integer", "description": "Minimum salary in VND."},
            "limit": {"type": "integer", "default": 10},
        },
    },
)
async def job_hunter_search(
    keyword: Optional[str] = None,
    source: Optional[str] = None,
    location: Optional[str] = None,
    salary_min: Optional[int] = None,
    limit: int = 10,
):
    result = await search_jobs(
        keyword=keyword,
        source=source,
        location=location,
        salary_min=salary_min,
        limit=max(1, min(50, int(limit or 10))),
    )
    return _json(result)


@registry.register(
    name="job_hunter_compare_cv_job",
    toolset="job_hunter",
    emoji="🧭",
    description="Compare the latest stored CV against one persisted JD from SQLite and return match score, gaps, CV edits, and interview focus.",
    parameters={
        "type": "object",
        "properties": {
            "job_url": {"type": "string", "description": "Exact JD URL stored in cached_jobs. Preferred."},
            "title": {"type": "string", "description": "Fallback title search if job_url is not known."},
            "company": {"type": "string", "description": "Optional company filter for title search."},
            "user_token": {"type": "string", "default": "hat", "description": "HAgent user token/username used to resolve latest CV."},
            "provider": {"type": "string", "description": "Optional AI provider for deeper comparison."},
            "model": {"type": "string", "description": "Optional model for the provider."},
        },
    },
)
async def job_hunter_compare_cv_job(
    job_url: str = "",
    title: str = "",
    company: str = "",
    user_token: str = "hat",
    provider: Optional[str] = None,
    model: Optional[str] = None,
):
    user_id = _resolve_user_id(user_token)
    cv_text = _latest_cv_text(user_id)
    if not cv_text:
        return _json({"error": "Chưa có CV đã lưu. Hãy nạp CV trong Săn việc trước."})
    job = _find_job(job_url=job_url.strip(), title=title.strip(), company=company.strip())
    if not job:
        return _json({"error": "Không tìm thấy JD trong SQLite cached_jobs.", "job_url": job_url, "title": title, "company": company})
    try:
        prefs = load_prefs(user_id)
    except Exception:
        prefs = None
    body = CVJobCompareBody(
        title=job.get("title") or "",
        company=job.get("company") or "",
        url=job.get("url") or "",
        description=job.get("description_snippet") or "",
        skills=job.get("skills") or [],
        location=job.get("location") or "",
        salary=job.get("salary"),
        salary_min=job.get("salary_min"),
        salary_max=job.get("salary_max"),
        source=job.get("source"),
        provider=provider,
        model=model,
    )
    try:
        result = _call_ai_job_compare(cv_text, body, prefs) if provider else _fallback_job_compare(cv_text, body, prefs)
    except Exception as exc:  # noqa: BLE001
        result = _fallback_job_compare(cv_text, body, prefs)
        result["ai_error"] = str(exc)
    return _json({"job": job, "result": result})


@registry.register(
    name="job_hunter_match_new",
    toolset="job_hunter",
    emoji="🎯",
    description="Score the latest CV against newly cached JDs (last N hours) using the heuristic _fallback_job_compare and persist results in cv_match_scores. Returns top matches.",
    parameters={
        "type": "object",
        "properties": {
            "user_token": {"type": "string", "default": "hat"},
            "recent_hours": {"type": "integer", "default": 36, "description": "Look at JDs updated within this many hours."},
            "limit": {"type": "integer", "default": 10},
        },
    },
)
async def job_hunter_match_new(user_token: str = "hat", recent_hours: int = 36, limit: int = 10):
    user_id = _resolve_user_id(user_token)
    cv_text = _latest_cv_text(user_id)
    if not cv_text:
        return _json({"error": "Chưa có CV trong cv_documents."})
    summary = __match_new_jobs(user_id, cv_text, recent_hours=max(1, min(168, int(recent_hours or 36))))
    summary["top"] = (summary.get("top") or [])[: max(1, min(50, int(limit or 10)))]
    return _json(summary)


@registry.register(
    name="job_hunter_top_matches",
    toolset="job_hunter",
    emoji="📈",
    description="Return the top auto-matched JDs for a user (from cv_match_scores, joined with cached_jobs). Use this before nudging the user about jobs.",
    parameters={
        "type": "object",
        "properties": {
            "user_token": {"type": "string", "default": "hat"},
            "days": {"type": "integer", "default": 7, "description": "Only include matches updated in the last N days."},
            "min_score": {"type": "integer", "default": 0, "description": "Optional minimum match_score (0-100)."},
            "limit": {"type": "integer", "default": 10},
        },
    },
)
async def job_hunter_top_matches(user_token: str = "hat", days: int = 7, min_score: int = 0, limit: int = 10):
    user_id = _resolve_user_id(user_token)
    cutoff = (datetime.now() - timedelta(days=max(1, min(60, int(days or 7))))).isoformat()
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT m.job_url, m.match_score, m.verdict, m.matched_json, m.missing_json,
                   j.title, j.company, j.location, j.salary, j.salary_min, j.salary_max,
                   j.source, j.posted_date
            FROM cv_match_scores m
            JOIN cached_jobs j ON j.url = m.job_url
            WHERE m.user_id = ? AND m.updated_at >= ? AND m.match_score >= ?
            ORDER BY m.match_score DESC, m.updated_at DESC
            LIMIT ?
            """,
            (user_id, cutoff, max(0, min(100, int(min_score or 0))), max(1, min(50, int(limit or 10)))),
        ).fetchall()
    items = []
    for row in rows:
        item = dict(row)
        try:
            item["matched"] = json.loads(item.pop("matched_json") or "[]")
        except Exception:
            item["matched"] = []
        try:
            item["missing"] = json.loads(item.pop("missing_json") or "[]")
        except Exception:
            item["missing"] = []
        items.append(item)
    return _json({"count": len(items), "items": items})


@registry.register(
    name="job_hunter_source_health",
    toolset="job_hunter",
    emoji="🩺",
    description="Per-source scrape success rate over the last N hours (default 24h). Use this to decide whether to retry a flaky source.",
    parameters={
        "type": "object",
        "properties": {
            "hours": {"type": "integer", "default": 24},
        },
    },
)
async def job_hunter_source_health(hours: int = 24):
    cutoff = (datetime.now() - timedelta(hours=max(1, min(168, int(hours or 24))))).isoformat()
    out: dict = {}
    with get_connection() as conn:
        try:
            rows = conn.execute(
                """
                SELECT source,
                       COUNT(*) AS runs,
                       SUM(CASE WHEN ok=1 THEN 1 ELSE 0 END) AS oks,
                       SUM(count) AS total_jobs,
                       MAX(created_at) AS last_run,
                       (SELECT error FROM scrape_runs sr2
                        WHERE sr2.source = sr.source AND sr2.ok = 0
                        ORDER BY created_at DESC LIMIT 1) AS last_error
                FROM scrape_runs sr
                WHERE created_at >= ?
                GROUP BY source
                ORDER BY source
                """,
                (cutoff,),
            ).fetchall()
        except Exception:
            rows = []
    for row in rows:
        item = dict(row)
        runs = item.get("runs") or 0
        oks = item.get("oks") or 0
        item["success_rate"] = round((oks / runs) * 100) if runs else 0
        out[item["source"]] = item
    return _json({"window_hours": hours, "sources": out})


@registry.register(
    name="cv_generate_docx",
    toolset="job_hunter",
    emoji="📝",
    description="AI-rewrite the user's stored CV (.docx) tailored to a target JD (mode='jd') or general role (mode='role'). Output is a fresh .docx file on disk; returns its download URL and the number of paragraphs changed.",
    parameters={
        "type": "object",
        "properties": {
            "mode": {"type": "string", "enum": ["jd", "role"], "default": "role"},
            "user_token": {"type": "string", "default": "hat"},
            "target_role": {"type": "string", "description": "For mode='role': target role like 'Senior Data Analyst'."},
            "job_url": {"type": "string", "description": "For mode='jd': JD url stored in cached_jobs (preferred)."},
            "job_title": {"type": "string", "description": "For mode='jd': fallback title."},
            "job_company": {"type": "string", "description": "For mode='jd': optional company hint."},
            "job_description": {"type": "string", "description": "For mode='jd': optional JD snippet to use as context."},
            "provider": {"type": "string", "description": "Optional LLM provider override (eg 'pekpik','cx','deepseek')."},
            "model": {"type": "string", "description": "Optional model override."},
        },
        "required": ["mode"],
    },
)
async def cv_generate_docx_tool(
    mode: str = "role",
    user_token: str = "hat",
    target_role: str = "",
    job_url: str = "",
    job_title: str = "",
    job_company: str = "",
    job_description: str = "",
    provider: Optional[str] = None,
    model: Optional[str] = None,
):
    from api.routers.cv_generate import (
        GenerateBody,
        _build_prompt,
        _call_llm,
        _latest_cv,
        _read_docx_paragraphs,
        _replace_paragraph_text,
        _write_docx,
        GENERATED_DIR,
    )
    from pathlib import Path
    from uuid import uuid4

    uid = _resolve_user_id(user_token)
    cv = _latest_cv(uid)
    if not cv:
        return _json({"error": "Chưa có CV trong cv_documents. Upload trước."})
    src_path = Path(cv["file_path"])
    if not src_path.exists() or src_path.suffix.lower() != ".docx":
        return _json({"error": "CV nguồn không phải .docx hoặc đã mất."})

    if mode == "jd" and not (job_url or job_title or job_description):
        # Try to resolve from cached_jobs if we only have hints
        found = _find_job(job_url=job_url, title=job_title, company=job_company)
        if found:
            job_url = found.get("url") or job_url
            job_title = found.get("title") or job_title
            job_company = found.get("company") or job_company
            job_description = found.get("description_snippet") or job_description
        else:
            return _json({"error": "Không tìm thấy JD phù hợp cho mode='jd'. Vui lòng cung cấp job_url, job_title hoặc job_description."})

    # Build prompt & generate
    body = GenerateBody(
        mode=mode,
        target_role=target_role,
        job_url=job_url,
        job_title=job_title,
        job_company=job_company,
        job_description=job_description,
        provider=provider,
        model=model,
    )
    prompt = _build_prompt(cv["extracted_text"], body)
    try:
        llm_response = _call_llm(prompt, provider=provider, model=model)
    except Exception as e:
        return _json({"error": f"LLM gọi thất bại: {e}"})

    # Parse & rewrite
    paragraphs = _read_docx_paragraphs(src_path)
    new_paragraphs = _replace_paragraph_text(paragraphs, llm_response)
    output_path = GENERATED_DIR / f"cv_rewritten_{uid}_{uuid4().hex[:8]}.docx"
    _write_docx(new_paragraphs, output_path)

    return _json({
        "download_url": f"/api/cv/download/{output_path.name}",
        "changed_paragraphs": sum(1 for i, (old, new) in enumerate(zip(paragraphs, new_paragraphs)) if old != new),
        "output_file": output_path.name,
    })