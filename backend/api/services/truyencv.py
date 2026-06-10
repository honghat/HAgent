"""Truyện CV Scraper Service — crawl danh sách truyện, nội dung chương từ tvtruyen.co.uk

Cấu trúc URL:
- Trang danh sách: https://www.tvtruyen.co.uk/the-loai/tat-ca.html (hoặc /page/N/)
- Trang truyện: https://www.tvtruyen.co.uk/<slug>.html
- Trang đọc: https://www.tvtruyen.co.uk/<slug>/chuong-<number>
- Tìm kiếm: https://www.tvtruyen.co.uk/?s=<keyword>
"""
from __future__ import annotations

import logging
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import requests
from bs4 import BeautifulSoup, Tag
from urllib.parse import urljoin

logger = logging.getLogger(__name__)

BASE_URL = "https://www.tvtruyen.co.uk"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/134.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
}


@dataclass
class StoryInfo:
    """Thông tin tóm tắt một truyện (từ trang danh sách)"""
    title: str
    slug: str
    cover_url: str = ""
    tags: list[str] = field(default_factory=list)
    last_chapter: str = ""
    last_chapter_time: str = ""
    source: str = "tvtruyen"


@dataclass
class StoryDetail:
    """Chi tiết một truyện (từ trang chi tiết)"""
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


@dataclass
class ChapterInfo:
    """Thông tin một chương"""
    title: str
    slug: str
    chapter_number: int = 0
    updated_time: str = ""


@dataclass
class ChapterContent:
    """Nội dung một chương"""
    title: str
    content: str  # Nội dung thuần text, đã strip HTML


class TruyenCVScraper:
    """Scraper cho tvtruyen.co.uk sử dụng requests + BeautifulSoup"""

    def __init__(self, timeout: int = 30, max_chapter_pages: int = 5):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self.timeout = timeout
        self.max_chapter_pages = max_chapter_pages

    def _soup(self, url: str) -> BeautifulSoup:
        resp = self.session.get(url, timeout=self.timeout)
        resp.raise_for_status()
        resp.encoding = "utf-8"
        return BeautifulSoup(resp.text, "lxml")

    @staticmethod
    def _normalize(text: str) -> str:
        """Normalize Unicode to NFC form for safe regex matching"""
        return unicodedata.normalize("NFC", text)

    # ---- Public API ----

    def fetch_recent_stories(self, page: int = 1) -> list[StoryInfo]:
        """Lấy danh sách truyện từ trang thể loại"""
        if page <= 1:
            url = f"{BASE_URL}/the-loai/tat-ca.html"
        else:
            url = f"{BASE_URL}/the-loai/tat-ca/page/{page}.html"

        soup = self._soup(url)
        stories: list[StoryInfo] = []
        seen_slugs: set[str] = set()

        # Truyện items nằm trong div.category-list-container > div.row > div.category-list-item
        container = soup.select_one("div.category-list-container")
        if not container:
            logger.warning("Không tìm thấy category-list-container trên %s", url)
            return stories

        items = container.find_all("div", class_=re.compile(r"category-list-item"))
        for item in items:
            if len(stories) >= 30:
                break

            # Link đến trang truyện: <a href="https://www.tvtruyen.co.uk/<slug>.html">
            link = item.find("a", href=re.compile(r"https://www\.tvtruyen\.co\.uk/[^/]+\.html$"))
            if not link:
                continue
            href = link.get("href", "")
            slug_match = re.search(r"/([^/]+)\.html$", href)
            if not slug_match:
                continue
            slug = slug_match.group(1)
            if slug in seen_slugs:
                continue
            seen_slugs.add(slug)

            # Title
            title = link.get_text(strip=True)
            if not title or len(title) < 3:
                continue

            # Cover image
            cover_url = ""
            img = item.find("img")
            if img and img.get("src"):
                cover_url = urljoin(BASE_URL, img["src"])

            # Last chapter + time
            last_chapter = ""
            last_chapter_time = ""
            timeago = item.find("div", class_=re.compile(r"timeago"))
            if timeago:
                last_chapter_time = timeago.get_text(strip=True)

            stories.append(StoryInfo(
                title=title.strip(),
                slug=slug,
                cover_url=cover_url,
                last_chapter=last_chapter,
                last_chapter_time=last_chapter_time or "",
            ))

        return stories

    def search_stories(self, keyword: str) -> list[StoryInfo]:
        """Tìm kiếm truyện theo từ khóa"""
        url = f"{BASE_URL}/?s={keyword.replace(' ', '+')}"
        soup = self._soup(url)
        stories: list[StoryInfo] = []
        seen_slugs: set[str] = set()

        # Kết quả tìm kiếm cũng dùng cấu trúc category-list-container
        container = soup.select_one("div.category-list-container")
        if not container:
            # Fallback: tìm link trực tiếp
            for a in soup.find_all("a", href=re.compile(r"https://www\.tvtruyen\.co\.uk/[^/]+\.html$")):
                href = a.get("href", "")
                slug_match = re.search(r"/([^/]+)\.html$", href)
                if not slug_match:
                    continue
                slug = slug_match.group(1)
                if slug in seen_slugs:
                    continue
                seen_slugs.add(slug)
                title = a.get_text(strip=True)
                if not title or len(title) < 3:
                    continue
                stories.append(StoryInfo(title=title.strip(), slug=slug))
                if len(stories) >= 20:
                    break
            return stories

        items = container.find_all("div", class_=re.compile(r"category-list-item"))
        for item in items:
            if len(stories) >= 20:
                break
            link = item.find("a", href=re.compile(r"https://www\.tvtruyen\.co\.uk/[^/]+\.html$"))
            if not link:
                continue
            href = link.get("href", "")
            slug_match = re.search(r"/([^/]+)\.html$", href)
            if not slug_match:
                continue
            slug = slug_match.group(1)
            if slug in seen_slugs:
                continue
            seen_slugs.add(slug)
            title = link.get_text(strip=True)
            if not title or len(title) < 3:
                continue
            img = item.find("img")
            cover = urljoin(BASE_URL, img["src"]) if img and img.get("src") else ""
            stories.append(StoryInfo(title=title.strip(), slug=slug, cover_url=cover))

        return stories

    def fetch_story_detail(self, slug: str) -> Optional[StoryDetail]:
        """Lấy chi tiết truyện + danh sách chương từ trang <slug>.html"""
        url = f"{BASE_URL}/{slug}.html"
        soup = self._soup(url)
        detail = StoryDetail(title="", slug=slug)

        # Title — từ h1 hoặc h3
        h1 = soup.select_one("h1")
        h3 = soup.select_one("h3")
        if h1:
            detail.title = h1.get_text(strip=True)
        elif h3:
            detail.title = h3.get_text(strip=True)

        # Cover image
        cover_img = soup.select_one("img[class*='cover'], img[class*='thumb'], .story-thumb img, .book-thumb img")
        if not cover_img:
            cover_img = soup.select_one("img[src*='cdn']")
        if cover_img and cover_img.get("src"):
            detail.cover_url = urljoin(BASE_URL, cover_img["src"])

        # Find all info rows
        info_section = soup.find("div", class_=re.compile(r"info-mobile-card"))
        if info_section:
            info_text = self._normalize(info_section.get_text())
        else:
            info_text = self._normalize(soup.get_text())

        # Author
        m = re.search(r"Tác\s*giả[:\s]*\n*(.+?)(?:\n|$)", info_text)
        if m:
            detail.author = m.group(1).strip()

        # Translator group
        m = re.search(r"Nhóm\s*dịch[:\s]*\n*(.+?)(?:\n|$)", info_text)
        if m:
            detail.translator_group = m.group(1).strip()

        # Status
        m = re.search(r"Trạng\s*thái[:\s]*\n*(.+?)(?:\n|$)", info_text)
        if m:
            detail.status = m.group(1).strip()

        # Genres
        genre_section = soup.find("h3", string=re.compile(r"Thể\s*loại"))
        if genre_section:
            for a in genre_section.find_all_next("a"):
                g = a.get_text(strip=True)
                if g and len(g) < 30:
                    detail.genres.append(g)
                if len(detail.genres) >= 10:
                    break

        # Description
        desc_div = soup.find("div", class_=re.compile(r"description|des"))
        if not desc_div:
            desc_div = soup.find("p", class_=re.compile(r"description|des"))
        if desc_div:
            detail.description = desc_div.get_text(strip=True)[:1000]
        if not detail.description:
            meta_desc = soup.find("meta", attrs={"name": "description"})
            if meta_desc and meta_desc.get("content"):
                detail.description = meta_desc["content"].strip()[:1000]

        # Fetch chapters from the list
        detail.chapters = self._fetch_chapters(soup, slug)

        # Sync chapter_count to actual parsed chapters
        detail.chapter_count = len(detail.chapters)

        return detail

    def _fetch_chapters(self, soup: BeautifulSoup, slug: str) -> list[ChapterInfo]:
        """Extract chapter list from the story detail page.
        Chapter links format: https://www.tvtruyen.co.uk/<slug>/chuong-<number>
        """
        chapters: list[ChapterInfo] = []
        seen: set[str] = set()

        pattern = re.compile(rf"https://www\.tvtruyen\.co\.uk/{re.escape(slug)}/chuong-(\d+)")

        for a in soup.find_all("a", href=pattern):
            href = a.get("href", "")
            m = pattern.match(href)
            if not m:
                continue
            ch_num = int(m.group(1))
            if str(ch_num) in seen:
                continue
            seen.add(str(ch_num))

            # Chapter link is inside a div with class category-list-item
            text = a.get_text(strip=True)
            # Clean up the text — remove "#N." prefix like "#1. Chương 1:..."
            text = re.sub(r"^#\d+\.\s*", "", text)
            if not text:
                text = f"Chương {ch_num}"

            ch_slug = f"chuong-{ch_num}"

            chapters.append(ChapterInfo(
                title=text.strip(),
                slug=ch_slug,
                chapter_number=ch_num,
            ))

        chapters.sort(key=lambda c: c.chapter_number, reverse=False)
        return chapters

    def fetch_chapter_content(self, slug: str, chapter_slug: str) -> Optional[ChapterContent]:
        """Lấy nội dung một chương từ URL: /<slug>/chuong-<number>"""
        url = f"{BASE_URL}/{slug}/{chapter_slug}"

        try:
            soup = self._soup(url)
        except Exception as e:
            logger.error("Lỗi khi fetch chapter %s/%s: %s", slug, chapter_slug, e)
            return None

        # Title
        title_tag = soup.select_one("title")
        title = title_tag.get_text(strip=True) if title_tag else chapter_slug
        # Clean: "Thái Ất / Chương 1: ..." -> "Chương 1: ..."
        if "/" in title:
            parts = title.split("/", 1)
            if len(parts) > 1:
                title = parts[1].strip()

        # Content — nằm trong <div id="chapter-content">
        content_div = soup.select_one("#chapter-content")
        if content_div is None:
            logger.warning("Không tìm thấy #chapter-content cho %s", url)
            return None

        # Remove unwanted elements
        for unwanted in content_div.select(
            "nav, header, footer, .pagination, script, style, "
            ".ad, .ads, .advertisement, .adsbygoogle, "
            "[class*='ad-'], [id*='ad-'], "
            ".chapter-navigation, .nav, [class*='nav']"
        ):
            unwanted.decompose()

        # Content as paragraphs
        paragraphs = content_div.find_all("p")
        lines = []
        for p in paragraphs:
            text = p.get_text(strip=True)
            if text and len(text) > 3:
                lines.append(text)

        content = "\n\n".join(lines)

        # Fallback: full text
        if not content or len(content) < 50:
            content = content_div.get_text(separator="\n\n", strip=True)

        content = self._clean_content(content)

        return ChapterContent(title=title, content=content)

    # ---- Private helpers ----

    def _clean_content(self, text: str) -> str:
        """Loại bỏ quảng cáo, dòng thông báo"""
        lines = []
        skip_patterns = [
            r"Tải app.*đọc.*offline",
            r"Đăng nhập.*bình luận",
            r"Bạn có thể dùng phím",
        ]
        for line in text.split("\n"):
            line = line.strip()
            if not line:
                continue
            skip = False
            for pat in skip_patterns:
                if re.search(pat, line, re.IGNORECASE):
                    skip = True
                    break
            if not skip:
                lines.append(line)
        return "\n\n".join(lines)

    def close(self):
        self.session.close()
