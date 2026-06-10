# `output` Wrapped JSON Response Pattern

> Some HAgent backend FastAPI routes wrap their response in `{"output": "<JSON string>"}` instead of returning a plain JSON object. This happens when the route calls `json.dumps(data)` and wraps it in a `JSONResponse(content=...)`.

## Where It Happens

- **`POST /api/photo/generate`** — returns `{"output": "{\"success\": true, \"image\": \"/path/to/file.png\", ...}"}`

Check the backend route — if it does `json.dumps(result)`, the output will be stringified.

## Diagnostic

Curl the backend directly:
```bash
curl -s -X POST http://127.0.0.1:8010/api/photo/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test","aspect_ratio":"landscape","count":1}'
```

If the response looks like `{"output": "{...}"}`, you have a wrapped response.

## Fix Pattern (Frontend)

```jsx
// Parse the wrapped output before accessing fields:
const rawData = res.data;   // { output: '{"success":true,"image":"/path/xxx.png"}' }
const data = typeof rawData.output === 'string'
  ? JSON.parse(rawData.output)
  : rawData;

// Now data.image etc. are accessible
```

## Fix Pattern (Backend)

The route should return a plain dict/BaseModel instead of `JSONResponse(content={"output": json.dumps(result)})`:

```python
# BAD — wraps in string
return JSONResponse(content={"output": json.dumps(result)})

# GOOD — direct JSON
return result
# or
return JSONResponse(content=result)
```

## Also: Absolute File Paths in Responses

Routes like `/api/photo/generate` return **absolute filesystem paths** (`/Users/.../cache/images/xxx.png`). Browsers can't load these from an `http://` origin. The frontend must convert to a served URL:

```jsx
const filename = rawPath.split('/').pop();
const servedUrl = `${API_BASE}/api/photo/file/${filename}`;
```
