from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import asyncio
from playwright.async_api import async_playwright

router = APIRouter(prefix="/job-hunter", tags=["Job Hunter"])

class ScrapeRequest(BaseModel):
    keywords: List[str]
    source: str = "itviec"
    max_pages: int = 1

class JobResult(BaseModel):
    url: str
    title: str
    company: str
    location: Optional[str] = None
    salary: Optional[str] = None

@router.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now()}

@router.post("/scrape")
async def scrape_jobs(req: ScrapeRequest):
    # This is a simplified version of the ITViec scraper
    # integrated directly into the Python Agent to avoid duplication.
    all_jobs = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        page = await context.new_page()

        for keyword in req.keywords:
            for page_num in range(1, req.max_pages + 1):
                search_url = f"https://itviec.com/it-jobs/{keyword.replace(' ', '-')}"
                if page_num > 1:
                    search_url += f"?page={page_num}"

                try:
                    await page.goto(search_url, timeout=30000)
                    await asyncio.sleep(2) # Minimal delay

                    job_cards = await page.query_selector_all(".job-card")
                    if not job_cards:
                        break

                    for card in job_cards:
                        title_elem = await card.query_selector(".title a")
                        if title_elem:
                            title = await title_elem.inner_text()
                            url = "https://itviec.com" + await title_elem.get_attribute("href")
                            
                            company_elem = await card.query_selector(".company-name")
                            company = await company_elem.inner_text() if company_elem else "Unknown"
                            
                            location_elem = await card.query_selector(".city")
                            location = await location_elem.inner_text() if location_elem else "Vietnam"
                            
                            all_jobs.append({
                                "url": url,
                                "title": title.strip(),
                                "company": company.strip(),
                                "location": location.strip()
                            })
                except Exception as e:
                    print(f"Error scraping {search_url}: {e}")

        await browser.close()
        
    return {"jobs": all_jobs, "count": len(all_jobs)}
