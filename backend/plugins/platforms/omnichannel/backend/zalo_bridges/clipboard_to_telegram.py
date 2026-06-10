#!/usr/bin/env python3
"""
Clipboard to Telegram - Paste and send images directly from clipboard
Supports macOS clipboard (pbpaste with image data)
"""

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path


def get_image_from_clipboard_macos():
    """
    Get image from macOS clipboard and save to temp file.
    Returns the temp file path or None if no image in clipboard.
    """
    try:
        # Check if clipboard contains image data
        result = subprocess.run(
            ["osascript", "-e", "the clipboard as «class PNGf»"],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode != 0:
            # Try alternative method using pngpaste if installed
            try:
                temp_path = f"/tmp/clipboard_{int(time.time())}.png"
                result = subprocess.run(
                    ["pngpaste", temp_path],
                    capture_output=True,
                    timeout=5
                )
                
                if result.returncode == 0 and Path(temp_path).exists():
                    return temp_path
            except FileNotFoundError:
                pass
            
            return None
        
        # Save clipboard image to temp file using osascript
        temp_path = f"/tmp/clipboard_{int(time.time())}.png"
        
        applescript = f'''
        set png_data to the clipboard as «class PNGf»
        set the_file to open for access POSIX file "{temp_path}" with write permission
        write png_data to the_file
        close access the_file
        '''
        
        result = subprocess.run(
            ["osascript", "-e", applescript],
            capture_output=True,
            timeout=10
        )
        
        if result.returncode == 0 and Path(temp_path).exists():
            return temp_path
        
        return None
        
    except Exception as e:
        print(f"Error getting clipboard image: {e}", file=sys.stderr)
        return None


async def send_clipboard_image_to_telegram(chat_id, caption="", thread_id=None):
    """
    Get image from clipboard and send to Telegram.
    """
    from telegram import Bot
    
    # Load config
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    
    if not token:
        return {"ok": False, "error": "Missing TELEGRAM_BOT_TOKEN environment variable"}
    
    if not chat_id:
        return {"ok": False, "error": "Missing chat_id"}
    
    # Get image from clipboard
    print("📋 Getting image from clipboard...", file=sys.stderr)
    image_path = get_image_from_clipboard_macos()
    
    if not image_path:
        return {
            "ok": False,
            "error": "No image found in clipboard. Please copy an image first (Cmd+C on screenshot or image)."
        }
    
    print(f"✅ Image saved to: {image_path}", file=sys.stderr)
    
    try:
        bot = Bot(token=token)
        
        # Prepare kwargs
        kwargs = {}
        if thread_id:
            kwargs["message_thread_id"] = int(thread_id)
        if caption:
            kwargs["caption"] = caption
        
        # Send photo
        with open(image_path, "rb") as f:
            message = await bot.send_photo(
                chat_id=int(chat_id),
                photo=f,
                **kwargs
            )
        
        # Cleanup temp file
        Path(image_path).unlink(missing_ok=True)
        
        return {
            "ok": True,
            "message_id": str(message.message_id),
            "chat_id": str(chat_id)
        }
            
    except Exception as e:
        # Cleanup on error
        if image_path:
            Path(image_path).unlink(missing_ok=True)
        return {"ok": False, "error": str(e)}


def main():
    """Main CLI interface."""
    import asyncio
    
    if len(sys.argv) < 2:
        print("Usage: clipboard_to_telegram.py <chat_id> [caption] [thread_id]")
        print("\nExample:")
        print("  clipboard_to_telegram.py -1001234567890 'Check this out!'")
        print("  clipboard_to_telegram.py -1001234567890 'Screenshot' 12345")
        print("\nNote: Copy an image to clipboard first (Cmd+C)")
        sys.exit(1)
    
    chat_id = sys.argv[1]
    caption = sys.argv[2] if len(sys.argv) > 2 else ""
    thread_id = sys.argv[3] if len(sys.argv) > 3 else None
    
    result = asyncio.run(send_clipboard_image_to_telegram(chat_id, caption, thread_id))
    
    print(json.dumps(result, ensure_ascii=False, indent=2))
    
    if not result.get("ok"):
        sys.exit(1)


if __name__ == "__main__":
    main()
