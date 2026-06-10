"""Shared machinery for 'ask <LLM>' tools that drive logged-in tabs via AppleScript.

Each tool only declares its config (URL pattern, selectors). The
plumbing — Chrome tab lookup, JS injection, polling, tab restore — lives here.
"""

import json
import platform
import subprocess
import time
from dataclasses import dataclass, field
from typing import List


@dataclass
class LLMConfig:
    name: str                   # tool name, e.g. "ask_gemini"
    url_match: List[str]        # substrings to look for in tab URLs
    open_url: str               # URL to open if no matching tab found
    input_selectors: List[str]  # CSS selectors for the prompt input (tried in order)
    send_selectors: List[str]   # CSS selectors for the send button (tried in order)
    msg_selectors: List[str]    # CSS selectors for assistant messages (tried in order)
    stop_selectors: List[str]   # CSS selectors for the "stop generating" button
    timeout: int = 120
    description: str = ""
    emoji: str = "🤖"
    # Regex patterns (case-insensitive) that mean "the response is still being
    # generated even though no stop button is visible". Useful for sites like
    # Grok DeepSearch where intermediate widgets ("40 sources", "Thinking...")
    # appear before the real answer.
    in_progress_patterns: List[str] = field(default_factory=list)
    # Minimum chars before the response is considered "done". 0 = no minimum.
    min_text_length: int = 0
    # Number of consecutive stable polls (text unchanged) needed to return.
    # Default 2 (≈4s). Bump up for sites with long research phases.
    stable_polls_needed: int = 2
    # If True, submit by dispatching Enter on the input rather than clicking
    # a button. Useful for sites where the send button is hard to target or
    # where the button click handler doesn't fire on programmatic clicks
    # (e.g., DeepSeek).
    submit_via_enter: bool = False


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


def _build_find_or_open_as(url_match: List[str], open_url: str) -> str:
    conds = " or ".join([f'u contains "{m}"' for m in url_match])
    return f'''
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
                if {conds} then
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
            make new tab with properties {{URL:"{open_url}"}}
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


def _build_submit_js(cfg: LLMConfig) -> str:
    input_chain = " || ".join([f"document.querySelector({json.dumps(s)})" for s in cfg.input_selectors])
    send_chain = " || ".join([f"document.querySelector({json.dumps(s)})" for s in cfg.send_selectors])
    msg_selectors_json = json.dumps(cfg.msg_selectors or [])
    return r"""
(function(q){
  function isVisible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return false;
    var cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  }
  function pickBiggest(sel) {
    var nodes = Array.from(document.querySelectorAll(sel)).filter(isVisible);
    nodes.sort(function(a,b){
      var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return (rb.width*rb.height) - (ra.width*ra.height);
    });
    return nodes[0] || null;
  }
  function countMsgs() {
    // Match the poll JS logic: take the first selector that finds anything.
    // Summing across selectors would double-count when multiple selectors
    // match the same element, inflating the baseline so the new response is
    // never detected.
    var sels = __MSG_SELECTORS__;
    for (var i = 0; i < sels.length; i++) {
      var n = document.querySelectorAll(sels[i]).length;
      if (n > 0) return n;
    }
    return 0;
  }
  try {
    var input = __INPUT_CHAIN__;
    if (!input || !isVisible(input)) {
      var ta = pickBiggest('textarea:not([type="search"]):not([readonly])');
      var ce = pickBiggest('div[contenteditable="true"], p[contenteditable="true"]');
      input = ta && ce
        ? (ta.getBoundingClientRect().top > ce.getBoundingClientRect().top ? ta : ce)
        : (ta || ce);
    }
    if (!input) return JSON.stringify({ok:false, reason:'no_input'});
    input.focus();
    if (input.tagName === 'TEXTAREA') {
      var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, q);
      input.dispatchEvent(new Event('input', {bubbles:true}));
    } else {
      try {
        input.innerHTML = '';
        document.execCommand('insertText', false, q);
      } catch(e) {
        input.textContent = q;
        input.dispatchEvent(new InputEvent('input', {bubbles:true, data:q, inputType:'insertText'}));
      }
    }
    var msgsBefore = countMsgs();
    window.__hagentLLMBefore = msgsBefore;
    var savedInput = input;
    var preferEnter = __PREFER_ENTER__;
    setTimeout(function(){
      function pressEnter() {
        // Dispatch a full keydown→keypress→keyup sequence so that frameworks
        // listening for any of them fire their submit handler.
        var opts = {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true};
        savedInput.dispatchEvent(new KeyboardEvent('keydown', opts));
        savedInput.dispatchEvent(new KeyboardEvent('keypress', opts));
        savedInput.dispatchEvent(new KeyboardEvent('keyup', opts));
      }
      if (preferEnter) {
        pressEnter();
        return;
      }
      var btn = __SEND_CHAIN__;
      if (!btn || btn.disabled || btn.getAttribute('aria-disabled') === 'true') {
        var container = savedInput.closest('form, footer, [class*="input"], [class*="Input"]') || document.body;
        var candidates = Array.from(container.querySelectorAll('button, div[role="button"], [role="button"]'))
          .filter(function(b){
            if (b.disabled) return false;
            if (b.getAttribute('aria-disabled') === 'true') return false;
            var r = b.getBoundingClientRect();
            if (r.width < 16 || r.height < 16) return false;
            return !!b.querySelector('svg');
          });
        btn = candidates[candidates.length - 1] || candidates[0] || null;
      }
      if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
        btn.click();
      } else {
        pressEnter();
      }
    }, 300);
    return JSON.stringify({ok:true, before: msgsBefore, input_tag: input.tagName, input_id: input.id || ''});
  } catch(e) {
    return JSON.stringify({ok:false, reason: String(e)});
  }
})(__QUESTION__)
""".replace("__INPUT_CHAIN__", input_chain).replace("__SEND_CHAIN__", send_chain).replace("__MSG_SELECTORS__", msg_selectors_json).replace("__PREFER_ENTER__", "true" if cfg.submit_via_enter else "false")


def _build_poll_js(cfg: LLMConfig) -> str:
    msg_lookup = "\n    ".join([
        f"if (!msgs.length) msgs = document.querySelectorAll({json.dumps(s)});"
        for s in cfg.msg_selectors[1:]
    ])
    first_sel = json.dumps(cfg.msg_selectors[0]) if cfg.msg_selectors else '"main"'
    stop_chain = " || ".join([f"document.querySelector({json.dumps(s)})" for s in cfg.stop_selectors]) or "null"
    patterns_json = json.dumps(cfg.in_progress_patterns or [])
    min_len = int(cfg.min_text_length or 0)
    return r"""
(function(){
  try {
    var before = window.__hagentLLMBefore || 0;
    var msgs = document.querySelectorAll(__FIRST_SEL__);
    __MSG_LOOKUP__
    if (!msgs.length) {
      var pool = document.querySelectorAll(
        'main article, main [role="article"], '
        + 'main div.markdown, main div.prose, '
        + 'main div[class*="markdown"], main div[class*="response"]'
      );
      if (pool.length) msgs = pool;
    }
    var stop = __STOP_CHAIN__;
    var streaming = !!stop;
    if (msgs.length <= before) {
      return JSON.stringify({state: streaming ? 'streaming' : 'waiting'});
    }
    // Concatenate text from all NEW elements (those added after submit), not
    // just the last one. Some sites (DeepSeek, etc.) use one matched element
    // per content block (paragraph/heading/code) — taking only the last gives
    // a tiny fragment of a long answer.
    var newCount = msgs.length - before;
    var text = '';
    if (newCount === 1) {
      var only = msgs[msgs.length - 1];
      text = (only.innerText || only.textContent || '').trim();
    } else {
      var parts = [];
      for (var k = before; k < msgs.length; k++) {
        var t = (msgs[k].innerText || msgs[k].textContent || '').trim();
        if (t) parts.push(t);
      }
      text = parts.join('\n\n').trim();
    }
    var inProgressPatterns = __IN_PROGRESS_PATTERNS__;
    var minLen = __MIN_LEN__;
    var looksInProgress = false;
    for (var i = 0; i < inProgressPatterns.length; i++) {
      try {
        var re = new RegExp(inProgressPatterns[i], 'i');
        if (re.test(text)) { looksInProgress = true; break; }
      } catch(e) {}
    }
    if (minLen > 0 && text.length < minLen) looksInProgress = true;
    if (looksInProgress) {
      return JSON.stringify({state: 'streaming', text: text});
    }
    return JSON.stringify({state: streaming ? 'streaming' : 'done', text: text});
  } catch(e) {
    return JSON.stringify({state:'error', reason: String(e)});
  }
})()
""".replace("__FIRST_SEL__", first_sel).replace("__MSG_LOOKUP__", msg_lookup).replace("__STOP_CHAIN__", stop_chain).replace("__IN_PROGRESS_PATTERNS__", patterns_json).replace("__MIN_LEN__", str(min_len))


def make_handler(cfg: LLMConfig):
    """Build the tool handler closure for an LLM config."""
    from tools.registry import tool_result, tool_error

    find_or_open_as = _build_find_or_open_as(cfg.url_match, cfg.open_url)
    submit_js_template = _build_submit_js(cfg)
    poll_js = _build_poll_js(cfg)

    def handler(args, **kwargs):
        question = (args.get("question") or "").strip()
        timeout = int(args.get("timeout") or cfg.timeout)
        if not question:
            return tool_error("Missing question")
        if platform.system() != "Darwin":
            return tool_error("Only macOS supported (uses AppleScript)")

        ok, out = _osa(find_or_open_as, timeout=20)
        if not ok or out.count("|") < 3:
            return tool_error(f"Không tìm/mở được tab {cfg.name}: {out}")
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
        submit_js = submit_js_template.replace("__QUESTION__", q_json)
        ok, out = _exec_js(win_id, tab_idx, submit_js, timeout=20)
        if not ok:
            return tool_error(f"Submit JS lỗi: {out}")
        try:
            sub = json.loads(out)
        except Exception:
            return tool_error(f"Không parse được submit result: {out[:200]}")
        if not sub.get("ok"):
            return tool_error(
                f"Không gửi được câu hỏi: {sub.get('reason')}. "
                f"Đảm bảo đã đăng nhập và tab {cfg.name.replace('ask_', '')} sẵn sàng."
            )

        def restore_origin():
            _osa(_RESTORE_AS, timeout=8, args=[origin_win, origin_idx])

        deadline = time.time() + timeout
        last_text = ""
        stable_done_seen = 0
        seen_streaming = False
        # Poll fast so we can grab the answer as soon as it lands. The streaming
        # → done transition (stop button disappeared + text present) is the
        # canonical "AI just finished" signal — return immediately when we see
        # it. The stable-text fallback is only used for sites where the stop
        # button selector doesn't match and we never observe a streaming state.
        poll_interval = 0.8
        while time.time() < deadline:
            time.sleep(poll_interval)
            ok, out = _exec_js(win_id, tab_idx, poll_js, timeout=10)
            if not ok:
                continue
            try:
                d = json.loads(out)
            except Exception:
                continue
            state = d.get("state")
            text = (d.get("text") or "").strip()
            if state == "streaming":
                seen_streaming = True
                stable_done_seen = 0
                if text:
                    last_text = text
            elif state == "done":
                if seen_streaming and text:
                    restore_origin()
                    return tool_result(text)
                # Streaming never detected (selectors likely don't match the
                # stop button) — fall back to "text stops growing" heuristic.
                if text and text == last_text:
                    stable_done_seen += 1
                    if stable_done_seen >= cfg.stable_polls_needed:
                        restore_origin()
                        return tool_result(text)
                else:
                    last_text = text
                    stable_done_seen = 1
            elif state == "waiting":
                stable_done_seen = 0
            else:
                continue

        restore_origin()
        if last_text:
            return tool_result(last_text + "\n\n[Đã hết timeout, trả về câu trả lời hiện tại]")
        return tool_error(f"Timeout {timeout}s — không nhận được câu trả lời từ {cfg.name}.")

    return handler


def register_llm_tool(cfg: LLMConfig):
    """Register an LLM tool with the global registry using the given config."""
    from tools.registry import registry

    handler = make_handler(cfg)
    registry.register(
        name=cfg.name,
        toolset="browser",
        schema={
            "name": cfg.name,
            "description": cfg.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {"type": "string", "description": "Câu hỏi đầy đủ để gửi"},
                    "timeout": {"type": "integer", "description": f"Giây tối đa chờ trả lời (mặc định {cfg.timeout})"},
                },
                "required": ["question"],
            },
        },
        handler=handler,
        description=cfg.description.split(".")[0] if cfg.description else cfg.name,
        emoji=cfg.emoji,
    )
