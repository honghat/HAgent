#!/usr/bin/env python3
import json
import logging
from typing import List, Optional
from tools.registry import registry
from api.routers.job_hunter import _scrape_source, SOURCE_CONF, _load_cache, search_jobs, ScrapeRequest
from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)

@registry.register(
    name="job_hunter_scrape",
    toolset="job_hunter",
    emoji="🔍",
    description="Scrape jobs from multiple Vietnamese tech job sites (ITViec, TopDev, VietnamWorks, CareerLink).",
    parameters={
        "type": "object",
        "properties": {
            "keywords": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Keywords to search for (e.g. ['python', 'react'])."
            },
            "sources": {
                "type": "array",
                "items": {"type": "string"},
                "enum": ["itviec", "topdev", "vietnamworks", "careerlink"],
                "description": "Job sources to scrape. Defaults to all if not specified."
            },
            "max_pages": {
                "type": "integer",
                "default": 1,
                "description": "Number of pages to scrape per source."
            }
        },
        "required": ["keywords"]
    }
)
async def job_hunter_scrape(keywords: List[str], sources: Optional[List[str]] = None, max_pages: int = 1):
    if not sources:
        sources = list(SOURCE_CONF.keys())
    
    all_jobs = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            import asyncio
            tasks = []
            for kw in keywords:
                for src in sources:
                    for pg in range(1, max_pages + 1):
                        tasks.append(_scrape_source(browser, kw, src, pg))

            # Run with concurrency limit
            sem = asyncio.Semaphore(3)
            async def limited(t):
                async with sem:
                    return await t
            results = await asyncio.gather(*[limited(t) for t in tasks])
            for r in results:
                all_jobs.extend(r)
        finally:
            await browser.close()

    # Dedup and save to cache (internal logic of job_hunter router)
    # We'll just return the results to the agent for now.
    return json.dumps({
        "count": len(all_jobs),
        "jobs": all_jobs[:10], # Return top 10 for brevity in context
        "message": f"Scraped {len(all_jobs)} jobs. Use job_hunter_search to filter or see more."
    }, ensure_ascii=False)

@registry.register(
    name="job_hunter_search",
    toolset="job_hunter",
    emoji="🔎",
    description="Search through already scraped/cached jobs with filters.",
    parameters={
        "type": "object",
        "properties": {
            "keyword": {"type": "string", "description": "Search keyword in title, company, or description."},
            "source": {"type": "string", "enum": ["itviec", "topdev", "vietnamworks", "careerlink"]},
            "location": {"type": "string", "description": "Filter by city (e.g. 'Hồ Chí Minh', 'Hà Nội')."},
            "salary_min": {"type": "integer", "description": "Minimum salary in VND."},
            "limit": {"type": "integer", "default": 10}
        }
    }
)
async def job_hunter_search(
    keyword: Optional[str] = None,
    source: Optional[str] = None,
    location: Optional[str] = None,
    salary_min: Optional[int] = None,
    limit: int = 10
):
    from api.routers.job_hunter import search_jobs
    # search_jobs is an async route function, we can call it directly
    res = await search_jobs(
        keyword=keyword,
        source=source,
        location=location,
        salary_min=salary_min,
        limit=limit
    )
    return json.dumps(res, ensure_ascii=False)
