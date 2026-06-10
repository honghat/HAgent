# Bilibili Download — macOS Cookie Fix

## Error
```
ERROR: [BiliBili] BV1aS411F7Q2: No video formats found!;
please report this issue on https://github.com/yt-dlp/yt-dlp/issues?q= ,
filling out the appropriate issue template.
```

## Root Cause: macOS Chrome Cookie Encryption

yt-dlp's Python API `cookies_from_browser` option **can't decrypt Chrome cookies** on macOS because Chrome stores cookie values encrypted with macOS Keychain (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`). The yt-dlp Python API uses `browser_cookie3` or similar which reads raw SQLite but can't decrypt macOS Keychain values.

**CLI `--cookies-from-browser chrome` works** because it calls a native macOS binary that uses the Keychain directly.

## Reproduction

```bash
# Fails via Python API even with cookies_from_browser
python3 << 'EOF'
import yt_dlp
ydl = yt_dlp.YoutubeDL({"cookies_from_browser": "chrome"})
ydl.extract_info("https://www.bilibili.com/video/BV1aS411F7Q2", download=False)
EOF

# Succeeds via CLI
yt-dlp --cookies-from-browser chrome \
  "https://www.bilibili.com/video/BV1aS411F7Q2" \
  --print title
```

## The Fix (video_pipeline.py `_download_video`)

When the initial `ydl.download()` raises `"No video formats found"` (or any auth-related error like `"Sign in"`, `"age"`, `"private"`, `"members"`), fall back to **subprocess yt-dlp CLI** with `--cookies-from-browser chrome`:

```python
except Exception as e1:
    err_msg = str(e1)
    if not any(kw in err_msg for kw in (
        "Sign in", "age", "private", "members", "No video formats found"
    )):
        raise
    import subprocess
    clean_url = url.split("?")[0]  # strip tracking params
    result = subprocess.run(
        ["yt-dlp", "--cookies-from-browser", "chrome",
         "--format", "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b/best",
         "-o", f"{base}.%(id)s.%(ext)s",
         "--no-warnings", "--retries", "5", "--no-check-certificates",
         clean_url],
        capture_output=True, text=True, timeout=300,
    )
    if result.returncode != 0:
        raise Exception(result.stderr.strip() or result.stdout.strip())
```

## Key Details

- `--cookies-from-browser chrome` exports decrypted cookies to a temp file behind the scenes — no cleanup needed
- Strip `?spm_id_from=...` tracking params from URL before passing to CLI to avoid parsing issues
- Using subprocess entirely (not Python API + cookies file) is essential — even writing decrypted cookies to file then passing to Python API fails for unknown reasons (possibly HTTP header injection protection)
- Only for Bilibili (and possibly other Chinese platforms) — YouTube generally doesn't need cookies for public videos

## Verification

```bash
# Direct test of _download_video
cd /Users/nguyenhat/HAgent/backend
python3 -c "
from api.services.video_pipeline import _download_video
def send(msg): print(f'[STATUS] {msg}')
_download_video('https://www.bilibili.com/video/BV1aS411F7Q2',
                '/tmp/test.mp4', send)
print('OK')
"
```

Expected output (2 download bars, no error):
```
ERROR: [BiliBili] BV...: No video formats found!
[STATUS] Thử lại với cookie Chrome (yt-dlp CLI decrypt)...
[download] ... 100% (video)
[download] ... 100% (audio)
OK
```

## Why simply adding `--cookies` to Python API also failed

The naive approach was to extract cookies from Chrome's SQLite DB manually and pass via `--cookies`:

```python
# DOES NOT WORK — cookie values are encrypted in Chrome DB
```

Chrome v127+ encrypts cookie values with AES-GCM using a macOS Keychain-derived key. Raw SQLite read gives garbage bytes. Only Chrome's own process or `--cookies-from-browser` (which calls Chrome's native keychain helper) can decrypt them.

## Related

- `video-dubbing` SKILL.md: Pitfall section "Bilibili — No video formats found" has the full picture
- yt-dlp issue: `--cookies-from-browser` CLI works where Python API `cookies_from_browser` fails on macOS
- Applies to any site that requires login cookies AND uses macOS Chrome (e.g. NicoNico, some age-restricted YouTube)
