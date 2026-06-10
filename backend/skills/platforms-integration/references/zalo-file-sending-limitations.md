# Zalo File-Sending Limitations (Omni Chat / zlapi)

## Core Limitation

**Zalo (via `zlapi`) does NOT support sending local document files (.xlsx, .docx, .pdf, etc.) from local disk.**

Available `zlapi` methods:
| Method | Support | Notes |
|--------|---------|-------|
| `sendLocalImage(imagePath, ...)` | ✅ Images only | PNG, JPG, GIF, WebP, BMP, AVIF |
| `sendRemoteFile(fileUrl, ...)` | ✅ Files via URL | **Needs public URL** — Zalo server downloads from URL |
| `sendLocalFile(...)` | ❌ **NOT available** | No such method exists in `zlapi` |

## How the Omni Chat pipeline fails

```
User uploads .xlsx → Frontend → /api/omni/upload (saves to local disk)
                → Backend returns local URL: /api/omni/files/{uid}/{filename}
                → zalo_send_bridge.py calls sendRemoteFile("http://localhost:8010/...")
                → Zalo server tries to fetch localhost → TIMEOUT/REFUSED ❌
```

Root cause: `sendRemoteFile` expects a **publicly accessible HTTP URL** that Zalo's server can download. The Omni Chat upload endpoint only stores files locally.

## Contrast: Images work

Images work because `sendLocalImage(path)` directly uploads the file bytes to Zalo's servers — no intermediate URL needed.

## Solutions (ordered by preference)

### 1. Proxy upload to public hosting
Upload file to a public temporary host (file.io, tmpfiles.org, or self-hosted with a public domain) then pass the public URL to `sendRemoteFile`.

```python
# In zalo_send_bridge.py — new action: send_file_public
import requests

def upload_to_tmp(filepath):
    with open(filepath, 'rb') as f:
        r = requests.post('https://tmpfiles.org/api/v1/upload', files={'file': f})
        return r.json()['data']['url']

# Then send via existing sendRemoteFile
result = bot.sendRemoteFile(public_url, thread_id, thread_type, ...)
```

### 2. Implement local file upload in zlapi style
Reverse-engineer `_uploadImage` and replicate the same multipart/form-data upload logic for document files. The Zalo API endpoint is `https://tt-files-wpa.chat.zalo.me/api/message/asyncfile/msg` — but requires the file bytes to be uploaded to Zalo's CDN first, then referenced in the message payload.

### 3. Browser automation (Playwright)
Use Playwright to interact with Zalo Web (chat.zalo.me) and upload files natively through the browser UI — works for ALL file types but is slower.

```python
# Pattern: clipboard_to_zalo.py approach
page.goto("https://chat.zalo.me")
# Attach file via input[type=file] or drag-drop
# Poll for upload completion
```

## Current code paths

| File | Action | Status |
|------|--------|--------|
| `api/routers/omni.py` (line 823-837) | `send-media` → `send_file` via file_url | ❌ Fails with localhost URL |
| `zalo_bridges/zalo_send_bridge.py` (line 113-122) | `send_file` → `bot.sendRemoteFile(url)` | ❌ Needs public URL |
| `OmniChat.jsx` (line 1020-1038) | Non-image URLs → `send-media` with `file_url` | ❌ Assumes URL is externally accessible |

## Frontend file flow (OmniChat.jsx ~line 978-1041)

1. User attaches files → `FormData` upload to `/api/omni/upload`
2. Backend saves to `backend/data/omni_uploads/{uid}/{uuid}.ext`
3. Returns `{urls: ["/api/omni/files/{uid}/{uuid}.ext"], paths: ["/absolute/path/..."]}`
4. Frontend classifies: image → `send-media` with `image_path`, non-image → `send-media` with `file_url`
5. For Zalo: backend calls `zalo_send_bridge.py` with the **relative/local URL** → **fails**

**Fix needed in `api/routers/omni.py`**: For Zalo `send_file`, the backend must either:
- a) Upload the file to a public URL first, OR
- b) Read the local file and upload bytes directly via Zalo's upload endpoint
