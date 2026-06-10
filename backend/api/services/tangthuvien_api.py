"""Client đọc dữ liệu Tàng Thư Viện (TTV) qua API thật của app — host nae.vn.

App TTV gọi các endpoint công khai dưới `nae.vn/ttv/ttv_apiv2/public`:
  - get_list_story_author  (POST {id_story})  -> chi tiết truyện (không cần hash)
  - get_list_story_type    (GET type/page/offset) -> danh sách theo thể loại
  - get_token              (form get_token=JSON) -> remember_token cho app
  - get_list_chapter / get_content_chapter -> form field chứa JSON + SHA-256 hash

Capture proxy vẫn hữu ích để dò id_story/id_chapter từ iPad, nhưng khi đã có
id_story và id_chapter thì backend tự gọi API app để lấy mục lục + nội dung.
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import unicodedata
import uuid
from datetime import datetime, timezone
from typing import Optional

import requests

from api.services.db import DATA_DIR
from api.services.truyencv_app_api import ChapterContent, ChapterInfo, StoryDetail, StoryInfo

API_BASE = "https://nae.vn/ttv/ttv_apiv2/public"
IMAGE_BASE = "https://nae.vn/ttv/ttv/public/images/story"
SOURCE = "ttv"
SLUG_PREFIX = "ttv--"
CONFIG_PATH = DATA_DIR / "ttv_config.json"
TTV_HASH_SALT = "174587236491eyoruwoiernzwueyquhszsadhajsdha8"

HEADERS = {
    "Accept": "application/json",
    "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
    "User-Agent": "okhttp/4.9.3",
}


def is_ttv_slug(slug: str) -> bool:
    return (slug or "").startswith(SLUG_PREFIX)


def to_db_slug(id_story) -> str:
    return f"{SLUG_PREFIX}{id_story}"


def to_remote_slug(db_slug: str) -> str:
    """Lấy id_story từ slug. Hỗ trợ slug mới `ttv--{id}` và slug cũ `ttv--ipad-...-{id}`."""
    value = (db_slug or "").strip("/")
    if value.startswith(SLUG_PREFIX):
        value = value[len(SLUG_PREFIX):]
    if value.isdigit():
        return value
    match = re.search(r"(\d+)$", value)
    return match.group(1) if match else ""


def load_ttv_config() -> dict:
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_ttv_config(data: dict) -> dict:
    config = load_ttv_config()
    config.update({k: v for k, v in data.items() if v is not None})
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    return config


def _clean_text(value: str) -> str:
    value = html.unescape(str(value or ""))
    value = unicodedata.normalize("NFC", value)
    return re.sub(r"\s+", " ", value).strip()


def _clean_intro(value: str) -> str:
    value = html.unescape(str(value or ""))
    value = value.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\r\n", "\n")
    value = unicodedata.normalize("NFC", value)
    return re.sub(r"\n{3,}", "\n\n", value).strip()


def _clean_content(value: str) -> str:
    value = html.unescape(str(value or ""))
    value = value.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\r\n", "\n")
    value = unicodedata.normalize("NFC", value)
    return re.sub(r"\n{4,}", "\n\n\n", value).strip()


def _sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _cover_url(image: str) -> str:
    image = (image or "").strip()
    if not image:
        return ""
    if image.startswith(("http://", "https://", "/")):
        return image
    return f"{IMAGE_BASE}/{image}.jpg"


def _status_text(finish) -> str:
    return "Hoàn thành" if str(finish) in {"1", "true", "True"} else "Đang ra"


def _ts(value: str) -> int:
    if not value:
        return 0
    try:
        return int(datetime.fromisoformat(str(value)).replace(tzinfo=timezone.utc).timestamp())
    except ValueError:
        return 0


class TangThuVienAppApi:
    """Đọc metadata truyện TTV từ API app nae.vn."""

    def __init__(self, timeout: int = 30):
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(HEADERS)

    def close(self) -> None:
        self.session.close()

    def _get(self, path: str, params: Optional[dict] = None) -> dict:
        resp = self.session.get(f"{API_BASE}/{path}", params=params, timeout=self.timeout)
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, payload: dict) -> dict:
        resp = self.session.post(f"{API_BASE}/{path}", json=payload, timeout=self.timeout)
        resp.raise_for_status()
        return resp.json()

    def _post_form_json(self, path: str, field: str, payload: dict, token: str = "") -> dict:
        headers = {"token": token} if token else None
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        resp = self.session.post(
            f"{API_BASE}/{path}",
            data={field: body},
            headers=headers,
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return resp.json()

    def _remember_token(self, force_refresh: bool = False) -> str:
        config = load_ttv_config()
        token = str(config.get("remember_token") or "").strip()
        if token and not force_refresh:
            return token

        device_imei = str(config.get("device_imei") or "").strip()
        if not device_imei:
            device_imei = f"hagent-{uuid.uuid4().hex[:24]}"
        token_adr = str(config.get("token_adr") or "GCM").strip() or "GCM"

        data = self._post_form_json(
            "get_token",
            "get_token",
            {"imei": device_imei, "token_adr": token_adr, "token_ios": ""},
        )
        imei = data.get("imei") if isinstance(data, dict) else None
        token = str((imei or {}).get("remember_token") or "").strip()
        if not token:
            raise RuntimeError(data.get("message") if isinstance(data, dict) else "Không lấy được remember_token TTV")

        save_ttv_config({
            "device_imei": device_imei,
            "token_adr": token_adr,
            "remember_token": token,
            "remember_user_id": (imei or {}).get("id"),
        })
        return token

    # ---- mapping ----

    def _story_info(self, item: dict) -> Optional[StoryInfo]:
        story_id = item.get("id")
        name = _clean_text(item.get("name"))
        if not story_id or not name:
            return None
        latest = item.get("chapter_new") or {}
        tags = [t for t in [_clean_text(item.get("category_name"))] if t]
        return StoryInfo(
            title=name,
            slug=to_db_slug(story_id),
            cover_url=_cover_url(item.get("image")),
            tags=tags,
            last_chapter=_clean_text(latest.get("content_title_of_chapter") or latest.get("name_id_chapter")),
            last_chapter_time=str(latest.get("time_create") or item.get("time_fix") or ""),
            source_id=int(story_id),
            updated_at=_ts(item.get("time_fix") or (latest.get("time_create") if isinstance(latest, dict) else "")),
        )

    def fetch_recent_stories(self, page: int = 1) -> list[StoryInfo]:
        genre_type = load_ttv_config().get("genre_type", "")
        stories = []
        if genre_type:
            try:
                data = self._get(
                    "get_list_story_type",
                    params={"type": genre_type, "page": page, "offset": (page - 1) * 30},
                )
                if isinstance(data, dict) and data.get("status") == 1:
                    for item in data.get("list_stories") or []:
                        info = self._story_info(item)
                        if info:
                            stories.append(info)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning("Error calling get_list_story_type: %s", e)

        if not stories:
            # Fallback to get_list_story_home
            try:
                home_data = self._get("get_list_story_home")
                if isinstance(home_data, dict) and home_data.get("status") == 1:
                    seen_ids = set()
                    for key in ["story_news", "story_hot_months", "story_finish", "story_nominateds", "story_starts"]:
                        for item in home_data.get(key) or []:
                            if not isinstance(item, dict):
                                continue
                            story_id = item.get("id")
                            if story_id and story_id not in seen_ids:
                                seen_ids.add(story_id)
                                info = self._story_info(item)
                                if info:
                                    stories.append(info)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning("Error calling get_list_story_home: %s", e)

        return stories


    def search_stories(self, keyword: str) -> list[StoryInfo]:
        # API app không lộ endpoint tìm kiếm — để store fallback sang DB.
        del keyword
        return []

    def fetch_story_detail(self, id_story) -> Optional[StoryDetail]:
        """Chi tiết truyện theo id_story (POST get_list_story_author, không cần hash)."""
        id_story = str(id_story).strip()
        if not id_story.isdigit():
            return None
        data = self._post("get_list_story_author", {"id_story": int(id_story)})
        story = data.get("story") if isinstance(data, dict) else None
        if not isinstance(story, dict) or not story.get("name"):
            return None
        try:
            chapters = self.fetch_chapter_list(id_story)
        except Exception:
            chapters = []
        return StoryDetail(
            title=_clean_text(story.get("name")),
            slug=to_db_slug(story.get("id") or id_story),
            author=_clean_text(story.get("author")),
            translator_group="",
            status=_status_text(story.get("finish")),
            genres=[t for t in [_clean_text(story.get("category_name"))] if t],
            description=_clean_intro(story.get("introduce")),
            cover_url=_cover_url(story.get("image")),
            chapter_count=int(story.get("count_chapter") or 0),
            chapters=chapters,
            source_id=int(story.get("id") or id_story),
            updated_at=_ts(story.get("time_fix") or story.get("time_create")),
        )

    def fetch_chapter_list(self, id_story) -> list[ChapterInfo]:
        """Lấy toàn bộ mục lục qua API app bằng remember_token + hash."""
        id_story = str(id_story).strip()
        if not id_story.isdigit():
            return []
        for attempt in range(2):
            token = self._remember_token(force_refresh=attempt > 0)
            hash_value = _sha256_hex(f"{token}{id_story}0all{TTV_HASH_SALT}")
            data = self._post_form_json(
                "get_list_chapter",
                "get_list_chapter",
                {"id_story": id_story, "delta": "0", "all": "all", "hash": hash_value},
                token=token,
            )
            if isinstance(data, dict) and data.get("status") == 1:
                chapters = []
                seen: set[str] = set()
                for item in data.get("chapter") or []:
                    if not isinstance(item, dict):
                        continue
                    chapter_id = item.get("id")
                    if not chapter_id:
                        continue
                    slug = f"chapter-{chapter_id}"
                    if slug in seen:
                        continue
                    seen.add(slug)
                    number_match = re.search(r"(\d+)", str(item.get("name_id_chapter") or item.get("url") or ""))
                    number = int(number_match.group(1)) if number_match else len(chapters) + 1
                    title = _clean_text(item.get("content_title_of_chapter") or item.get("name_id_chapter") or f"Chương {number}")
                    chapters.append(ChapterInfo(
                        title=title or f"Chương {number}",
                        slug=slug,
                        chapter_number=number,
                        updated_time="",
                    ))
                return sorted(chapters, key=lambda ch: ch.chapter_number or 0)

            status = data.get("status") if isinstance(data, dict) else None
            message = str(data.get("message") if isinstance(data, dict) else "")
            if status == 401 or "bảo mật" in message.lower() or "token" in message.lower():
                continue
            return []
        return []

    def fetch_chapter_content_by_id(
        self,
        id_story,
        id_chapter,
        user_id: str = "0",
        title: str = "",
    ) -> Optional[ChapterContent]:
        """Lấy nội dung chương theo id_story/id_chapter và cache token trong data/ttv_config.json."""
        id_story = str(id_story).strip()
        id_chapter = str(id_chapter).strip()
        user_id = str(user_id or "0").strip() or "0"
        if not id_story.isdigit() or not id_chapter.isdigit():
            return None

        for attempt in range(2):
            token = self._remember_token(force_refresh=attempt > 0)
            hash_value = _sha256_hex(f"{token}{id_chapter}{id_story}{user_id}{TTV_HASH_SALT}")
            data = self._post_form_json(
                "get_content_chapter",
                "get_content_chapter",
                {"id_chapter": id_chapter, "id_story": id_story, "user_id": user_id, "hash": hash_value},
                token=token,
            )
            if isinstance(data, dict) and data.get("status") == 1:
                items = data.get("content_chapter") or []
                item = items[0] if items and isinstance(items[0], dict) else {}
                content = _clean_content(item.get("content"))
                if content:
                    return ChapterContent(title=_clean_text(title) or f"chapter-{id_chapter}", content=content)
                return None

            status = data.get("status") if isinstance(data, dict) else None
            message = str(data.get("message") if isinstance(data, dict) else "")
            if status == 401 or "bảo mật" in message.lower() or "token" in message.lower():
                continue
            return None
        return None

    def fetch_chapter_content(self, slug: str, chapter_slug: str) -> Optional[ChapterContent]:
        id_story = to_remote_slug(slug)
        match = re.search(r"(\d+)$", str(chapter_slug or ""))
        id_chapter = match.group(1) if match else ""
        if not id_story or not id_chapter:
            return None
        return self.fetch_chapter_content_by_id(id_story, id_chapter)
