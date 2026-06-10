"""Truyện CV API Router — endpoints cho Tab Giải trí

Cung cấp API để frontend gọi: danh sách truyện, chi tiết, nội dung chương, TTS.
"""
from __future__ import annotations

import logging
import os
import time
import json
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from urllib.parse import urlparse
import re
import httpx

from pathlib import Path
from api.services.truyencv_store import TruyenCVStore

_tts_warn_last: dict[str, float] = {}
_TTS_WARN_INTERVAL = 60.0

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/truyencv", tags=["truyencv"])

# ---- Pydantic response models ----

class StoryInfoResponse(BaseModel):
    title: str
    slug: str
    cover_url: str = ""
    tags: list[str] = []
    last_chapter: str = ""
    last_chapter_time: str = ""


class ChapterItem(BaseModel):
    title: str
    slug: str
    chapter_number: int = 0
    updated_time: str = ""


class StoryDetailResponse(BaseModel):
    title: str
    slug: str
    author: str = ""
    translator_group: str = ""
    status: str = ""
    genres: list[str] = []
    description: str = ""
    cover_url: str = ""
    chapter_count: int = 0
    chapters: list[ChapterItem] = []


class ChapterContentResponse(BaseModel):
    title: str
    content: str


# ---- Endpoints ----

def _get_store() -> TruyenCVStore:
    return TruyenCVStore()


@router.get("/recent", response_model=list[StoryInfoResponse])
async def get_recent_stories(
    page: int = Query(1, ge=1, le=100),
    refresh: bool = Query(False),
    source: str = Query("", max_length=50),
):
    """Lấy danh sách truyện mới cập nhật (có phân trang)"""
    store = _get_store()
    try:
        stories = store.get_recent_stories(page=page, refresh=refresh, source=source)
        return [
            StoryInfoResponse(
                title=s.title,
                slug=s.slug,
                cover_url=s.cover_url,
                tags=s.tags,
                last_chapter=s.last_chapter,
                last_chapter_time=s.last_chapter_time,
            )
            for s in stories
        ]
    except HTTPException:
        raise
    except Exception as e:
        # Retry logic cho lỗi crawl nguồn
        logger.exception("Lỗi khi lấy danh sách truyện gần đây — sẽ thử lại sau")
        if "Connection refused" in str(e) or "502" in str(e):
            raise HTTPException(
                status_code=503,
                detail="Nguồn truyện hiện đang bị quá tải hoặc đang bảo trì. Vui lòng thử lại sau hoặc bật chế độ 'Cập nhật'.",
            ) from e
        else:
            logger.exception("Lỗi không thể recover trong get_recent_stories")
            raise HTTPException(status_code=502, detail=str(e))
    finally:
        store.close()


@router.post("/sync")
async def sync_from_app(source: str = Query("", max_length=50)):
    """Đồng bộ trang truyện mới nhất từ nguồn truyện đã chọn."""
    store = _get_store()
    try:
        stories = store.get_recent_stories(page=1, refresh=True, source=source)
        return {"ok": True, "count": len(stories)}
    except Exception as e:
        logger.exception("Lỗi khi đồng bộ dữ liệu TruyenCV")
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        store.close()


@router.get("/search", response_model=list[StoryInfoResponse])
async def search_stories(
    q: str = Query(..., min_length=1, max_length=200),
    source: str = Query("", max_length=50),
):
    """Tìm kiếm truyện theo từ khóa"""
    store = _get_store()
    try:
        stories = store.search_stories(keyword=q, source=source)
        return [
            StoryInfoResponse(
                title=s.title, slug=s.slug, cover_url=s.cover_url,
                tags=s.tags, last_chapter=s.last_chapter,
            )
            for s in stories
        ]
    except Exception as e:
        logger.exception("Lỗi khi tìm kiếm truyện")
        # Check if error is related to upstream service issues
        if "502" in str(e) or "Bad gateway" in str(e):
            raise HTTPException(
                status_code=503,
                detail="Nguồn truyện hiện đang bị quá tải hoặc đang bảo trì. Vui lòng thử lại sau vài phút."
            ) from e
        else:
            raise HTTPException(status_code=502, detail=str(e))
    finally:
        store.close()


@router.get("/story/{slug}", response_model=StoryDetailResponse)
async def get_story_detail(
    slug: str,
    refresh: bool = Query(False),
    source: str = Query("", max_length=50),
):
    """Lấy chi tiết truyện và danh sách chương"""
    store = _get_store()
    try:
        detail = store.get_story_detail(slug, refresh=refresh, source=source)
        if detail is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy truyện")
        return StoryDetailResponse(
            title=detail.title,
            slug=detail.slug,
            author=detail.author,
            translator_group=detail.translator_group,
            status=detail.status,
            genres=detail.genres,
            description=detail.description,
            cover_url=detail.cover_url,
            chapter_count=detail.chapter_count,
            chapters=[
                ChapterItem(
                    title=c.title,
                    slug=c.slug,
                    chapter_number=c.chapter_number,
                    updated_time=c.updated_time,
                )
                for c in detail.chapters
            ],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Lỗi khi lấy chi tiết truyện %s", slug)
        # Check if error is related to upstream service issues
        if "502" in str(e) or "Bad gateway" in str(e):
            raise HTTPException(
                status_code=503,
                detail="Nguồn truyện hiện đang bị quá tải hoặc đang bảo trì. Vui lòng thử lại sau vài phút."
            ) from e
        else:
            raise HTTPException(status_code=502, detail=str(e))
    finally:
        store.close()


@router.get("/story/{slug}/chapter/{chapter_slug}", response_model=ChapterContentResponse)
async def get_chapter_content(slug: str, chapter_slug: str):
    """Lấy nội dung một chương"""
    store = _get_store()
    try:
        content = store.get_chapter_content(slug, chapter_slug)
        if content is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy nội dung chương")
        return ChapterContentResponse(title=content.title or "Không có tiêu đề", content=content.content or "")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Lỗi khi lấy nội dung chương %s/%s", slug, chapter_slug)
        # Check if error is related to upstream service issues
        if "502" in str(e) or "Bad gateway" in str(e):
            raise HTTPException(
                status_code=503,
                detail="Nguồn truyện hiện đang bị quá tải hoặc đang bảo trì. Vui lòng thử lại sau vài phút."
            ) from e
        else:
            raise HTTPException(status_code=502, detail=str(e))
    finally:
        store.close()


@router.get("/tts")
async def text_to_speech(text: str = Query(..., min_length=1, max_length=5000)):
    """Chuyển văn bản → audio binary (audio/mpeg) trực tiếp, không lưu file."""
    from fastapi.responses import Response

    # Ưu tiên: nếu có HAGENT_TTS_URL, proxy tới TTS server riêng
    tts_url = os.environ.get("HAGENT_TTS_URL", "").strip()
    if tts_url:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=30.0) as client:
                payload = {"text": text, "voice": "vi-VN-HoaiMyNeural"}
                resp = await client.post(tts_url, json=payload)
                resp.raise_for_status()
                if len(resp.content) > 0:
                    return Response(
                        content=resp.content,
                        media_type="audio/mpeg",
                        headers={"Cache-Control": "no-store"},
                    )
                raise ValueError("TTS server trả về audio rỗng")
        except Exception as e:
            now = time.monotonic()
            last = _tts_warn_last.get(tts_url, 0.0)
            if now - last >= _TTS_WARN_INTERVAL:
                _tts_warn_last[tts_url] = now
                logger.warning("Lỗi TTS server (%s): %s — fallback edge_tts (sẽ im lặng %ss)", tts_url, e, int(_TTS_WARN_INTERVAL))
            else:
                logger.debug("Lỗi TTS server (%s) bị throttle: %s", tts_url, e)

    # Fallback: edge_tts — ghi vào buffer in-memory
    try:
        import edge_tts
        import io
        communicate = edge_tts.Communicate(text, "vi-VN-HoaiMyNeural")
        buf = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])
        audio_bytes = buf.getvalue()
        if not audio_bytes:
            raise ValueError("edge_tts không trả về audio")
        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={"Cache-Control": "no-store"},
        )
    except Exception as e:
        logger.exception("Lỗi edge_tts khi tạo giọng nói")
        raise HTTPException(status_code=500, detail=f"Lỗi TTS: {e}")


@router.get("/apps")
async def list_running_apps():
    """Liệt kê các app đang chạy foreground để tìm tên đúng của TruyenCV."""
    from tools.truyencv_app_tool import list_foreground_apps
    apps = await list_foreground_apps()
    return {"apps": apps}


@router.post("/capture")
async def capture_from_app(app: str = ""):
    """
    Chụp cửa sổ app và OCR lấy nội dung truyện.
    ?app=TruyenCV để chỉ định tên process, hoặc để trống → chụp cửa sổ đang active.
    """
    from tools.truyencv_app_tool import get_text_from_app
    store = _get_store()
    try:
        result_pair = await get_text_from_app(app_name=app.strip() or None)
        if not result_pair:
            from tools.truyencv_app_tool import list_foreground_apps
            apps = await list_foreground_apps()
            raise HTTPException(
                status_code=500,
                detail=f"Không lấy được nội dung. App đang chạy: {apps}. Thử gọi ?app=<tên đúng>."
            )
        content, used_name = result_pair

        result = store.save_captured_content(content)
        preview = content[:300] + "..." if len(content) > 300 else content
        return {
            "ok": True,
            "app": used_name,
            "chars": len(content),
            "content": preview,
            "story": {"title": result["title"], "slug": result["slug"]},
            "chapter": result["chapter_title"],
        }
    finally:
        store.close()

@router.post("/import")
async def import_from_url(body: dict):
    """Không còn hỗ trợ import từ URL. Dùng /sync để đồng bộ từ TruyenCV."""
    raise HTTPException(
        status_code=410,
        detail="Import từ URL đã bị gỡ bỏ. Dùng /api/truyencv/sync để đồng bộ từ TruyenCV."
    )


@router.post("/clear")
async def clear_all_stories():
    """Xoá tất cả truyện và chương đã lưu trong DB"""
    store = _get_store()
    try:
        store.clear_all()
        return {"ok": True, "message": "Đã xoá tất cả dữ liệu truyện"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        store.close()


@router.delete("/story/{slug}")
async def delete_story(slug: str):
    """Xoá một truyện và tất cả chương của truyện đó trong DB"""
    store = _get_store()
    try:
        success = store.delete_story(slug)
        if not success:
            raise HTTPException(status_code=404, detail="Không tìm thấy truyện để xoá")
        return {"ok": True, "message": f"Đã xoá truyện '{slug}' khỏi DB"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        store.close()


@router.delete("/story/{slug}/chapter/{chapter_slug}")
async def delete_chapter(slug: str, chapter_slug: str):
    """Xoá một chương của truyện trong DB"""
    store = _get_store()
    try:
        success = store.delete_chapter(slug, chapter_slug)
        if not success:
            raise HTTPException(status_code=404, detail="Không tìm thấy chương để xoá")
        return {"ok": True, "message": f"Đã xoá chương '{chapter_slug}' của truyện '{slug}' khỏi DB"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        store.close()
