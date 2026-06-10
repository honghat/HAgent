---
name: frontend-api-connectivity
description: Debug and fix frontend-backend API connectivity issues. When a component shows blank results, loading spinners that never complete, or error state without returning data — the root cause is almost always a wrong endpoint URL, missing fields in the request body, or response parsing mismatch. Use this skill BEFORE diving into backend code changes.
license: Complete terms in LICENSE.txt
---

# 🔌 Frontend-Backend API Connectivity

> *Debug why a frontend component isn't returning data from the backend.*

## 🎯 When to Use

- Component shows loading forever but no data
- "No response" or blank state after API call
- Console shows 404, 400, or 500 on API calls
- Component uses `fetch()` or `axios` to a URL that seems made up
- User says "nó bị lỗi ko trả về kết quả"

## 🔍 Diagnostic Sequence (in order)

### 1. Find the API call in the component
Search the component file for `fetch(`, `axios.`, `await res.`, `POST`, `GET`.

### 2. List all known backend API routes
```
grep -rn "@router\.\(get\|post\|put\|delete\|patch\)" backend/api/routers/ | grep -oP '"[^"]+"' | sort -u
```

### 3. Compare — the most common bug
**The endpoint in the component doesn't match any backend route.** This happens when:
- A developer hardcodes a guess (e.g. `/api/chat`) instead of checking real routes
- The real endpoint is different (e.g. `/api/hagent-ai/chat/completions` instead of `/api/chat`)
- The request body format doesn't match the Pydantic model

### 4. Check working components for reference
Search for components that call similar API successfully:
```
grep -rn "/api/hagent-ai/chat/completions" frontend/src/ | head -5
```

### 5. Verify request body structure
Look at the backend route's Pydantic `BaseModel` — the request body fields must match exactly.

### 6. Response parsing
- OpenAI-compatible endpoints return `{ choices: [{ message: { content: "..." } }] }`
- Custom HAgent endpoints may return `{ response: "..." }` or `{ message: { content: "..." } }`
- **Always check the real response format** by reading the backend route's return statement

## ⚠️ Common Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Wrong endpoint URL | 404 in console, blank UI | Replace with real route from step 2 |
| Wrong response field | `.response` undefined but `.choices[0].message.content` is real | Match backend return format |
| Backend wraps response as `output` string (`{\"output\": \"...json...\"}`) | `data.image` or `data.xxx` is a JSON **string**, not an object — browser can't use it | Parse with `JSON.parse(data.output)` before accessing fields; common on FastAPI routes that `return JSONResponse(JSON.stringify(...))` instead of `return {...}` directly |
| Absolute file path in response | `<img src=\"/Users/.../cache/images/xxx.png\">` fails — browser can't load file:// paths from http:// origin | Extract filename via `path.split('/').pop()` and use a served URL like `/api/photo/file/{filename}` |
| Missing error handling | `res.json()` throws silently when API returns 500 | Add `if (!res.ok)` check before parse |
| Missing required fields | 422 validation error | Check Pydantic model requirements |
| **Missing Vite proxy rule (static files)** | Component loads data from API (200 OK) but images/static assets return 404. DevTools shows `GET /cache-images/xxx.png` 404 | ✅ Add proxy rule in `frontend/vite.config.js` — e.g. `'/cache-images': 'http://127.0.0.1:8010'`. The API endpoint works (proxied via `/api` catch-all) but static file paths like `/cache-images/`, `/uploads/`, `/audio_cache/` need explicit rules. After adding, rebuild with `pnpm build` and hard refresh. See `references/vite-static-proxy.md` for checklist |
| `provider` passed as combined `model` string | Backend uses default (lmstudio) instead of intended provider | Split into separate `provider` and `model` fields — the proxy expects two distinct parameters, not `<provider>/<model>` fusion |
| Provider name not registered | `Provider không khớp frontend` error | Use a name from `_PROVIDER_CONFIGS` in `backend/api/services/provider_config.py` (e.g. `pekpik`, `openrouter`) OR save it as a `custom_providers` DB record first |
| `stream: false` sent to non-stream endpoint | May still work but not needed | Remove stream field unless backend expects it |
| API requires auth header | 401 | Check if route needs `Authorization` or session cookie |

## ✅ Fix Template

```jsx
// BEFORE (broken pattern):
const res = await fetch('/api/wrong-endpoint', { ... })
const data = await res.json()
setResult(data.response)

// AFTER (fixed pattern):
const res = await fetch('/api/real-endpoint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [
      { role: 'system', content: '...' },
      { role: 'user', content: prompt },
    ],
  }),
})
if (!res.ok) {
  const err = await res.json().catch(() => ({}))
  setError(err.detail || `HTTP ${res.status}`)
  return
}
const data = await res.json()
// Check endpoint return format:
// OpenAI style → data.choices[0].message.content
// Custom style → look at backend route's return
setResult(data.choices?.[0]?.message?.content || 'No response')
```

## 🔬 Verification

After fixing, verify:
1. Restart frontend dev server or hard refresh browser (Cmd+Shift+R)
2. Open browser DevTools Network tab
3. Trigger the API call
4. Check: green 200 response ✅, no 404/4xx/5xx
5. Check response body has expected fields
6. UI shows data

## References

- Static file proxy pattern: `references/vite-static-proxy.md`
- Vite build + reverse proxy details → See main skill body under "Architecture" section

**Key rule:** All frontend API calls use **relative paths** (`/api/...`), never hardcoded absolute URLs. After `pnpm build`, the link is maintained by **reverse proxy at the PM2/Nginx layer** — it forwards `/api/*` to backend FastAPI (port 8010). Static files in `dist/` load from the same domain; browser sends requests there; proxy handles the rest.

If frontend "seems disconnected" after rebuild, check reverse proxy config — not frontend code.

## 📌 Known API Endpoints

| Endpoint | Method | Purpose | Response Format |
|----------|--------|---------|-----------------|
| `/api/hagent-ai/chat/completions` | POST | OpenAI-compatible LLM proxy | `{ choices: [{ message: { content } }] }` |
| `/api/video/edit` | POST | Upload source media (image/video) for editing | `output: string (base64 data URI)` |
| `/api/video/clip/{project_id}` | GET | Get video clip by project ID | `{ title, scenes, thumbnail, duration_seconds, output }` |
| `/api/coach/dashboard` | GET | AI coaching dashboard data | JSON with JD match + lesson backlog |
| `/api/truyencv/stories` | GET | Truyencv story list from cache DB | Array of {id, slug, title, summary, genre, ...} |
