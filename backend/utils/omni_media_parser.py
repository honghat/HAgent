#!/usr/bin/env python3
"""
OmniChat Media Parser - Parse and format media messages
Handles __OMNI_MEDIA__ format for images, videos, files
"""

import json
import re
from typing import Optional, Dict, List, Tuple
from pathlib import Path


OMNI_MEDIA_PREFIX = "__OMNI_MEDIA__"
OMNI_MEDIA_PATTERN = re.compile(r'__OMNI_MEDIA__(\{[^}]+\})')


def parse_omni_media(content: str) -> Tuple[str, List[Dict]]:
    """
    Parse message content and extract media attachments.
    
    Args:
        content: Message content that may contain __OMNI_MEDIA__ markers
    
    Returns:
        Tuple of (text_content, media_list)
        - text_content: Plain text without media markers
        - media_list: List of media dicts with {type, url, label}
    
    Example:
        Input: "Check this __OMNI_MEDIA__{"type":"image","url":"/api/omni/files/xxx.png","label":"Ảnh"}"
        Output: ("Check this [Ảnh]", [{"type":"image","url":"/api/omni/files/xxx.png","label":"Ảnh"}])
    """
    media_list = []
    text_content = content
    
    # Find all media markers
    matches = OMNI_MEDIA_PATTERN.findall(content)
    
    for match in matches:
        try:
            media_data = json.loads(match)
            media_list.append(media_data)
            
            # Replace marker with label
            label = media_data.get('label', '[Media]')
            full_marker = f"{OMNI_MEDIA_PREFIX}{match}"
            text_content = text_content.replace(full_marker, f"[{label}]", 1)
            
        except json.JSONDecodeError:
            # Invalid JSON, skip
            continue
    
    return text_content, media_list


def format_omni_media(media_type: str, url: str, label: Optional[str] = None) -> str:
    """
    Format media as __OMNI_MEDIA__ marker.
    
    Args:
        media_type: Type of media (image, video, file, audio)
        url: URL or path to media
        label: Optional label (default: auto-generated)
    
    Returns:
        Formatted __OMNI_MEDIA__ string
    
    Example:
        >>> format_omni_media("image", "/api/omni/files/xxx.png", "Screenshot")
        '__OMNI_MEDIA__{"type":"image","url":"/api/omni/files/xxx.png","label":"Screenshot"}'
    """
    if label is None:
        label_map = {
            'image': 'Ảnh',
            'video': 'Video',
            'audio': 'Audio',
            'file': 'File'
        }
        label = label_map.get(media_type, 'Media')
    
    media_data = {
        "type": media_type,
        "url": url,
        "label": label
    }
    
    return f"{OMNI_MEDIA_PREFIX}{json.dumps(media_data, ensure_ascii=False)}"


def extract_media_urls(content: str) -> List[str]:
    """
    Extract all media URLs from message content.
    
    Args:
        content: Message content with __OMNI_MEDIA__ markers
    
    Returns:
        List of media URLs
    """
    _, media_list = parse_omni_media(content)
    return [media.get('url', '') for media in media_list if media.get('url')]


def has_media(content: str) -> bool:
    """
    Check if message content contains media.
    
    Args:
        content: Message content
    
    Returns:
        True if content has __OMNI_MEDIA__ markers
    """
    return OMNI_MEDIA_PREFIX in content


def get_media_type(url: str) -> str:
    """
    Detect media type from URL/path.
    
    Args:
        url: URL or file path
    
    Returns:
        Media type: image, video, audio, or file
    """
    ext = Path(url).suffix.lower()
    
    image_exts = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'}
    video_exts = {'.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv'}
    audio_exts = {'.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma'}
    
    if ext in image_exts:
        return 'image'
    elif ext in video_exts:
        return 'video'
    elif ext in audio_exts:
        return 'audio'
    else:
        return 'file'


def format_message_with_media(text: str, media_urls: List[str]) -> str:
    """
    Format message with media attachments.
    
    Args:
        text: Plain text message
        media_urls: List of media URLs to attach
    
    Returns:
        Formatted message with __OMNI_MEDIA__ markers
    
    Example:
        >>> format_message_with_media("Check these", ["/api/omni/files/1.png", "/api/omni/files/2.jpg"])
        'Check these __OMNI_MEDIA__{"type":"image","url":"/api/omni/files/1.png","label":"Ảnh"} __OMNI_MEDIA__{"type":"image","url":"/api/omni/files/2.jpg","label":"Ảnh"}'
    """
    result = text
    
    for url in media_urls:
        media_type = get_media_type(url)
        media_marker = format_omni_media(media_type, url)
        result += f" {media_marker}"
    
    return result.strip()


def convert_to_markdown(content: str) -> str:
    """
    Convert __OMNI_MEDIA__ markers to Markdown format.
    
    Args:
        content: Message content with __OMNI_MEDIA__ markers
    
    Returns:
        Markdown formatted content
    
    Example:
        Input: "Check __OMNI_MEDIA__{"type":"image","url":"/files/x.png","label":"Screenshot"}"
        Output: "Check ![Screenshot](/files/x.png)"
    """
    text_content, media_list = parse_omni_media(content)
    
    result = text_content
    
    for media in media_list:
        media_type = media.get('type', 'file')
        url = media.get('url', '')
        label = media.get('label', 'Media')
        
        if media_type == 'image':
            markdown = f"![{label}]({url})"
        elif media_type == 'video':
            markdown = f"[🎥 {label}]({url})"
        elif media_type == 'audio':
            markdown = f"[🔊 {label}]({url})"
        else:
            markdown = f"[📎 {label}]({url})"
        
        # Append markdown
        result += f" {markdown}"
    
    return result.strip()


def convert_to_html(content: str) -> str:
    """
    Convert __OMNI_MEDIA__ markers to HTML format.
    
    Args:
        content: Message content with __OMNI_MEDIA__ markers
    
    Returns:
        HTML formatted content
    """
    text_content, media_list = parse_omni_media(content)
    
    result = f"<p>{text_content}</p>" if text_content else ""
    
    for media in media_list:
        media_type = media.get('type', 'file')
        url = media.get('url', '')
        label = media.get('label', 'Media')
        
        if media_type == 'image':
            html = f'<img src="{url}" alt="{label}" />'
        elif media_type == 'video':
            html = f'<video src="{url}" controls>{label}</video>'
        elif media_type == 'audio':
            html = f'<audio src="{url}" controls>{label}</audio>'
        else:
            html = f'<a href="{url}">{label}</a>'
        
        result += html
    
    return result


# Convenience functions
def is_image_message(content: str) -> bool:
    """Check if message contains image media."""
    _, media_list = parse_omni_media(content)
    return any(m.get('type') == 'image' for m in media_list)


def is_video_message(content: str) -> bool:
    """Check if message contains video media."""
    _, media_list = parse_omni_media(content)
    return any(m.get('type') == 'video' for m in media_list)


def get_first_image_url(content: str) -> Optional[str]:
    """Get URL of first image in message."""
    _, media_list = parse_omni_media(content)
    for media in media_list:
        if media.get('type') == 'image':
            return media.get('url')
    return None


def count_media(content: str) -> int:
    """Count number of media attachments in message."""
    _, media_list = parse_omni_media(content)
    return len(media_list)
