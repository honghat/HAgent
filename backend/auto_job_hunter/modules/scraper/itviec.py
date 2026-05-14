import asyncio
from datetime import datetime
from typing import List, Optional
from playwright.async_api import async_playwright
from modules.scraper.base import BaseJobScraper
from models.job import RawJob

class ITViecScraper(BaseJobScraper):
    def __init__(self):
        super().__init__()
        self.source = "itviec"

    async def scrape(
        self,
        keywords: List[str],
        locations: List[str] = None,
        min_salary: Optional[int] = None,
        max_pages: int = 2
    ) -> List[RawJob]:
        all_jobs = []

        async with async_playwright() as p:
            browser, context = await self.get_browser_context(p)
            page = await context.new_page()

            for keyword in keywords:
                for page_num in range(1, max_pages + 1):
                    # URL format cho ITViec (ví dụ)
                    search_url = f"https://itviec.com/it-jobs/{keyword.replace(' ', '-')}"
                    if page_num > 1:
                        search_url += f"?page={page_num}"

                    print(f"Scraping {search_url}...")
                    await page.goto(search_url)
                    await self.random_delay(3, 6)

                    # Lấy danh sách job cards
                    job_cards = await page.query_selector_all(".job-card")

                    if not job_cards:
                        break

                    for card in job_cards:
                        try:
                            title_elem = await card.query_selector(".title a")
                            title = await title_elem.inner_text()
                            url = "https://itviec.com" + await title_elem.get_attribute("href")
                            external_id = url.split("/")[-1].split("?")[0]

                            company_elem = await card.query_selector(".company-name")
                            company = await company_elem.inner_text() if company_elem else "Unknown"

                            location_elem = await card.query_selector(".city")
                            location = await location_elem.inner_text() if location_elem else "Vietnam"

                            #salary_elem = await card.query_selector(".salary-text")
                            #salary_raw = await salary_elem.inner_text() if salary_elem else "Thoả thuận"

                            # Để đơn giản và nhanh, ta chỉ lấy metadata ở list, description lấy ở detail sau
                            job = RawJob(
                                source=self.source,
                                external_id=external_id,
                                title=title.strip(),
                                company=company.strip(),
                                location=location.strip(),
                                salary_raw="Thoả thuận",
                                url=url,
                                description_html="", # Sẽ scrape detail sau
                                posted_at=None,
                                scraped_at=datetime.now()
                            )
                            all_jobs.append(job)
                        except Exception as e:
                            print(f"Error parsing job card: {e}")

            await browser.close()
        return all_jobs

    async def scrape_detail(self, url: str) -> str:
        """Lấy JD chi tiết."""
        async with async_playwright() as p:
            browser, context = await self.get_browser_context(p)
            page = await context.new_page()
            await page.goto(url)
            await self.random_delay(2, 4)

            jd_elem = await page.query_selector(".job-details__paragraph")
            jd_html = await jd_elem.inner_html() if jd_elem else ""

            await browser.close()
            return jd_html

if __name__ == "__main__":
    scraper = ITViecScraper()
    jobs = asyncio.run(scraper.scrape(["python", "react"]))
    print(f"Found {len(jobs)} jobs")
    for j in jobs[:3]:
        print(f"- {j.title} at {j.company}")
