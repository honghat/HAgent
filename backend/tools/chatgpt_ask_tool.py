"""Tool: ask ChatGPT (logged-in in Chrome) and wait for the answer.

Drives the user's Chrome via AppleScript `execute javascript`. Requires
Chrome > View > Developer > Allow JavaScript from Apple Events.
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
                if u contains "chatgpt.com" or u contains "chat.openai.com" then
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
            make new tab with properties {URL:"https://chatgpt.com/"}
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


def _osa(script: str, timeout: int = 15) -> tuple[bool, str]:
    try:
        r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=timeout)
        if r.returncode != 0:
            return False, (r.stderr or "osascript error").strip()
        return True, (r.stdout or "").rstrip("\n")
    except Exception as e:
        return False, str(e)


def _exec_js(win_id: str, tab_idx: str, js: str, timeout: int = 15) -> tuple[bool, str]:
    js_escaped = js.replace("\\", "\\\\").replace('"', '\\"')
    script = (
        'tell application "Google Chrome"\n'
        f'    set winRef to first window whose id is {win_id}\n'
        f'    set tabRef to tab {tab_idx} of winRef\n'
        f'    return execute tabRef javascript "{js_escaped}"\n'
        'end tell'
    )
    return _osa(script, timeout=timeout)


_UPLOAD_FILE_JS = r"""
(function(fp){
  try {
    // Tìm nút Attach files / clip / + trong ChatGPT UI
    var attachBtn = document.querySelector('button[aria-label="Attach files"]')
                 || document.querySelector('button[aria-label*="attach" i]')
                 || document.querySelector('button[data-testid="file-upload"]')
                 || document.querySelector('button[class*="attach"]')
                 || document.querySelector('svg[class*="paperclip"]')
                 || document.querySelector('div[data-state*="file-upload"]');
    if (!attachBtn) return JSON.stringify({ok:false, reason:'no_attach_button'});
    attachBtn.click();
    // Signal macOS System Events to handle the Open dialog
    return JSON.stringify({ok:true, action:'open_dialog'});
  } catch(e) {
    return JSON.stringify({ok:false, reason: String(e)});
  }
})(__FILE_PATH__)
"""

_UPLOAD_WAIT_JS = r"""
(function(){
  try {
    // Check if any file attachment indicator appears in the UI
    var fileIndicators = document.querySelectorAll('[data-testid*="file"]');
    // Also check if the send button is now available (means file attached)
    var sendBtn = document.querySelector('button[data-testid="send-button"]');
    // Count inline file previews
    var previews = document.querySelectorAll('[class*="file-preview"], [class*="attachment"], img[alt*="attachment"]');
    return JSON.stringify({fileCount: previews.length, sendEnabled: sendBtn && !sendBtn.disabled});
  } catch(e) {
    return JSON.stringify({error: String(e)});
  }
})()
"""

_SUBMIT_JS = r"""
(function(q){
  try {
    var input = document.querySelector('#prompt-textarea')
             || document.querySelector('textarea[data-id="prompt-textarea"]')
             || document.querySelector('div[contenteditable="true"][data-virtualkeyboard="true"]')
             || document.querySelector('main form textarea')
             || document.querySelector('main form div[contenteditable="true"]')
             || document.querySelector('div[contenteditable="true"]');
    if (!input) return JSON.stringify({ok:false, reason:'no_input'});
    input.focus();
    if (input.tagName === 'TEXTAREA') {
      var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, q);
      input.dispatchEvent(new Event('input', {bubbles:true}));
    } else {
      input.innerHTML = '';
      try { document.execCommand('insertText', false, q); }
      catch(e) {
        input.textContent = q;
        input.dispatchEvent(new InputEvent('input', {bubbles:true, data:q, inputType:'insertText'}));
      }
    }
    var assistantBefore = document.querySelectorAll('[data-message-author-role="assistant"]').length;
    window.__hagentChatGPTBefore = assistantBefore;
    setTimeout(function(){
      var btn = document.querySelector('button[data-testid="send-button"]')
             || document.querySelector('form button[type="submit"]')
             || document.querySelector('button[aria-label*="Send"]')
             || document.querySelector('button[aria-label*="Gửi"]');
      if (btn && !btn.disabled) {
        btn.click();
      } else {
        var ev = new KeyboardEvent('keydown', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true});
        input.dispatchEvent(ev);
      }
    }, 250);
    return JSON.stringify({ok:true, before: assistantBefore});
  } catch(e) {
    return JSON.stringify({ok:false, reason: String(e)});
  }
})(__QUESTION__)
"""


_POLL_JS = r"""
(function(){
  try {
    var msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
    var before = window.__hagentChatGPTBefore || 0;
    var stop = document.querySelector('button[data-testid="stop-button"]')
            || document.querySelector('button[aria-label*="Stop"]')
            || document.querySelector('button[aria-label*="Dừng"]');
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


def ask_chatgpt(args, **kwargs):
    """Ask the logged-in ChatGPT in Chrome and wait for the answer."""
    question = (args.get("question") or "").strip()
    timeout = int(args.get("timeout") or 90)
    file_path = (args.get("file_path") or "").strip()
    if not question:
        return tool_error("Missing question")
    if platform.system() != "Darwin":
        return tool_error("Only macOS supported (uses AppleScript)")

    ok, out = _osa(_FIND_OR_OPEN_AS, timeout=20)
    if not ok or out.count("|") < 3:
        return tool_error(f"Không tìm/mở được tab ChatGPT: {out}")
    parts = out.split("|")
    win_id = parts[0].strip()
    tab_idx = parts[1].strip()
    origin_win = parts[2].strip()
    origin_idx = parts[3].strip() or "0"

    deadline = time.time() + 10
    while time.time() < deadline:
        ok, ready = _exec_js(win_id, tab_idx, "document.readyState")
        if ok and "complete" in ready:
            break
        time.sleep(0.5)

    # Upload file if file_path provided
    if file_path:
        import os
        if not os.path.isfile(file_path):
            return tool_error(f"File not found: {file_path}")

        # Click attach button via JS
        fp_json = json.dumps(file_path)
        upload_js = _UPLOAD_FILE_JS.replace("__FILE_PATH__", fp_json)
        ok, out = _exec_js(win_id, tab_idx, upload_js, timeout=20)
        if not ok:
            return tool_error(f"Upload JS lỗi: {out}")
        try:
            upload = json.loads(out)
        except Exception:
            return tool_error(f"Không parse được upload result: {out[:200]}")
        if not upload.get("ok"):
            return tool_error(f"Không tìm được nút Attach: {upload.get('reason')}. Hãy mở chat ChatGPT trước.")

        # Wait for Open dialog then use System Events to type file path + Enter
        time.sleep(1.5)
        _osa(
            'tell application "System Events"\n'
            '   tell process "Google Chrome"\n'
            '       if exists sheet 1 of window 1 then\n'
            '           set value of text field 1 of sheet 1 of window 1 to "' + file_path.replace('"', '\\"') + '"\n'
            '           keystroke return\n'
            '       else if exists window "Open" then\n'
            '           set value of text field 1 of window "Open" to "' + file_path.replace('"', '\\"') + '"\n'
            '           keystroke return\n'
            '       else\n'
            '           keystroke "G"\n'
            '           delay 1\n'
            '           tell process "Finder"\n'
            '               set frontmost to true\n'
            '               keystroke "g" using {command down, shift down}\n'
            '               delay 0.5\n'
            '               set value of text field 1 of sheet 1 of window 1 to "' + file_path.replace('"', '\\"') + '"\n'
            '               keystroke return\n'
            '               delay 0.5\n'
            '               keystroke return\n'
            '           end tell\n'
            '       end if\n'
            '   end tell\n'
            'end tell',
            timeout=15
        )

        # Wait for upload to complete
        upload_deadline = time.time() + 30
        while time.time() < upload_deadline:
            time.sleep(2)
            ok, out = _exec_js(win_id, tab_idx, _UPLOAD_WAIT_JS, timeout=10)
            if ok:
                try:
                    status = json.loads(out)
                    if status.get("fileCount", 0) > 0 or status.get("sendEnabled"):
                        break
                except Exception:
                    pass

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
        return tool_error(f"Không gửi được câu hỏi: {sub.get('reason')}. Đảm bảo đã đăng nhập và tab ChatGPT đang sẵn sàng.")

    def restore_origin():
        try:
            subprocess.run(
                ["osascript", "-e", _RESTORE_AS, origin_win or "0", origin_idx or "0"],
                capture_output=True, text=True, timeout=8,
            )
        except Exception:
            pass

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
    return tool_error(f"Timeout {timeout}s — không nhận được câu trả lời từ ChatGPT.")


registry.register(
    name="ask_chatgpt",
    toolset="browser",
    schema={
        "name": "ask_chatgpt",
        "description": (
            "Hỏi ChatGPT (đã đăng nhập sẵn trong Chrome của user) và chờ lấy "
            "câu trả lời. Dùng AppleScript điều khiển Chrome — yêu cầu Chrome "
            "đã bật 'Allow JavaScript from Apple Events' (View > Developer). "
            "Có thể upload file .docx/.pdf/.txt bằng tham số file_path trước khi hỏi. "
            "Trả về nội dung câu trả lời từ ChatGPT. Dùng khi user muốn dùng "
            "subscription ChatGPT đã trả tiền thay vì gọi API."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "Câu hỏi đầy đủ để gửi cho ChatGPT"},
                "timeout": {"type": "integer", "description": "Giây tối đa chờ trả lời (mặc định 90)"},
                "file_path": {"type": "string", "description": "Đường dẫn file .docx/.pdf/.txt để upload lên ChatGPT trước khi gửi câu hỏi (optional)"},
            },
            "required": ["question"],
        },
    },
    handler=ask_chatgpt,
    description="Hỏi ChatGPT logged-in trong Chrome, chờ và lấy câu trả lời.",
    emoji="💬",
)
