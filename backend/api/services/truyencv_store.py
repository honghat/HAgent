import json
import re
import time
from typing import Optional, Callable

from api.services.db import get_connection
from api.services.truyencv_app_api import (
    ChapterContent,
    ChapterInfo,
    StoryDetail,
    StoryInfo,
    TruyenCVAppApi,
)
from api.services.tangthuvien_api import TangThuVienAppApi, is_ttv_slug, to_remote_slug


class TruyenCVStore:
    def __init__(self):
        self.scraper = TruyenCVAppApi()
        self.ttv = TangThuVienAppApi()

    def _ensure_login(self):
        pass

    def close(self):
        self.scraper.close()
        self.ttv.close()

    @staticmethod
    def _normalize_source(source: str = "") -> str:
        value = (source or "").strip().lower()
        if value in {"ttv", "tangthuvien", "tang-thu-vien"}:
            return "ttv"
        if value in {"truyencv", "truyencv_app", "cv"}:
            return "truyencv_app"
        return ""

    def _client_for_source(self, source: str):
        source = self._normalize_source(source) or "truyencv_app"
        if source == "ttv":
            return self.ttv, "ttv"
        return self.scraper, "truyencv_app"

    @staticmethod
    def _try_import_ttv_capture() -> None:
        try:
            from api.services import ttv_hagent_proxy
            ttv_hagent_proxy.import_captured_stories()
        except Exception:
            pass

    @staticmethod
    def _is_ttv_capture_slug(slug: str) -> bool:
        return (slug or "").startswith("ttv--ipad")

    @staticmethod
    def _ttv_chapter_id_from_slug(chapter_slug: str) -> str:
        match = re.search(r"(\d+)$", str(chapter_slug or "").strip())
        return match.group(1) if match else ""

    @staticmethod
    def _ttv_story_slug_candidates(conn, slug: str) -> list[str]:
        candidates: list[str] = []

        def add(value: str) -> None:
            value = (value or "").strip()
            if value and value not in candidates:
                candidates.append(value)

        add(slug)
        if not is_ttv_slug(slug):
            return candidates

        story_id = to_remote_slug(slug)
        if not story_id:
            return candidates
        add(f"ttv--{story_id}")

        params: list[object] = [f"ttv--%-{story_id}"]
        version_clause = ""
        if story_id.isdigit():
            version_clause = " OR version_id=?"
            params.append(int(story_id))
        rows = conn.execute(
            "SELECT slug FROM stories WHERE source='ttv' AND (slug LIKE ?" + version_clause + ")",
            params,
        ).fetchall()
        for row in rows:
            add(row["slug"])
        return candidates

    @classmethod
    def _story_row_from_db(cls, conn, slug: str):
        best = None
        best_chapter_count = -1
        for candidate in cls._ttv_story_slug_candidates(conn, slug):
            row = conn.execute("SELECT * FROM stories WHERE slug=?", (candidate,)).fetchone()
            if not row:
                continue
            count_row = conn.execute(
                "SELECT COUNT(*) AS cnt FROM story_chapters WHERE story_slug=?",
                (candidate,),
            ).fetchone()
            chapter_count = int(count_row["cnt"] if count_row else 0)
            if best is None or candidate == slug or chapter_count > best_chapter_count:
                best = row
                best_chapter_count = chapter_count
            if candidate == slug and chapter_count > 0:
                break
        return best

    @staticmethod
    def _chapter_slug_candidates(chapter_slug: str) -> list[str]:
        value = (chapter_slug or "").strip("/")
        candidates: list[str] = []
        if value:
            candidates.append(value)
        if value.isdigit():
            candidates.append(f"chapter-{value}")
        return list(dict.fromkeys(candidates))

    @staticmethod
    def _chapter_number_candidate(chapter_slug: str) -> int:
        value = (chapter_slug or "").strip("/")
        return int(value) if value.isdigit() else 0

    @classmethod
    def _chapter_row_from_db(cls, conn, story_slug: str, chapter_slug: str, require_content: bool = False):
        content_clause = " AND content <> ''" if require_content else ""
        for candidate_story_slug in cls._ttv_story_slug_candidates(conn, story_slug):
            for candidate_chapter_slug in cls._chapter_slug_candidates(chapter_slug):
                row = conn.execute(
                    "SELECT story_slug, slug, title, content, chapter_number FROM story_chapters "
                    f"WHERE story_slug=? AND slug=?{content_clause}",
                    (candidate_story_slug, candidate_chapter_slug),
                ).fetchone()
                if row:
                    return row

            chapter_number = cls._chapter_number_candidate(chapter_slug)
            if chapter_number:
                row = conn.execute(
                    "SELECT story_slug, slug, title, content, chapter_number FROM story_chapters "
                    f"WHERE story_slug=? AND chapter_number=?{content_clause} "
                    "ORDER BY CASE WHEN content <> '' THEN 0 ELSE 1 END, slug ASC LIMIT 1",
                    (candidate_story_slug, chapter_number),
                ).fetchone()
                if row:
                    return row
        return None

    @classmethod
    def _story_detail_from_db(cls, conn, slug: str) -> Optional[StoryDetail]:
        row = cls._story_row_from_db(conn, slug)
        if not row:
            return None
        chapters_raw = conn.execute(
            "SELECT slug, title, chapter_number, updated_time FROM story_chapters WHERE story_slug=? ORDER BY chapter_number ASC",
            (row["slug"],),
        ).fetchall()
        chapters = [
            ChapterInfo(title=r["title"], slug=r["slug"], chapter_number=r["chapter_number"], updated_time=r["updated_time"])
            for r in chapters_raw
        ]
        known_count = int(row["chapter_count"] or 0)
        actual_count = max(known_count, len(chapters))
        if row["chapter_count"] != actual_count:
            conn.execute(
                "UPDATE stories SET chapter_count=? WHERE slug=?",
                (actual_count, row["slug"]),
            )
            conn.commit()
        return StoryDetail(
            title=row["title"], slug=row["slug"],
            author=row["author"] or "", translator_group=row["translator_group"] or "",
            status=row["status"] or "",
            genres=json.loads(row["genres"]) if row["genres"] else [],
            description=row["description"] or "", cover_url=row["cover_url"] or "",
            chapter_count=actual_count,
            chapters=chapters,
        )

    def get_recent_stories(
        self,
        page: int = 1,
        refresh: bool = False,
        on_progress: Callable = None,
        source: str = "",
    ) -> list[StoryInfo]:

        conn = get_connection()
        now = int(time.time())
        source_filter = self._normalize_source(source)

        # Ưu tiên đọc từ DB — crawl chỉ khi refresh=true hoặc DB rỗng
        if not refresh:
            where = "WHERE source=?" if source_filter else ""
            params = ([source_filter] if source_filter else []) + [((page - 1) * 30,)]
            flat_params = []
            for item in params:
                if isinstance(item, tuple):
                    flat_params.extend(item)
                else:
                    flat_params.append(item)
            rows = conn.execute(
                "SELECT slug, title, author, cover_url, genres, chapter_count, last_chapter, last_chapter_time "
                f"FROM stories {where} ORDER BY updated_at DESC LIMIT 30 OFFSET ?",
                flat_params,
            ).fetchall()
            if rows:
                results = []
                for r in rows:
                    tags = json.loads(r["genres"]) if r["genres"] else []
                    # Nếu không có last_chapter từ DB, thử query từ story_chapters
                    lc = r["last_chapter"] or ""
                    lct = r["last_chapter_time"] or ""
                    if not lc:
                        ch_row = conn.execute(
                            "SELECT title, updated_time FROM story_chapters "
                            "WHERE story_slug=? ORDER BY chapter_number DESC LIMIT 1",
                            (r["slug"],),
                        ).fetchone()
                        if ch_row:
                            lc = ch_row["title"]
                            lct = ch_row["updated_time"] or ""
                    results.append(StoryInfo(
                        title=r["title"], slug=r["slug"],
                        cover_url=r["cover_url"] or "",
                        tags=tags,
                        last_chapter=lc,
                        last_chapter_time=lct,
                    ))
                conn.close()
                return results
            if source_filter == "ttv":
                conn.close()
                self._try_import_ttv_capture()
                conn = get_connection()
                rows = conn.execute(
                    "SELECT slug, title, author, cover_url, genres, chapter_count, last_chapter, last_chapter_time "
                    "FROM stories WHERE source=? ORDER BY updated_at DESC LIMIT 30 OFFSET ?",
                    (source_filter, (page - 1) * 30),
                ).fetchall()
                if rows:
                    results = []
                    for r in rows:
                        tags = json.loads(r["genres"]) if r["genres"] else []
                        results.append(StoryInfo(
                            title=r["title"], slug=r["slug"],
                            cover_url=r["cover_url"] or "",
                            tags=tags,
                            last_chapter=r["last_chapter"] or (f"{r['chapter_count']} chương" if r["chapter_count"] else ""),
                            last_chapter_time=r["last_chapter_time"] or "",
                        ))
                    conn.close()
                    return results

        client, source_name = self._client_for_source(source_filter)
        if source_name == "ttv":
            self._try_import_ttv_capture()

        if on_progress:
            label = "TTV" if source_name == "ttv" else "ứng dụng TruyenCV"
            on_progress(f"Đang đồng bộ danh sách từ {label}...")

        stories = client.fetch_recent_stories(page=page)

        total = len(stories)
        for i, s in enumerate(stories):
            conn.execute(
                """INSERT INTO stories
                   (slug, title, author, cover_url, genres, chapter_count, last_chapter,
                    last_chapter_time, source, version_id, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(slug) DO UPDATE SET
                       title=excluded.title,
                       author=CASE
                           WHEN excluded.author <> '' THEN excluded.author
                           ELSE stories.author
                       END,
                       cover_url=excluded.cover_url,
                       genres=excluded.genres,
                       last_chapter=CASE
                           WHEN excluded.last_chapter <> '' THEN excluded.last_chapter
                           ELSE stories.last_chapter
                       END,
                       last_chapter_time=CASE
                           WHEN excluded.last_chapter_time <> '' THEN excluded.last_chapter_time
                           ELSE stories.last_chapter_time
                       END,
                       source=excluded.source,
                       version_id=excluded.version_id,
                       updated_at=excluded.updated_at""",
                (s.slug, s.title, "", s.cover_url,
                 json.dumps(s.tags, ensure_ascii=False),
                 s.last_chapter or "", s.last_chapter_time or "",
                 source_name, s.source_id, s.updated_at or now, s.updated_at or now),
            )
            if on_progress and total > 5 and (i + 1) % 5 == 0:
                on_progress(f"Đã lưu {i + 1}/{total} truyện vào DB...")
        conn.commit()
        conn.close()

        if on_progress:
            on_progress(f"Hoàn tất! {total} truyện.")
        return stories

    def get_story_detail(
        self,
        slug: str,
        refresh: bool = False,
        on_progress: Callable = None,
        source: str = "",
    ) -> Optional[StoryDetail]:

        conn = get_connection()
        now = int(time.time())

        if not refresh:
            detail_from_db = self._story_detail_from_db(conn, slug)
            conn.close()
            if detail_from_db:
                return detail_from_db
        else:
            conn.close()

        if on_progress:
            on_progress(f"Đang tải chi tiết truyện...")

        source_hint = self._normalize_source(source)
        if not source_hint and is_ttv_slug(slug):
            source_hint = "ttv"
        if source_hint == "ttv":
            return self._ttv_detail(slug, on_progress)
        client, source_name = self._client_for_source(source_hint)
        detail = client.fetch_story_detail(slug)
        if detail is None:
            return None

        conn = get_connection()
        story_slug = detail.slug
        conn.execute(
            """INSERT INTO stories
               (slug, title, author, translator_group, status, genres, description, cover_url,
                chapter_count, source, version_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(slug) DO UPDATE SET
                   title=excluded.title,
                   author=excluded.author,
                   translator_group=excluded.translator_group,
                   status=excluded.status,
                   genres=excluded.genres,
                   description=excluded.description,
                   cover_url=excluded.cover_url,
                   chapter_count=excluded.chapter_count,
                   source=excluded.source,
                   version_id=excluded.version_id,
                   updated_at=excluded.updated_at""",
            (detail.slug, detail.title, detail.author, detail.translator_group,
             detail.status, json.dumps(detail.genres, ensure_ascii=False),
             detail.description, detail.cover_url, detail.chapter_count,
             source_name, detail.source_id, detail.updated_at or now, detail.updated_at or now),
        )
        conn.execute("DELETE FROM story_chapters WHERE story_slug=?", (story_slug,))

        total_ch = len(detail.chapters)
        for i, ch in enumerate(detail.chapters):
            conn.execute(
                "INSERT INTO story_chapters (story_slug, slug, title, chapter_number, updated_time, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (story_slug, ch.slug, ch.title, ch.chapter_number, ch.updated_time, now),
            )
            if on_progress and total_ch > 10 and (i + 1) % 10 == 0:
                on_progress(f"Đã lưu {i + 1}/{total_ch} chương...")
        conn.commit()
        conn.close()

        if on_progress:
            on_progress(f"Hoàn tất! {total_ch} chương.")
        return detail

    def _ttv_detail(self, slug: str, on_progress: Callable = None) -> Optional[StoryDetail]:
        """TTV: metadata từ API nae.vn, danh sách chương từ capture/DB — KHÔNG xoá chương."""
        self._try_import_ttv_capture()
        now = int(time.time())

        conn = get_connection()
        row = conn.execute("SELECT version_id FROM stories WHERE slug=?", (slug,)).fetchone()
        conn.close()
        id_story = str(row["version_id"]) if row and row["version_id"] else to_remote_slug(slug)

        detail = None
        if id_story:
            if on_progress:
                on_progress("Đang tải chi tiết truyện từ API TTV...")
            try:
                detail = self.ttv.fetch_story_detail(id_story)
            except Exception:
                detail = None

        if detail is not None:
            conn = get_connection()
            chapters = detail.chapters or []
            chapter_count = max(int(detail.chapter_count or 0), len(chapters))
            conn.execute(
                """INSERT INTO stories
                   (slug, title, author, translator_group, status, genres, description, cover_url,
                    chapter_count, source, version_id, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ttv', ?, ?, ?)
                   ON CONFLICT(slug) DO UPDATE SET
                       title=excluded.title,
                       author=CASE WHEN excluded.author<>'' THEN excluded.author ELSE stories.author END,
                       status=CASE WHEN excluded.status<>'' THEN excluded.status ELSE stories.status END,
                       genres=excluded.genres,
                       description=CASE WHEN excluded.description<>'' THEN excluded.description ELSE stories.description END,
                       cover_url=CASE WHEN excluded.cover_url<>'' THEN excluded.cover_url ELSE stories.cover_url END,
                       chapter_count=GREATEST(stories.chapter_count, excluded.chapter_count),
                       version_id=excluded.version_id,
                       updated_at=excluded.updated_at""",
                (slug, detail.title, detail.author, detail.translator_group, detail.status,
                 json.dumps(detail.genres, ensure_ascii=False), detail.description, detail.cover_url,
                 chapter_count, detail.source_id, now, now),
            )
            for ch in chapters:
                conn.execute(
                    """INSERT INTO story_chapters
                       (story_slug, slug, title, chapter_number, updated_time, created_at)
                       VALUES (?, ?, ?, ?, ?, ?)
                       ON CONFLICT(story_slug, slug) DO UPDATE SET
                           title=CASE
                               WHEN excluded.title <> '' THEN excluded.title
                               ELSE story_chapters.title
                           END,
                           chapter_number=CASE
                               WHEN excluded.chapter_number > 0 THEN excluded.chapter_number
                               ELSE story_chapters.chapter_number
                           END,
                           updated_time=CASE
                               WHEN excluded.updated_time <> '' THEN excluded.updated_time
                               ELSE story_chapters.updated_time
                           END""",
                    (slug, ch.slug, ch.title, ch.chapter_number, ch.updated_time or "", now),
                )
            conn.commit()
            conn.close()

        conn = get_connection()
        db_detail = self._story_detail_from_db(conn, slug)
        conn.close()
        if db_detail is not None:
            if detail is not None and detail.chapter_count > db_detail.chapter_count:
                db_detail.chapter_count = detail.chapter_count
            return db_detail
        return detail

    def get_chapter_content(self, slug: str, chapter_slug: str, on_progress: Callable = None) -> Optional[ChapterContent]:
        conn = get_connection()
        # 1. Try to get from local DB first
        row = self._chapter_row_from_db(conn, slug, chapter_slug, require_content=True)
        if row and row["content"]:
            conn.close()
            return ChapterContent(title=row["title"], content=row["content"])

        # 2. If not in DB, fetch from source
        story_row = self._story_row_from_db(conn, slug)
        conn.close()

        if not story_row:
            return None

        source = story_row["source"]

        if on_progress:
            on_progress(f"Đang tải nội dung chương từ {source}...")

        try:
            if source == "sitruyencv":
                return None
            elif source == "ttv":
                self._try_import_ttv_capture()
                conn = get_connection()
                row = self._chapter_row_from_db(conn, slug, chapter_slug, require_content=True)
                chapter_row = self._chapter_row_from_db(conn, slug, chapter_slug)
                conn.close()
                if row and row["content"]:
                    return ChapterContent(title=row["title"], content=row["content"])

                story_id = str(story_row["version_id"] or "").strip()
                if not story_id:
                    story_id = to_remote_slug(story_row["slug"] or slug) or to_remote_slug(slug)
                chapter_id = self._ttv_chapter_id_from_slug(chapter_row["slug"] if chapter_row else chapter_slug)
                if story_id and chapter_id:
                    if on_progress:
                        on_progress("Đang tải nội dung chương từ API TTV...")
                    content = self.ttv.fetch_chapter_content_by_id(
                        story_id,
                        chapter_id,
                        title=chapter_row["title"] if chapter_row else "",
                    )
                    if content:
                        conn = get_connection()
                        update_story_slug = chapter_row["story_slug"] if chapter_row else story_row["slug"]
                        update_chapter_slug = chapter_row["slug"] if chapter_row else f"chapter-{chapter_id}"
                        conn.execute(
                            """INSERT INTO story_chapters
                               (story_slug, slug, title, chapter_number, content, updated_time, created_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?)
                               ON CONFLICT(story_slug, slug) DO UPDATE SET
                                   title=CASE
                                       WHEN excluded.title <> '' THEN excluded.title
                                       ELSE story_chapters.title
                                   END,
                                   content=excluded.content,
                                   updated_time=excluded.updated_time""",
                            (
                                update_story_slug,
                                update_chapter_slug,
                                content.title,
                                chapter_row["chapter_number"] if chapter_row else self._chapter_number_candidate(chapter_slug),
                                content.content,
                                str(int(time.time())),
                                int(time.time()),
                            ),
                        )
                        conn.commit()
                        conn.close()
                        return content

                if self._is_ttv_capture_slug(slug):
                    return None
                content = self.ttv.fetch_chapter_content(slug, chapter_slug)
                if content:
                    conn = get_connection()
                    chapter_row = self._chapter_row_from_db(conn, slug, chapter_slug)
                    update_story_slug = chapter_row["story_slug"] if chapter_row else slug
                    update_chapter_slug = chapter_row["slug"] if chapter_row else chapter_slug
                    conn.execute(
                        "UPDATE story_chapters SET content=? WHERE story_slug=? AND slug=?",
                        (content.content, update_story_slug, update_chapter_slug),
                    )
                    conn.commit()
                    conn.close()
                return content
            else:
                content = self.scraper.fetch_chapter_content(slug, chapter_slug)
                if content:
                    conn = get_connection()
                    chapter_row = self._chapter_row_from_db(conn, slug, chapter_slug)
                    update_story_slug = chapter_row["story_slug"] if chapter_row else slug
                    update_chapter_slug = chapter_row["slug"] if chapter_row else chapter_slug
                    conn.execute(
                        "UPDATE story_chapters SET content=? WHERE story_slug=? AND slug=?",
                        (content.content, update_story_slug, update_chapter_slug),
                    )
                    conn.commit()
                    conn.close()
                return content
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Error fetching chapter content for {slug}/{chapter_slug}: {e}")
            return None

    def search_stories(self, keyword: str, source: str = "") -> list[StoryInfo]:

        conn = get_connection()
        source_filter = self._normalize_source(source)
        where_source = " AND source=?" if source_filter else ""
        params = [f"%{keyword}%"]
        if source_filter:
            params.append(source_filter)
        rows = conn.execute(
            "SELECT slug, title, author, cover_url, genres, chapter_count FROM stories "
            f"WHERE title LIKE ?{where_source} ORDER BY updated_at DESC LIMIT 30",
            params,
        ).fetchall()
        conn.close()
        if not rows and source_filter == "ttv":
            self._try_import_ttv_capture()
            conn = get_connection()
            rows = conn.execute(
                "SELECT slug, title, author, cover_url, genres, chapter_count FROM stories "
                f"WHERE title LIKE ?{where_source} ORDER BY updated_at DESC LIMIT 30",
                params,
            ).fetchall()
            conn.close()
        if rows:
            return [
                StoryInfo(
                    title=r["title"], slug=r["slug"], cover_url=r["cover_url"] or "",
                    tags=json.loads(r["genres"]) if r["genres"] else [],
                    last_chapter=f"{r['chapter_count']} chương" if r["chapter_count"] else "",
                )
                for r in rows
            ]
        client, source_name = self._client_for_source(source_filter)
        stories = client.search_stories(keyword=keyword)
        conn = get_connection()
        now = int(time.time())
        for s in stories:
            conn.execute(
                """INSERT INTO stories
                   (slug, title, author, cover_url, genres, chapter_count, source, version_id, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
                   ON CONFLICT(slug) DO UPDATE SET
                       title=excluded.title,
                       cover_url=excluded.cover_url,
                       genres=excluded.genres,
                       source=excluded.source,
                       version_id=excluded.version_id,
                       updated_at=excluded.updated_at""",
                (s.slug, s.title, "", s.cover_url,
                 json.dumps(s.tags, ensure_ascii=False), source_name, s.source_id,
                 s.updated_at or now, s.updated_at or now),
            )
        conn.commit()
        conn.close()
        return stories

    def save_captured_content(self, content_text: str) -> dict:
        """Lưu nội dung được capture từ app vào DB dưới một truyện mặc định."""
        import re
        import time
        conn = get_connection()
        now = int(time.time())
        
        # 1. Xác định truyện (slug mặc định cho capture từ app)
        story_slug = "truyencv-app-captured"
        story_title = "Truyện lấy từ App"
        
        conn.execute(
            """INSERT OR IGNORE INTO stories 
               (slug, title, author, genres, description, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (story_slug, story_title, "Unknown", "[]", "Nội dung được capture từ ứng dụng TruyenCV", now, now)
        )
        
        # 2. Trích xuất số chương từ nội dung (ví dụ: "Chương 123")
        match = re.search(r"Chương\s+(\d+)", content_text, re.IGNORECASE)
        if match:
            chapter_num = int(match.group(1))
            chapter_title = f"Chương {chapter_num}"
        else:
            # Nếu không tìm thấy, lấy 50 ký tự đầu làm tiêu đề
            chapter_num = 0
            chapter_title = content_text[:50].strip() + "..."
            
        chapter_slug = f"capture-{chapter_num}-{int(time.time())}"
        
        # 3. Lưu chương
        conn.execute(
            "INSERT INTO story_chapters (story_slug, slug, title, chapter_number, updated_time, created_at, content) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (story_slug, chapter_slug, chapter_title, chapter_num, now, now, content_text)
        )
        
        # 4. Cập nhật số lượng chương cho truyện
        row = conn.execute("SELECT COUNT(*) AS cnt FROM story_chapters WHERE story_slug=?", (story_slug,)).fetchone()
        conn.execute("UPDATE stories SET chapter_count=? WHERE slug=?", (row["cnt"], story_slug))
        
        conn.commit()
        conn.close()
        
        return {
            "slug": story_slug,
            "title": story_title,
            "chapter_title": chapter_title,
            "chapter_slug": chapter_slug
        }

    def clear_all(self) -> None:
        conn = get_connection()
        conn.execute("DELETE FROM story_chapters")
        conn.execute("DELETE FROM stories")
        conn.commit()
        conn.close()

    def delete_story(self, slug: str) -> bool:
        conn = get_connection()
        cur = conn.execute("DELETE FROM story_chapters WHERE story_slug=?", (slug,))
        cur2 = conn.execute("DELETE FROM stories WHERE slug=?", (slug,))
        conn.commit()
        success = (cur.rowcount > 0 or cur2.rowcount > 0)
        conn.close()
        return success

    def delete_chapter(self, story_slug: str, chapter_slug: str) -> bool:
        conn = get_connection()
        chapter_row = self._chapter_row_from_db(conn, story_slug, chapter_slug)
        if not chapter_row:
            conn.close()
            return False
        resolved_story_slug = chapter_row["story_slug"]
        cur = conn.execute(
            "DELETE FROM story_chapters WHERE story_slug=? AND slug=?",
            (resolved_story_slug, chapter_row["slug"]),
        )
        # Cập nhật lại số lượng chương của truyện
        row = conn.execute("SELECT COUNT(*) AS cnt FROM story_chapters WHERE story_slug=?", (resolved_story_slug,)).fetchone()
        count = row["cnt"] if row else 0
        conn.execute("UPDATE stories SET chapter_count=? WHERE slug=?", (count, resolved_story_slug))
        conn.commit()
        success = cur.rowcount > 0
        conn.close()
        return success
