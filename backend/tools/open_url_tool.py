"""Tools: agent pushes open/close commands to the user's browser tabs."""

import platform
import subprocess

from tools.registry import registry, tool_result, tool_error

_DEFAULT_USER = "398f6a8a-8954-4315-8240-df769e664b54"


def _system_close_chrome_tabs(target: str) -> tuple[int, str]:
    """On macOS, close Chrome tabs matching URL / domain substring. Returns (count, err)."""
    if platform.system() != "Darwin":
        return 0, "not macOS"
    pattern = (target or "").strip().lower()
    if not pattern:
        return 0, "empty pattern"
    if pattern.startswith("http://"):
        pattern = pattern[7:]
    elif pattern.startswith("https://"):
        pattern = pattern[8:]
    if pattern.startswith("www."):
        pattern = pattern[4:]
    pattern_esc = pattern.replace('"', '\\"')
    script = f'''
    set targetPattern to "{pattern_esc}"
    set closedCount to 0
    tell application "System Events"
        if not (exists process "Google Chrome") then return 0
    end tell
    tell application "Google Chrome"
        set winList to every window
        repeat with w in winList
            set tIdx to (count of tabs of w)
            repeat while tIdx ≥ 1
                try
                    set theURL to URL of tab tIdx of w
                    if theURL contains targetPattern then
                        close tab tIdx of w
                        set closedCount to closedCount + 1
                    end if
                end try
                set tIdx to tIdx - 1
            end repeat
        end repeat
    end tell
    return closedCount
    '''
    try:
        out = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True, text=True, timeout=10,
        )
        if out.returncode != 0:
            return 0, (out.stderr or "osascript error").strip()
        try:
            return int((out.stdout or "0").strip()), ""
        except ValueError:
            return 0, "parse error"
    except Exception as e:
        return 0, str(e)


def _resolve_user_id(kwargs):
    try:
        from api.services.session_store import get_session
        session_id = kwargs.get("session_id")
        session = get_session(session_id) if session_id else None
        return session.user_id if session else _DEFAULT_USER
    except Exception:
        return _DEFAULT_USER


def open_url_in_user_browser(args, **kwargs):
    """Ask the user's browser to open a URL in a new tab."""
    url = (args.get("url") or "").strip()
    title = (args.get("title") or "").strip()
    if not url:
        return tool_error("Missing url")
    if not (url.startswith("http://") or url.startswith("https://")):
        return tool_error("url must start with http:// or https://")

    try:
        from api.services.media_queue import push
        item = push(_resolve_user_id(kwargs), url, title=title, kind="url")
        return tool_result(
            f"Đã gửi tới trình duyệt user (sẽ mở tab mới): {item['title']}\n{url}"
        )
    except Exception as e:
        return tool_error(f"open_url failed: {e}")


def close_user_tab(args, **kwargs):
    """Close tabs in the user's browser: tries Chrome via AppleScript first
    (works for any tab), then asks the frontend to close popups it opened.
    """
    url = (args.get("url") or "").strip()
    target = "all" if not url else url

    notes = []

    if url:
        sys_count, sys_err = _system_close_chrome_tabs(url)
        if sys_count:
            notes.append(f"Đã đóng {sys_count} tab Chrome khớp '{url}'.")
        elif sys_err and sys_err != "not macOS":
            notes.append(f"Chrome osascript: {sys_err}.")

    try:
        from api.services.media_queue import push
        item = push(_resolve_user_id(kwargs), target, title=target, kind="close")
        if target == "all":
            notes.append("Đã yêu cầu frontend đóng mọi tab agent đã mở.")
        else:
            notes.append(f"Đã yêu cầu frontend đóng tab '{url}' (nếu là tab agent mở).")
    except Exception as e:
        notes.append(f"Frontend push lỗi: {e}")

    return tool_result("\n".join(notes) if notes else "Không có gì để đóng.")


registry.register(
    name="open_url",
    toolset="browser",
    schema={
        "name": "open_url",
        "description": (
            "Mở một URL trong trình duyệt thật của user (tab mới). Dùng khi user "
            "muốn XEM trực tiếp (YouTube, trang web, video, tài liệu...). Frontend "
            "sẽ tự window.open tab mới. Để đóng tab sau, dùng close_tab. "
            "Không dùng cho việc agent tự crawl/đọc trang — dùng web_fetch / browser cho việc đó."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL đầy đủ bắt đầu bằng http(s)://"},
                "title": {"type": "string", "description": "Nhãn ngắn hiển thị cho user (vd. tên video)"},
            },
            "required": ["url"],
        },
    },
    handler=open_url_in_user_browser,
    description="Mở URL trong trình duyệt của user (tab mới) — dùng cho YouTube, video, trang web user muốn xem.",
    emoji="🔗",
)

registry.register(
    name="close_tab",
    toolset="browser",
    schema={
        "name": "close_tab",
        "description": (
            "Đóng tab trong trình duyệt user. Trên macOS, dùng AppleScript để "
            "đóng MỌI tab Google Chrome khớp URL/domain (kể cả tab user tự "
            "mở tay). Đồng thời gửi tín hiệu frontend đóng các tab popup do "
            "open_url mở. Truyền URL đầy đủ, domain (vd. 'facebook.com', "
            "'youtube.com'), hoặc bỏ trống / 'all' để đóng tất cả tab agent "
            "đã mở. Cần quyền tự động hoá Chrome trên máy."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL đầy đủ, domain (facebook.com), hoặc bỏ trống/'all' để đóng hết"},
            },
        },
    },
    handler=close_user_tab,
    description="Đóng tab user (do open_url mở). Truyền URL hoặc bỏ trống để đóng tất cả.",
    emoji="❎",
)
