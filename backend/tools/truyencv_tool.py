#!/usr/bin/env python3
import json
from typing import Optional
from tools.registry import registry
from api.services.truyencv_store import TruyenCVStore

def _json(data) -> str:
    return json.dumps(data, ensure_ascii=False, default=str)

@registry.register(
    name="truyencv_fetch_recent",
    toolset="entertainment",
    emoji="📚",
    description="Fetch recent stories list from TruyenTV and save them to the local SQLite database.",
    parameters={
        "type": "object",
        "properties": {
            "page": {"type": "integer", "default": 1, "description": "The page number to fetch."},
            "refresh": {"type": "boolean", "default": False, "description": "Whether to force-clear cache before fetching."}
        }
    }
)
async def truyencv_fetch_recent(page: int = 1, refresh: bool = False):
    store = TruyenCVStore()
    try:
        stories = store.get_recent_stories(page=page, refresh=refresh)
        return _json({
            "ok": True,
            "count": len(stories),
            "stories": [{"title": s.title, "slug": s.slug, "cover_url": s.cover_url, "tags": s.tags} for s in stories]
        })
    except Exception as e:
        return _json({"ok": False, "error": str(e)})
    finally:
        store.close()

@registry.register(
    name="truyencv_fetch_detail",
    toolset="entertainment",
    emoji="📖",
    description="Fetch detailed story metadata and its chapters catalog from TruyenTV, saving them to the DB.",
    parameters={
        "type": "object",
        "properties": {
            "slug": {"type": "string", "description": "The story slug to fetch (e.g. 'thanh-dieu-zhihu')."},
            "refresh": {"type": "boolean", "default": False, "description": "Whether to force-fetch from source even if cached."}
        },
        "required": ["slug"]
    }
)
async def truyencv_fetch_detail(slug: str, refresh: bool = False):
    store = TruyenCVStore()
    try:
        detail = store.get_story_detail(slug=slug, refresh=refresh)
        if not detail:
            return _json({"ok": False, "error": "Story not found"})
        return _json({
            "ok": True,
            "title": detail.title,
            "slug": detail.slug,
            "author": detail.author,
            "genres": detail.genres,
            "chapter_count": detail.chapter_count,
            "chapters": [{"title": c.title, "slug": c.slug, "chapter_number": c.chapter_number} for c in detail.chapters[:10]]
        })
    except Exception as e:
        return _json({"ok": False, "error": str(e)})
    finally:
        store.close()

@registry.register(
    name="truyencv_fetch_chapter",
    toolset="entertainment",
    emoji="📄",
    description="Fetch a specific chapter content and save it to the DB.",
    parameters={
        "type": "object",
        "properties": {
            "story_slug": {"type": "string", "description": "The story slug (e.g. 'thanh-dieu-zhihu')."},
            "chapter_slug": {"type": "string", "description": "The chapter slug (e.g. 'chuong-1')."}
        },
        "required": ["story_slug", "chapter_slug"]
    }
)
async def truyencv_fetch_chapter(story_slug: str, chapter_slug: str):
    store = TruyenCVStore()
    try:
        content = store.get_chapter_content(slug=story_slug, chapter_slug=chapter_slug)
        if not content:
            return _json({"ok": False, "error": "Chapter not found"})
        return _json({
            "ok": True,
            "title": content.title,
            "content_preview": content.content[:300] + "..." if len(content.content) > 300 else content.content
        })
    except Exception as e:
        return _json({"ok": False, "error": str(e)})
    finally:
        store.close()

@registry.register(
    name="truyencv_delete_story",
    toolset="entertainment",
    emoji="🗑️",
    description="Delete a story and all its chapters from the local DB.",
    parameters={
        "type": "object",
        "properties": {
            "slug": {"type": "string", "description": "The story slug to delete from local database."}
        },
        "required": ["slug"]
    }
)
async def truyencv_delete_story(slug: str):
    store = TruyenCVStore()
    try:
        success = store.delete_story(slug)
        return _json({"ok": True, "deleted": success, "message": f"Story '{slug}' deleted from local DB"})
    except Exception as e:
        return _json({"ok": False, "error": str(e)})
    finally:
        store.close()

@registry.register(
    name="truyencv_delete_chapter",
    toolset="entertainment",
    emoji="✂️",
    description="Delete a single chapter of a story from the local DB.",
    parameters={
        "type": "object",
        "properties": {
            "story_slug": {"type": "string", "description": "The story slug."},
            "chapter_slug": {"type": "string", "description": "The chapter slug to delete."}
        },
        "required": ["story_slug", "chapter_slug"]
    }
)
async def truyencv_delete_chapter(story_slug: str, chapter_slug: str):
    store = TruyenCVStore()
    try:
        success = store.delete_chapter(story_slug, chapter_slug)
        return _json({"ok": True, "deleted": success, "message": f"Chapter '{chapter_slug}' of story '{story_slug}' deleted from local DB"})
    except Exception as e:
        return _json({"ok": False, "error": str(e)})
    finally:
        store.close()
