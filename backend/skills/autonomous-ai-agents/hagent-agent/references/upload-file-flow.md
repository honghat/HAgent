# Upload File Flow in HAgent Chat

How file upload works in the HAgent local fork (Chat.jsx + backend messages.py).

## Flow

1. User selects file via `<input type="file">` or drag-and-drop
2. `handleFileImport()` in Chat.jsx is called
3. If file is an image → converted to data URL and added to `pastedImages` preview array
4. For all other files:
   - **Step 1**: POST to `/api/sessions/{id}/process-file` with FormData (file + provider)
   - **Step 2a**: If `process-file` succeeds (returns `skipped: false`) → messages are injected into session automatically, call `refreshSessionState()`
   - **Step 2b**: If `process-file` fails or returns `skipped: true` → fallback to POST to `/api/sessions/{id}/upload` to save raw file to disk, then POST to `/api/sessions/{id}/messages/raw` to inject user + assistant messages
5. On any error → `showToast(err.message, 'error')` displays error toast
6. On upload success → `showToast('Đã lưu file "...", 'ok')` displays green toast

## Backend Endpoints

### `POST /api/sessions/{session_id}/upload`
- Parses multipart form, extracts file bytes
- Saves to `backend/data/uploads/{session_id}/{filename}`
- Returns `{name, path, size, type}`

### `POST /api/sessions/{session_id}/messages/raw`
- Payload: `{content, provider?, assistant?}`
- Adds a user message + optional assistant message directly to session
- No streaming, no agent trigger — purely for inserting notification messages
- Returns `{status: "ok"}`

## Toast Implementation

- State: `const [toast, setToast] = useState(null)`
- Helper: `showToast(message, type='error')` — sets toast, auto-clear after 5s
- Rendered as fixed overlay at `right-3 top-16`, green for ok, red for error
- Single toast at a time (replaces previous)

## Key Files

- Frontend: `frontend/src/components/Chat.jsx` — `handleFileImport`, toast state, toast JSX
- Backend: `backend/api/routers/messages.py` — `upload_session_file()`, `add_raw_messages()`
- Schema: `backend/api/schemas.py` — `RawMessageRequest`

## Pitfalls

- `process-file` already handles DOCX/PDF via `_decode_text_file` → decode succeeds. The `/upload` fallback only triggers for truly unsupported files (binaries, images, etc.)
- `/upload` saves raw bytes to disk but does NOT inject messages into session. You must call `/messages/raw` or show the file reference elsewhere
- The `catch {}` must always be non-silent — either `showToast()` or at minimum `console.warn()`
- **⚠️ FormData is consumed after one `fetch()`** — never reuse the same FormData object for a retry/follow-up API call. The second `fetch()` with the same FormData sends an empty body, causing the upload to silently fail. Always create a fresh FormData (`new FormData()`) for each request.
- **`messages/raw` call failures must throw, not `console.warn`** — a swallowed `console.warn` on `msgRes.ok === false` means the toast shows success (green) but messages never enter the session. If the user sees a toast but no content in the chat, the `messages/raw` call likely failed silently. Always `throw new Error(...)` with the server status code.
