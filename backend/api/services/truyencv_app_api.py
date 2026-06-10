"""Client đọc dữ liệu từ API công khai mà ứng dụng TruyenCV sử dụng."""
from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import requests
from bs4 import BeautifulSoup

API_BASE = "https://truyencv.io/wp-json"

HEADERS = {
    "Accept": "application/json",
    "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
    "User-Agent": "HAgent/2.0 TruyenCV reader",
}


@dataclass
class StoryInfo:
    title: str
    slug: str
    cover_url: str = ""
    tags: list[str] = field(default_factory=list)
    last_chapter: str = ""
    last_chapter_time: str = ""
    source_id: int = 0
    updated_at: int = 0


@dataclass
class ChapterInfo:
    title: str
    slug: str
    chapter_number: int = 0
    updated_time: str = ""


@dataclass
class StoryDetail:
    title: str
    slug: str
    author: str = ""
    translator_group: str = ""
    status: str = ""
    genres: list[str] = field(default_factory=list)
    description: str = ""
    cover_url: str = ""
    chapter_count: int = 0
    chapters: list[ChapterInfo] = field(default_factory=list)
    source_id: int = 0
    updated_at: int = 0


@dataclass
class ChapterContent:
    title: str
    content: str


class TruyenCVAppApi:
    """Đọc truyện từ các endpoint WordPress REST được app TruyenCV sử dụng."""

    def __init__(self, timeout: int = 30):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self.timeout = timeout

    def _get_json(self, path: str, params: Optional[dict] = None):
        response = self.session.get(
            f"{API_BASE}{path}",
            params=params,
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()

    @staticmethod
    def _clean_html(value: str) -> str:
        raw = html.unescape(value or "")
        raw = raw.replace("/r/n", "\n").replace("\\r\\n", "\n").replace("\\n", "\n")
        soup = BeautifulSoup(raw, "lxml")
        for br in soup.find_all("br"):
            br.replace_with("\n\n")
        text = soup.get_text(separator="\n", strip=True)
        return re.sub(r"\n{3,}", "\n\n", text).strip()

    @staticmethod
    def _terms(item: dict, taxonomy: str) -> list[str]:
        groups = item.get("_embedded", {}).get("wp:term", [])
        return [
            term.get("name", "").strip()
            for group in groups
            for term in group
            if term.get("taxonomy") == taxonomy and term.get("name")
        ]

    @staticmethod
    def _cover_url(item: dict) -> str:
        media_items = item.get("_embedded", {}).get("wp:featuredmedia", [])
        if not media_items:
            return ""
        media = media_items[0]
        sizes = media.get("media_details", {}).get("sizes", {})
        for name in ("manga_thumb_medium", "medium", "manga_thumb_small"):
            source_url = sizes.get(name, {}).get("source_url")
            if source_url:
                return source_url
        return media.get("source_url", "")

    @staticmethod
    def _updated_at(item: dict) -> int:
        value = item.get("modified_gmt") or item.get("modified") or ""
        if not value:
            return 0
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return int(parsed.timestamp())
        except ValueError:
            return 0

    def _story_info(self, item: dict) -> StoryInfo:
        return StoryInfo(
            title=self._clean_html(item.get("title", {}).get("rendered", "")),
            slug=item.get("slug", ""),
            cover_url=self._cover_url(item),
            tags=self._terms(item, "genre"),
            last_chapter_time=item.get("modified", ""),
            source_id=int(item.get("id") or 0),
            updated_at=self._updated_at(item),
        )

    def _fetch_stories(self, page: int, search: str = "") -> list[StoryInfo]:
        params = {
            "page": page,
            "per_page": 30,
            "orderby": "modified",
            "order": "desc",
            "_embed": 1,
        }
        if search:
            params["search"] = search
        items = self._get_json("/wp/v2/manga", params=params)
        return [
            self._story_info(item)
            for item in items
            if item.get("slug") and item.get("title", {}).get("rendered")
        ]

    def fetch_recent_stories(self, page: int = 1) -> list[StoryInfo]:
        return self._fetch_stories(page=page)

    def search_stories(self, keyword: str) -> list[StoryInfo]:
        return self._fetch_stories(page=1, search=keyword)

    @staticmethod
    def _chapter_title(number: int, title: str) -> str:
        title = (title or "").strip()
        if re.match(r"^(chương|chapter)\b", title, re.IGNORECASE):
            return title
        if number:
            return f"Chương {number}: {title}" if title else f"Chương {number}"
        return title or "Không có tiêu đề"

    def _fetch_chapters(self, manga_id: int) -> list[ChapterInfo]:
        chapters: list[ChapterInfo] = []
        page = 1
        total_pages = 1

        while page <= total_pages and page <= 200:
            data = self._get_json(
                "/initmanga/v1/chapters",
                params={"manga_id": manga_id, "paged": page, "per_page": 100},
            )
            items = data.get("items", []) if isinstance(data, dict) else []
            for item in items:
                chapter_id = int(item.get("id") or 0)
                if not chapter_id:
                    continue
                number = int(item.get("number") or 0)
                chapters.append(
                    ChapterInfo(
                        title=self._chapter_title(number, item.get("title", "")),
                        slug=f"chapter-{chapter_id}",
                        chapter_number=number,
                        updated_time=item.get("created_at", ""),
                    )
                )

            total_pages = int(data.get("total_pages") or 0)
            if not items or total_pages == 0:
                break
            page += 1

        chapters.sort(key=lambda chapter: chapter.chapter_number)
        return chapters

    def fetch_story_detail(self, slug: str) -> Optional[StoryDetail]:
        items = self._get_json(
            "/wp/v2/manga",
            params={"slug": slug, "_embed": 1},
        )
        if not items:
            return None

        item = items[0]
        manga_id = int(item.get("id") or 0)
        chapters = self._fetch_chapters(manga_id)
        authors = self._terms(item, "author_tax")
        teams = self._terms(item, "team")

        return StoryDetail(
            title=self._clean_html(item.get("title", {}).get("rendered", "")),
            slug=item.get("slug", slug),
            author=", ".join(authors),
            translator_group=", ".join(teams),
            status=item.get("manga_status", ""),
            genres=self._terms(item, "genre"),
            description=self._clean_html(item.get("content", {}).get("rendered", "")),
            cover_url=self._cover_url(item),
            chapter_count=len(chapters),
            chapters=chapters,
            source_id=manga_id,
            updated_at=self._updated_at(item),
        )

    def fetch_chapter_content(self, slug: str, chapter_slug: str) -> Optional[ChapterContent]:
        del slug
        match = re.search(r"chapter-(\d+)$", chapter_slug)
        if not match:
            return None

        data = self._get_json(f"/initmanga/v1/chapter/{match.group(1)}")
        content = self._clean_html(data.get("content", ""))
        if not content:
            return None

        number = int(data.get("number") or 0)
        return ChapterContent(
            title=self._chapter_title(number, data.get("title", "")),
            content=content,
        )

    def close(self) -> None:
        self.session.close()
