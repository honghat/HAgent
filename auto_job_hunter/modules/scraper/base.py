import random
import asyncio
from abc import ABC, abstractmethod
from typing import List, Optional
from playwright.async_api import async_playwright
from models.job import RawJob

class BaseJobScraper(ABC):
    def __init__(self):
        self.user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ]

    async def get_browser_context(self, playwright):
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=random.choice(self.user_agents),
            viewport={"width": 1366, "height": 768}
        )
        return browser, context

    @abstractmethod
    async def scrape(
        self,
        keywords: List[str],
        locations: List[str],
        min_salary: Optional[int],
        max_pages: int = 5
    ) -> List[RawJob]:
        pass

    async def random_delay(self, min_s=2.0, max_s=5.0):
        await asyncio.sleep(random.uniform(min_s, max_s))
