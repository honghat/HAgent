# Browser Automation Tool: Adding File Upload via `execute javascript` + System Events

## Problem

Adding file upload capability to a Chrome-automation tool (like `ask_chatgpt`) that uses AppleScript `execute javascript`. The native browser `execute javascript` API from `osascript` does not directly support file input manipulation — React SPA apps like ChatGPT don't expose a hidden `<input type="file">` in the DOM at page load.

## Architecture

Three-stage approach:

1. **Click attach button** via JavaScript injected into the Chrome tab
2. **Handle macOS Open dialog** via `System Events` to paste the file path
3. **Poll for upload completion** via JavaScript before submitting the main question

## Code Pattern

### Stage 1: Click Attach via JS

```python
_UPLOAD_FILE_JS = r"""
(function(fp){
  try {
    var attachBtn = document.querySelector('button[aria-label="Attach files"]')
                 || document.querySelector('button[aria-label*="attach" i]')
                 || document.querySelector('button[data-testid="file-upload"]')
                 || document.querySelector('button[class*="attach"]')
                 || document.querySelector('svg[class*="paperclip"]');
    if (!attachBtn) return JSON.stringify({ok:false, reason:'no_attach_button'});
    attachBtn.click();
    return JSON.stringify({ok:true, action:'open_dialog'});
  } catch(e) {
    return JSON.stringify({ok:false, reason: String(e)});
  }
})(__FILE_PATH__)
"""
```

### Stage 2: System Events — Type File Path into Open Dialog

```python
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
```

The 3-tier fallback:
- **Tier 1 (sheet)**: Modern macOS file dialogs are sheets attached to the window
- **Tier 2 (window "Open")**: Standalone file picker window
- **Tier 3 (Finder + Go-to-folder)**: Fallback when neither sheet nor Open window is detected — uses Cmd+Shift+G to open the Go-to-folder dialog

### Stage 3: Poll for Upload Completion

```python
_UPLOAD_WAIT_JS = r"""
(function(){
  try {
    var sendBtn = document.querySelector('button[data-testid="send-button"]');
    var previews = document.querySelectorAll('[class*="file-preview"], [class*="attachment"]');
    return JSON.stringify({fileCount: previews.length, sendEnabled: sendBtn && !sendBtn.disabled});
  } catch(e) {
    return JSON.stringify({error: String(e)});
  }
})()
"""
```

## Integration into Tool Pattern

```python
def ask_chatgpt(args, **kwargs):
    question = (args.get("question") or "").strip()
    file_path = (args.get("file_path") or "").strip()
    # ... find/open ChatGPT tab ...

    if file_path:
        import os
        if not os.path.isfile(file_path):
            return tool_error(f"File not found: {file_path}")

        # Stage 1: Click attach
        fp_json = json.dumps(file_path)
        upload_js = _UPLOAD_FILE_JS.replace("__FILE_PATH__", fp_json)
        ok, out = _exec_js(win_id, tab_idx, upload_js, timeout=20)
        # ... parse result ...

        # Stage 2: System Events handle dialog
        time.sleep(1.5)
        _osa(...)

        # Stage 3: Poll until upload completes
        upload_deadline = time.time() + 30
        while time.time() < upload_deadline:
            time.sleep(2)
            ok, out = _exec_js(win_id, tab_idx, _UPLOAD_WAIT_JS, timeout=10)
            # ... check for fileCount > 0 or sendEnabled ...

    # Proceed with original submit logic...
```

## Schema Update

Add `file_path` as an optional property in the tool's registration schema:

```python
"properties": {
    "question": {"type": "string", ...},
    "timeout": {"type": "integer", ...},
    "file_path": {"type": "string", "description": "Đường dẫn file để upload (optional)"},
},
```

## Pitfalls

- **Selector fragility**: ChatGPT's UI changes frequently — the attach button selector may break. Maintain a fallback chain of selectors.
- **Dialog timing**: System Events needs a reliable delay (`time.sleep(1.5)`) after the JS click before the dialog window appears.
- **File path escaping**: Quotes and backslashes in file paths must be escaped for both AppleScript and JavaScript.
- **Upload progress**: ChatGPT can take up to 30s for large files; the poll loop must be generous.
- **No logged-in session**: If ChatGPT requires log in every time, the tool cannot upload without user manually authenticating first.
- **macOS-only**: This approach depends on AppleScript + System Events — cannot work on Linux/Windows without different native automation (e.g., AutoIt on Windows).
