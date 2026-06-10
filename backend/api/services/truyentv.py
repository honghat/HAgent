"""Truyện TV Scraper Service — crawl từ tvtruyen.co.uk

Cấu trúc URL:
- Trang danh sách: https://www.tvtruyen.co.uk/the-loai/tat-ca.html (phân trang: /page/N/)
- Trang truyện: https://www.tvtruyen.co.uk/<slug>.html
- Trang đọc chương: https://www.tvtruyen.co.uk/<slug>/chuong-<number>
- Tìm kiếm: https://www.tvtruyen.co.uk/?s=<keyword>
"""
from __future__ import annotations

import logging
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

BASE_URLS = [
    "https://www.tvtruyen.co.uk",
    "https://www.tvtruyen.com",
    "https://www.tvtruyen.net",
]
BASE_URL = BASE_URLS[0]

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
    title: str
    slug: str
    cover_url: str = ""
    tags: list[str] = field(default_factory=list)
    last_chapter: str = ""
    last_chapter_time: str = ""
    source: str = "tvtruyen"


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


@dataclass
class ChapterContent:
    title: str
    content: str


class TruyenTVScraper:
    """Scraper cho tvtruyen.co.uk sử dụng requests + BeautifulSoup"""

    def __init__(self, timeout: int = 30):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self.timeout = timeout

    def _make_candidate_urls(self, url: str) -> list[str]:
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            return [url]

        path = urlunparse(parsed._replace(scheme="", netloc="", fragment=""))
        if path.startswith("//"):
            path = path[2:]
        if path.startswith("/"):
            path = path[1:]

        candidates = []
        for base in BASE_URLS:
            candidates.append(f"{base}/{path}")
        return candidates

    def _soup(self, url: str) -> BeautifulSoup:
        last_error: Optional[Exception] = None
        candidates = self._make_candidate_urls(url)

        for candidate in candidates:
            try:
                resp = self.session.get(candidate, timeout=self.timeout)
                resp.raise_for_status()
                resp.encoding = "utf-8"
                return BeautifulSoup(resp.text, "lxml")
            except requests.exceptions.HTTPError as e:
                status = getattr(e.response, "status_code", None)
                if status == 404:
                    raise
                logger.warning("HTTP error fetching %s: %s", candidate, e)
                last_error = e
            except requests.RequestException as e:
                logger.warning("Connection error fetching %s: %s", candidate, e)
                last_error = e

        if last_error:
            raise last_error
        raise requests.RequestException(f"Không thể truy cập {url}")

    def close(self):
        self.session.close()

    def _normalize(self, text: str) -> str:
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

        container = soup.select_one("div.category-list-container")
        if not container:
            logger.warning("Không tìm thấy category-list-container trên %s", url)
            return stories

        # Mỗi item: div.info-mobile-card > div.info-image (img) + div.detail (a link)
        for item in container.find_all("div", class_="info-mobile-card"):
            if len(stories) >= 30:
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

            # Cover: từ div.info-image > img
            cover_url = ""
            img_div = item.find("div", class_="info-image")
            if img_div:
                img = img_div.find("img")
                if img and img.get("src"):
                    cover_url = urljoin(BASE_URL, img["src"])

            stories.append(StoryInfo(
                title=title.strip(),
                slug=slug,
                cover_url=cover_url,
            ))

        return stories

    def search_stories(self, keyword: str) -> list[StoryInfo]:
        """Tìm kiếm truyện theo từ khóa"""
        url = f"{BASE_URL}/?s={keyword.replace(' ', '+')}"
        soup = self._soup(url)
        stories: list[StoryInfo] = []
        seen_slugs: set[str] = set()

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
        """Lấy chi tiết truyện + danh sách chương từ <slug>.html"""
        url = f"{BASE_URL}/{slug}.html"
        try:
            soup = self._soup(url)
        except requests.exceptions.HTTPError as e:
            status = getattr(e.response, 'status_code', None)
            if status == 404:
                logger.warning("Story not found on remote site: %s", url)
                return None
            logger.error("HTTP error khi fetch detail %s: %s", url, e)
            raise
        except Exception as e:
            logger.error("Lỗi khi fetch detail %s: %s", url, e)
            raise

        detail = StoryDetail(title="", slug=slug)

        # Title — từ h3 (trang detail dùng h3 cho tên truyện)
        h3 = soup.select_one("h3")
        if h3:
            detail.title = h3.get_text(strip=True)

        # Cover image (lấy từ any img có cdn)
        cover_img = soup.select_one("img[src*='cdn']")
        if cover_img and cover_img.get("src"):
            detail.cover_url = urljoin(BASE_URL, cover_img["src"])

        # Info section (tác giả, nhóm dịch, trạng thái)
        info_section = soup.find("div", class_=re.compile(r"info-mobile-card"))
        if info_section:
            info_text = self._normalize(info_section.get_text())
        else:
            info_text = self._normalize(soup.get_text())

        m = re.search(r"Tác\s*giả[:\s]*\n*(.+?)(?:\n|$)", info_text)
        if m:
            detail.author = m.group(1).strip()

        m = re.search(r"Nhóm\s*dịch[:\s]*\n*(.+?)(?:\n|$)", info_text)
        if m:
            detail.translator_group = m.group(1).strip()

        m = re.search(r"Trạng\s*thái[:\s]*\n*(.+?)(?:\n|$)", info_text)
        if m:
            detail.status = m.group(1).strip()

        # Genres
        genre_heading = soup.find("h3", string=re.compile(r"Thể\s*loại"))
        if genre_heading:
            for a in genre_heading.find_all_next("a"):
                g = a.get_text(strip=True)
                if g and len(g) < 30:
                    detail.genres.append(g)
                if len(detail.genres) >= 10:
                    break

        # Description
        desc_div = soup.find("div", class_=re.compile(r"description|des"), string=True)
        if not desc_div:
            desc_div = soup.select_one("p")
        if desc_div:
            dt = desc_div.get_text(strip=True)
            if len(dt) > 20:
                detail.description = dt[:1000]
        if not detail.description:
            meta_desc = soup.find("meta", attrs={"name": "description"})
            if meta_desc and meta_desc.get("content"):
                detail.description = meta_desc["content"].strip()[:1000]

        # Chapter list
        detail.chapters = self._fetch_chapters(soup, slug)
        detail.chapter_count = len(detail.chapters)

        return detail

    def _fetch_chapters(self, soup: BeautifulSoup, slug: str) -> list[ChapterInfo]:
        """Lấy danh sách chương từ trang detail (duyệt qua toàn bộ các trang phân trang).
        Link chương: https://www.tvtruyen.co.uk/<slug>/chuong-<number>
        """
        chapters: list[ChapterInfo] = []
        seen: set[str] = set()
        pattern = re.compile(rf"https://www\.tvtruyen\.co\.uk/{re.escape(slug)}/chuong-(\d+)")
        base_url = f"{BASE_URL}/{slug}.html"

        # ---- Thu thập tất cả trang phân trang ----
        pages_to_fetch: list[str] = [base_url]
        fetched_pages: set[str] = set()

        def _collect_page_links(s: BeautifulSoup):
            """Thu thập link phân trang từ nhiều selector khác nhau."""
            selectors = [
                "a.custom-page-link",
                "a[href*='page=']",
                ".pagination a",
                ".wp-pagenavi a",
            ]
            for sel in selectors:
                for a_page in s.select(sel):
                    href = a_page.get("href", "")
                    if not href or "page=" not in href:
                        continue
                    full_href = urljoin(BASE_URL, href)
                    # Chỉ lấy link thuộc cùng slug
                    if slug in full_href and full_href not in pages_to_fetch:
                        pages_to_fetch.append(full_href)

        def _extract_chapters(s: BeautifulSoup):
            """Trích xuất danh sách chương từ một soup trang."""
            for a in s.find_all("a", href=pattern):
                href = a.get("href", "")
                m = pattern.match(href)
                if not m:
                    continue
                ch_num = int(m.group(1))
                key = str(ch_num)
                if key in seen:
                    continue
                seen.add(key)

                text = a.get_text(strip=True)
                text = re.sub(r"^#\d+\.\s*", "", text)
                if not text:
                    text = f"Chương {ch_num}"

                chapters.append(ChapterInfo(
                    title=text.strip(),
                    slug=f"chuong-{ch_num}",
                    chapter_number=ch_num,
                ))

        # Xử lý trang đầu tiên
        _collect_page_links(soup)
        _extract_chapters(soup)
        fetched_pages.add(base_url)

        # Duyệt qua các trang còn lại (có thể được thêm động bởi _collect_page_links)
        i = 1
        while i < len(pages_to_fetch):
            page_url = pages_to_fetch[i]
            i += 1
            if page_url in fetched_pages:
                continue
            fetched_pages.add(page_url)
            try:
                page_soup = self._soup(page_url)
                _collect_page_links(page_soup)  # Tìm thêm link trang mới nếu có
                _extract_chapters(page_soup)
            except Exception as e:
                logger.error("Lỗi khi cào phân trang chương tại %s: %s", page_url, e)

        chapters.sort(key=lambda c: c.chapter_number, reverse=False)
        logger.info("Đã cào %d chương từ %d trang cho truyện '%s'", len(chapters), len(fetched_pages), slug)
        return chapters

    def fetch_chapter_content(self, slug: str, chapter_slug: str) -> Optional[ChapterContent]:
        """Lấy nội dung một chương từ /slug/chuong-number (KHÔNG trailing slash)"""
        url = f"{BASE_URL}/{slug}/{chapter_slug}"
        try:
            soup = self._soup(url)
        except Exception as e:
            logger.error("Lỗi khi fetch chapter %s/%s: %s", slug, chapter_slug, e)
            return None

        # Title từ <title> tag
        title_tag = soup.select_one("title")
        title = title_tag.get_text(strip=True) if title_tag else chapter_slug
        # Clean: "Thái Ất / Chương 1: ..." -> "Chương 1: ..."
        if "/" in title:
            parts = title.split("/", 1)
            if len(parts) > 1:
                title = parts[1].strip()

        # Content từ div#chapter-content
        content_div = soup.select_one("#chapter-content")
        if content_div is None:
            logger.warning("Không tìm thấy #chapter-content cho %s", url)
            return None

        # Xoá elements không cần thiết
        for unwanted in content_div.select(
            "nav, header, footer, .pagination, script, style, "
            ".ad, .ads, .advertisement, .adsbygoogle, "
            "[class*='ad-'], [id*='ad-'], "
            ".chapter-navigation, [class*='nav']"
        ):
            unwanted.decompose()

        # Nội dung dạng <p> — giữ nguyên từng đoạn văn, xử lý thẻ <br> bên trong để tạo newline thực sự
        paragraphs = content_div.find_all("p")
        lines = []
        for p in paragraphs:
            p_text = p.get_text(separator="\n", strip=True)
            for sub_line in p_text.split("\n"):
                text = sub_line.strip()
                if not text:
                    continue
                # Loại bỏ tiền tố số thứ tự kiểu "01", "04", "1.", "Chapter 1" ở đầu đoạn hoặc đứng riêng lẻ một dòng
                if re.match(r"^\d{1,3}$", text):
                    continue
                text = re.sub(r"^\d{1,3}(?:\.\s*|\s+)", "", text).strip()
                if text:
                    lines.append(text)

        content = "\n\n".join(lines)

        # Fallback: text gốc
        if not content or len(content) < 50:
            content_text = content_div.get_text(separator="\n", strip=True)
            lines = []
            for sub_line in content_text.split("\n"):
                text = sub_line.strip()
                if text:
                    text = re.sub(r"^\d{1,3}(?:\.\s*|\s+)", "", text).strip()
                    if text:
                        lines.append(text)
            content = "\n\n".join(lines)

        # Clean quảng cáo
        content = self._clean_content(content)

        return ChapterContent(title=title, content=content)

    @staticmethod
    def _capitalize_sentence(s: str) -> str:
        """Viết hoa chữ cái đầu tiên của câu, bỏ qua số/dấu ở đầu."""
        s = s.strip()
        if not s:
            return s
        # Tìm vị trí chữ cái đầu tiên
        match = re.search(r'[a-zA-ZÀ-ỹ]', s)
        if match:
            idx = match.start()
            s = s[:idx] + s[idx].upper() + s[idx + 1:]
        return s

    def _split_sentences(self, text: str) -> list[str]:
        """Ngắt text thành từng câu dựa trên dấu câu kết thúc.
        Viết hoa chữ đầu mỗi câu.
        Ví dụ: 'trời mưa. trời nắng.' → ['Trời mưa.', 'Trời nắng.']
        """
        # Không ngắt ở các mẫu số thứ tự như "1.", "2.", "3." ở đầu dòng
        # Pattern: split sau . ? ! kèm khoảng trắng, nhưng không split nếu là số thứ tự
        parts = re.split(r'(?<=[.!?])\s+', text)
        result = []
        for part in parts:
            part = part.strip()
            if not part:
                continue
            # Bỏ qua nếu part là số thứ tự (vd "1. Tôi..." không bị cắt)
            # Nếu câu quá dài (>200 ký tự), thử ngắt thêm
            if len(part) > 200:
                sub_parts = re.split(r'(?<=[,;:])\s+', part)
                for sub in sub_parts:
                    sub = sub.strip()
                    if sub:
                        result.append(self._capitalize_sentence(sub))
            else:
                result.append(self._capitalize_sentence(part))
        return result

    def _clean_content(self, text: str) -> str:
        """Loại bỏ quảng cáo, dòng thông báo"""
        lines = []
        skip_patterns = [
            r"Tải app.*offline",
            r"Đăng nhập.*bình luận",
            r"Bạn có thể dùng phím",
            r"QUẢNG CÁO",
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
