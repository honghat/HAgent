#!/usr/bin/env python3
"""
Clipboard to Zalo - Paste and send images directly from clipboard
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


def send_clipboard_image_to_zalo(target_id, text="", thread_type="user"):
    """
    Get image from clipboard and send to Zalo.
    """
    # Load config
    cookie = os.environ.get("ZALO_COOKIE_STRING", "")
    imei = os.environ.get("ZALO_IMEI", "")
    
    if not cookie:
        return {"ok": False, "error": "Missing ZALO_COOKIE_STRING environment variable"}
    
    if not imei:
        return {"ok": False, "error": "Missing ZALO_IMEI environment variable"}
    
    if not target_id:
        return {"ok": False, "error": "Missing target_id"}
    
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
        # Send via zalo_send_bridge.py
        payload = {
            "action": "send_image",
            "cookie": cookie,
            "imei": imei,
            "target": target_id,
            "thread_type": thread_type,
            "image_path": image_path,
            "text": text
        }
        
        bridge_path = Path(__file__).parent / "zalo_send_bridge.py"
        
        result = subprocess.run(
            ["python3", str(bridge_path)],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            timeout=30
        )
        
        # Cleanup temp file
        Path(image_path).unlink(missing_ok=True)
        
        if result.returncode == 0:
            return json.loads(result.stdout)
        else:
            return {
                "ok": False,
                "error": result.stderr or result.stdout
            }
            
    except Exception as e:
        # Cleanup on error
        if image_path:
            Path(image_path).unlink(missing_ok=True)
        return {"ok": False, "error": str(e)}


def main():
    """Main CLI interface."""
    if len(sys.argv) < 2:
        print("Usage: clipboard_to_zalo.py <target_user_id> [caption]")
        print("\nExample:")
        print("  clipboard_to_zalo.py 1234567890 'Check this out!'")
        print("\nNote: Copy an image to clipboard first (Cmd+C)")
        sys.exit(1)
    
    target_id = sys.argv[1]
    caption = sys.argv[2] if len(sys.argv) > 2 else ""
    
    result = send_clipboard_image_to_zalo(target_id, caption)
    
    print(json.dumps(result, ensure_ascii=False, indent=2))
    
    if not result.get("ok"):
        sys.exit(1)


if __name__ == "__main__":
    main()
