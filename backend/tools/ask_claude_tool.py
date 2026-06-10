"""Tool: ask Claude.ai (logged-in in Chrome) and wait for the answer.

Same approach as ask_chatgpt — drives Chrome via AppleScript `execute javascript`.
"""

import json
import platform
import subprocess
import time

from tools.registry import registry, tool_result, tool_error


_FIND_OR_OPEN_AS = r'''
tell application "Google Chrome"
    set originWin to ""
    set originIdx to 0
    try
        set originWin to (id of front window as string)
        set originIdx to (active tab index of front window)
    end try
    set foundWin to missing value
    set foundIdx to 0
    repeat with w in windows
        set tIdx to 1
        repeat while tIdx <= (count of tabs of w)
            try
                set u to URL of tab tIdx of w
                if u contains "claude.ai" then
                    set foundWin to w
                    set foundIdx to tIdx
                    exit repeat
                end if
            end try
            set tIdx to tIdx + 1
        end repeat
        if foundWin is not missing value then exit repeat
    end repeat
    if foundWin is missing value then
        if (count of windows) = 0 then make new window
        tell front window
            make new tab with properties {URL:"https://claude.ai/new"}
            set foundIdx to (count of tabs)
        end tell
        set foundWin to front window
    end if
    activate
    set index of foundWin to 1
    set active tab index of foundWin to foundIdx
    return (id of foundWin as string) & "|" & (foundIdx as string) & "|" & originWin & "|" & (originIdx as string)
end tell
'''


_RESTORE_AS = r'''
on run argv
    set originWin to ""
    set originIdx to 0
    try
        set originWin to item 1 of argv
        set originIdx to (item 2 of argv) as integer
    end try
    tell application "Google Chrome"
        set restored to false
        repeat with w in windows
            set tIdx to 1
            repeat while tIdx <= (count of tabs of w)
                try
                    set u to URL of tab tIdx of w
                    if u contains "localhost:3004" or u contains "127.0.0.1:3004" then
                        set index of w to 1
                        set active tab index of w to tIdx
                        set restored to true
                        exit repeat
                    end if
                end try
                set tIdx to tIdx + 1
            end repeat
            if restored then exit repeat
        end repeat
        if not restored and originWin is not "" and originIdx > 0 then
            try
                set w to first window whose id is (originWin as integer)
                set index of w to 1
                set active tab index of w to originIdx
                set restored to true
            end try
        end if
        activate
        return restored
    end tell
end run
'''


def _osa(script, timeout=15, args=None):
    try:
        cmd = ["osascript", "-e", script]
        if args:
            cmd.extend(args)
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if r.returncode != 0:
            return False, (r.stderr or "osascript error").strip()
        return True, (r.stdout or "").rstrip("\n")
    except Exception as e:
        return False, str(e)


def _exec_js(win_id, tab_idx, js, timeout=15):
    js_escaped = js.replace("\\", "\\\\").replace('"', '\\"')
    script = (
        'tell application "Google Chrome"\n'
        f'    set winRef to first window whose id is {win_id}\n'
        f'    set tabRef to tab {tab_idx} of winRef\n'
        f'    return execute tabRef javascript "{js_escaped}"\n'
        'end tell'
    )
    return _osa(script, timeout=timeout)


_SUBMIT_JS = r"""
(function(q){
  try {
    var input = document.querySelector('div[contenteditable="true"].ProseMirror')
             || document.querySelector('fieldset div[contenteditable="true"]')
             || document.querySelector('main div[contenteditable="true"]')
             || document.querySelector('div[contenteditable="true"]');
    if (!input) return JSON.stringify({ok:false, reason:'no_input'});
    input.focus();
    try {
      input.innerHTML = '';
      document.execCommand('insertText', false, q);
    } catch(e) {
      input.textContent = q;
      input.dispatchEvent(new InputEvent('input', {bubbles:true, data:q, inputType:'insertText'}));
    }
    var msgsBefore = document.querySelectorAll('div.font-claude-message, [data-is-streaming]').length;
    if (!msgsBefore) {
      var all = document.querySelectorAll('main [class*="message"]');
      msgsBefore = all.length;
    }
    window.__hagentClaudeBefore = msgsBefore;
    setTimeout(function(){
      var btn = document.querySelector('button[aria-label="Send Message"]')
             || document.querySelector('button[aria-label*="Send"]')
             || document.querySelector('fieldset button[type="submit"]')
             || document.querySelector('form button[type="submit"]');
      if (btn && !btn.disabled) {
        btn.click();
      } else {
        var ev = new KeyboardEvent('keydown', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true});
        input.dispatchEvent(ev);
      }
    }, 300);
    return JSON.stringify({ok:true, before: msgsBefore});
  } catch(e) {
    return JSON.stringify({ok:false, reason: String(e)});
  }
})(__QUESTION__)
"""


_POLL_JS = r"""
(function(){
  try {
    var before = window.__hagentClaudeBefore || 0;
    var msgs = document.querySelectorAll('div.font-claude-message');
    if (!msgs.length) msgs = document.querySelectorAll('[data-is-streaming]');
    if (!msgs.length) msgs = document.querySelectorAll('main [class*="message"]');
    var stop = document.querySelector('button[aria-label*="Stop"]')
            || document.querySelector('button[aria-label*="stop"]')
            || document.querySelector('button[data-state="closed"][aria-label*="Stop"]');
    var streaming = !!stop;
    if (msgs.length <= before) {
      return JSON.stringify({state: streaming ? 'streaming' : 'waiting'});
    }
    var last = msgs[msgs.length - 1];
    var text = (last.innerText || last.textContent || '').trim();
    return JSON.stringify({state: streaming ? 'streaming' : 'done', text: text});
  } catch(e) {
    return JSON.stringify({state:'error', reason: String(e)});
  }
})()
"""


def ask_claude(args, **kwargs):
    """Ask the logged-in Claude.ai in Chrome and wait for the answer."""
    question = (args.get("question") or "").strip()
    timeout = int(args.get("timeout") or 120)
    if not question:
        return tool_error("Missing question")
    if platform.system() != "Darwin":
        return tool_error("Only macOS supported (uses AppleScript)")

    ok, out = _osa(_FIND_OR_OPEN_AS, timeout=20)
    if not ok or out.count("|") < 3:
        return tool_error(f"Không tìm/mở được tab Claude: {out}")
    parts = out.split("|")
    win_id = parts[0].strip()
    tab_idx = parts[1].strip()
    origin_win = parts[2].strip() or "0"
    origin_idx = parts[3].strip() or "0"

    deadline = time.time() + 12
    while time.time() < deadline:
        ok, ready = _exec_js(win_id, tab_idx, "document.readyState")
        if ok and "complete" in ready:
            break
        time.sleep(0.5)

    q_json = json.dumps(question)
    submit_js = _SUBMIT_JS.replace("__QUESTION__", q_json)
    ok, out = _exec_js(win_id, tab_idx, submit_js, timeout=20)
    if not ok:
        return tool_error(f"Submit JS lỗi: {out}")
    try:
        sub = json.loads(out)
    except Exception:
        return tool_error(f"Không parse được submit result: {out[:200]}")
    if not sub.get("ok"):
        return tool_error(f"Không gửi được câu hỏi: {sub.get('reason')}. Đảm bảo đã đăng nhập claude.ai.")

    def restore_origin():
        _osa(_RESTORE_AS, timeout=8, args=[origin_win, origin_idx])

    deadline = time.time() + timeout
    last_text = ""
    stable_done_seen = 0
    while time.time() < deadline:
        time.sleep(2)
        ok, out = _exec_js(win_id, tab_idx, _POLL_JS, timeout=10)
        if not ok:
            continue
        try:
            d = json.loads(out)
        except Exception:
            continue
        state = d.get("state")
        if state == "done":
            text = (d.get("text") or "").strip()
            if text and text == last_text:
                stable_done_seen += 1
                if stable_done_seen >= 2:
                    restore_origin()
                    return tool_result(text)
            else:
                last_text = text
                stable_done_seen = 1
        elif state in ("streaming", "waiting"):
            stable_done_seen = 0
        else:
            continue

    restore_origin()
    if last_text:
        return tool_result(last_text + "\n\n[Đã hết timeout, trả về câu trả lời hiện tại]")
    return tool_error(f"Timeout {timeout}s — không nhận được câu trả lời từ Claude.")


registry.register(
    name="ask_claude",
    toolset="browser",
    schema={
        "name": "ask_claude",
        "description": (
            "Hỏi Claude.ai (đã đăng nhập sẵn trong Chrome của user) và chờ "
            "lấy câu trả lời. Dùng AppleScript điều khiển Chrome — yêu cầu "
            "Chrome đã bật 'Allow JavaScript from Apple Events'. Tự quay về "
            "tab HAgent (localhost:3004) sau khi xong. Trả về nội dung câu "
            "trả lời từ Claude. Dùng khi user muốn dùng subscription Claude "
            "đã trả tiền thay vì gọi API."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "Câu hỏi đầy đủ để gửi cho Claude"},
                "timeout": {"type": "integer", "description": "Giây tối đa chờ trả lời (mặc định 120)"},
            },
            "required": ["question"],
        },
    },
    handler=ask_claude,
    description="Hỏi Claude.ai logged-in trong Chrome, chờ và lấy câu trả lời.",
    emoji="🟠",
)
