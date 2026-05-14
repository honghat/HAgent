import asyncio
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from models.job import RawJob, ParsedJob
from modules.scraper.itviec import ITViecScraper
from utils.llm import llm

app = FastAPI(title="Auto Job Hunter API")

# Scrapers registry
scrapers = {
    "itviec": ITViecScraper()
}

class ScrapeRequest(BaseModel):
    keywords: List[str]
    source: str = "itviec"
    max_pages: int = 2

class JobDetailRequest(BaseModel):
    url: str
    source: str = "itviec"

@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now()}

@app.post("/scrape")
async def scrape_jobs(req: ScrapeRequest):
    if req.source not in scrapers:
        raise HTTPException(status_code=400, detail=f"Source {req.source} not supported")

    scraper = scrapers[req.source]
    jobs = await scraper.scrape(req.keywords, max_pages=req.max_pages)

    return {
        "count": len(jobs),
        "jobs": [j.__dict__ for j in jobs]
    }

@app.post("/scrape-detail")
async def scrape_job_detail(req: JobDetailRequest):
    if req.source not in scrapers:
        raise HTTPException(status_code=400, detail=f"Source {req.source} not supported")

    scraper = scrapers[req.source]
    jd_html = await scraper.scrape_detail(req.url)

    return {"url": req.url, "description_html": jd_html}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8005)
