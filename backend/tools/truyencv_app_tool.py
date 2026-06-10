import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def _run(cmd: list[str]) -> tuple[str, str, int]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out, err = await proc.communicate()
    return out.decode().strip(), err.decode().strip(), proc.returncode


async def list_foreground_apps() -> list[str]:
    """Trả về danh sách tên app đang chạy foreground."""
    script = 'tell application "System Events" to get name of every process whose background only is false'
    out, _, rc = await _run(["osascript", "-e", script])
    if rc == 0 and out:
        return [n.strip() for n in out.split(",")]
    return []


async def _get_window_rect(app_name: str) -> Optional[tuple[int, int, int, int]]:
    """Lấy vị trí + kích thước cửa sổ của app theo tên."""
    script = (
        f'tell application "System Events" to tell process "{app_name}" '
        f'to get {{position, size}} of front window'
    )
    out, err, rc = await _run(["osascript", "-e", script])
    if rc != 0:
        logger.warning(f"Không lấy được window của '{app_name}': {err}")
        return None
    try:
        parts = [int(c.strip()) for c in out.split(",")]
        if len(parts) == 4:
            return tuple(parts)
    except ValueError:
        pass
    return None


async def _get_frontmost_rect() -> Optional[tuple[int, int, int, int]]:
    """Lấy cửa sổ đang active (frontmost)."""
    script = """
tell application "System Events"
    set fp to first process whose frontmost is true
    set fw to first window of fp
    set pos to position of fw
    set sz to size of fw
    return (item 1 of pos) & "," & (item 2 of pos) & "," & (item 1 of sz) & "," & (item 2 of sz)
end tell
"""
    out, err, rc = await _run(["osascript", "-e", script])
    if rc != 0:
        logger.warning(f"Không lấy được frontmost window: {err}")
        return None
    try:
        parts = [int(c.strip()) for c in out.split(",")]
        if len(parts) == 4:
            return tuple(parts)
    except ValueError:
        pass
    return None


async def get_text_from_app(app_name: Optional[str] = None) -> Optional[tuple[str, str]]:
    """
    Chụp cửa sổ app (theo tên) hoặc cửa sổ frontmost, OCR lấy text.
    Trả về (text, app_name) hoặc None nếu thất bại.
    """
    from api.routers.pdf_tools import _ocr_remote

    img_path = "/tmp/truyencv_capture.png"

    if app_name:
        rect = await _get_window_rect(app_name)
        if not rect:
            apps = await list_foreground_apps()
            logger.info(f"App đang chạy: {apps}")
            return None
        used_name = app_name
    else:
        rect = await _get_frontmost_rect()
        used_name = "frontmost"

    if rect:
        x, y, w, h = rect
        logger.info(f"Chụp '{used_name}': x={x} y={y} w={w} h={h}")
        if w < 100 or h < 100:
            logger.warning(f"Cửa sổ quá nhỏ: {w}x{h}")
            return None
        _, err, rc = await _run(["screencapture", "-x", "-R", f"{x},{y},{w},{h}", img_path])
    else:
        logger.warning("Chụp toàn màn hình fallback")
        _, err, rc = await _run(["screencapture", "-x", img_path])

    if rc != 0:
        logger.error(f"screencapture lỗi: {err}")
        return None

    try:
        with open(img_path, "rb") as f:
            img_bytes = f.read()
    except FileNotFoundError:
        logger.error("Không tạo được file ảnh")
        return None

    logger.info(f"Ảnh: {len(img_bytes):,} bytes → OCR")
    content = await _ocr_remote(img_bytes)
    if not content or not content.strip():
        logger.warning("OCR trả về rỗng")
        return None

    return content.strip(), used_name
