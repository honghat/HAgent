import asyncio
from api.routers.job_hunter import _scrape_source
from playwright.async_api import async_playwright

async def test():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            print("Testing TopDev scrape...")
            jobs = await _scrape_source(browser, "python", "topdev", 1)
            print(f"Found {len(jobs)} jobs")
            if jobs:
                print(f"First job: {jobs[0]['title']} at {jobs[0]['company']}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(test())
