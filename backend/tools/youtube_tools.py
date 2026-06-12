"""YouTube search and metadata tools."""

import json
from typing import Any, Dict
import yt_dlp
from .registry import registry, tool_error, tool_result


async def _handle_search_youtube(args: Dict[str, Any], **kwargs) -> str:
    """Search YouTube for videos."""
    query = args.get("query")
    if not query:
        return tool_error("Yêu cầu tham số 'query'")
    
    max_results = args.get("max_results", 5)
    
    ydl_opts = {
        "quiet": True,
        "extract_flat": True,
        "skip_download": True,
        "no_warnings": True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            search_query = f"ytsearch{max_results}:{query}"
            info = ydl.extract_info(search_query, download=False)
            entries = info.get("entries", [])
            
            results = []
            for entry in entries:
                if not entry:
                    continue
                results.append({
                    "id": entry.get("id"),
                    "title": entry.get("title"),
                    "url": f"https://www.youtube.com/watch?v={entry.get('id')}" if entry.get("id") else None,
                    "duration": entry.get("duration"),
                    "uploader": entry.get("uploader"),
                    "view_count": entry.get("view_count"),
                })
            return tool_result(results=results)
    except Exception as e:
        return tool_error(f"Lỗi tìm kiếm YouTube: {e}")


async def _handle_get_youtube_info(args: Dict[str, Any], **kwargs) -> str:
    """Get metadata for a YouTube video URL."""
    url = args.get("url")
    if not url:
        return tool_error("Yêu cầu tham số 'url'")
    
    ydl_opts = {
        "quiet": True,
        "skip_download": True,
        "no_warnings": True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return tool_result({
                "id": info.get("id"),
                "title": info.get("title"),
                "description": info.get("description"),
                "duration": info.get("duration"),
                "uploader": info.get("uploader"),
                "view_count": info.get("view_count"),
                "like_count": info.get("like_count"),
                "upload_date": info.get("upload_date"),
                "tags": info.get("tags"),
                "categories": info.get("categories"),
            })
    except Exception as e:
        return tool_error(f"Lỗi lấy thông tin YouTube: {e}")


async def _handle_get_youtube_audio_url(args: Dict[str, Any], **kwargs) -> str:
    """Extract best audio stream URL for a YouTube video URL."""
    url = args.get("url")
    if not url:
        return tool_error("Yêu cầu tham số 'url'")
    
    ydl_opts = {
        "quiet": True,
        "skip_download": True,
        "format": "bestaudio/best",
        "no_warnings": True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            audio_url = info.get("url")
            return tool_result({
                "title": info.get("title"),
                "audio_url": audio_url,
                "format_id": info.get("format_id"),
                "ext": info.get("ext"),
                "asr": info.get("asr"),
                "filesize": info.get("filesize"),
            })
    except Exception as e:
        return tool_error(f"Lỗi lấy link audio YouTube: {e}")


# Register tools
registry.register(
    name="search_youtube",
    toolset="youtube",
    schema={
        "name": "search_youtube",
        "description": "Tìm kiếm video trên YouTube bằng từ khóa.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Từ khóa tìm kiếm (VD: 'guqin teaching', 'nhạc thiền')"},
                "max_results": {"type": "integer", "description": "Số lượng kết quả tối đa (mặc định là 5)"}
            },
            "required": ["query"],
        },
    },
    handler=_handle_search_youtube,
    is_async=True,
    emoji="🔍",
    plan_safe=True,
)

registry.register(
    name="get_youtube_info",
    toolset="youtube",
    schema={
        "name": "get_youtube_info",
        "description": "Lấy thông tin chi tiết (metadata) của video YouTube từ URL.",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Đường dẫn video YouTube"}
            },
            "required": ["url"],
        },
    },
    handler=_handle_get_youtube_info,
    is_async=True,
    emoji="ℹ️",
    plan_safe=True,
)

registry.register(
    name="get_youtube_audio_url",
    toolset="youtube",
    schema={
        "name": "get_youtube_audio_url",
        "description": "Lấy đường dẫn luồng âm thanh trực tiếp (audio stream URL) của video YouTube để phục vụ nghe/STT.",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Đường dẫn video YouTube"}
            },
            "required": ["url"],
        },
    },
    handler=_handle_get_youtube_audio_url,
    is_async=True,
    emoji="🎵",
    plan_safe=True,
)
