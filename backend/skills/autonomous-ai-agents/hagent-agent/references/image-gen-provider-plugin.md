# Image Gen Provider Plugin — Architecture & Wiring Guide

## Overview

HAgent's `image_generate` tool dispatches to a pluggable backend through the `ImageGenProvider` ABC. Writing a new provider means implementing a single class and registering it via `PluginContext.register_image_gen_provider()`.

The full pipeline for adding a new image gen provider involves **5 layers**:

1. Provider plugin (ABC implementation)
2. Backend API router (optional, for frontend tab)
3. Frontend component (optional)
4. Tab registration in Hub
5. Config → activate

## Layer 1: Provider Plugin

### Location

File: `backend/plugins/image_gen/<provider-name>/__init__.py`

### Required Imports

```python
from agent.image_gen_provider import (
    DEFAULT_ASPECT_RATIO,
    ImageGenProvider,
    error_response,
    resolve_aspect_ratio,
    save_b64_image,
    success_response,
)
```

### Class Contract

```python
class MyProvider(ImageGenProvider):
    @property
    def name(self) -> str:          # Stable ID, no spaces (e.g. "chatgpt2api")
    @property
    def display_name(self) -> str:  # Human label (e.g. "ChatGPT2API")
    def is_available(self) -> bool:
        # Return True when the backend is reachable
    def list_models(self) -> list[dict]:
        # Return [{"id": "model-id", "display": "...", "speed": "~Xs", "strengths": "..."}]
    def default_model(self) -> str|None:
    def generate(self, prompt, aspect_ratio, **kwargs) -> dict:
        # Use success_response() or error_response() helpers
```

### Plugin Entry Point

```python
def register(ctx) -> None:
    ctx.register_image_gen_provider(MyProvider())
```

### Config Schema (config.yaml / image_gen section)

```yaml
image_gen:
  provider: myprovider           # matches .name
  myprovider:                    # per-provider subsection
    auth_key: "xxx"
    base_url: "http://localhost:3000"
    model: "gpt-image-2-medium"
```

### Config Resolution Pattern

Read provider-specific config from `image_gen.<provider-name>` subsection:

```python
def _load_config() -> dict:
    from hagent_cli.config import load_config
    cfg = load_config()
    section = cfg.get("image_gen") if isinstance(cfg, dict) else {}
    return section if isinstance(section, dict) else {}

def _get_auth():
    cfg = _load_config()
    subsection = cfg.get("myprovider", {})
    return subsection.get("auth_key")
```

### Model Resolution Precedence

1. Environment variable override (e.g. `MYPROVIDER_IMAGE_MODEL`)
2. `image_gen.myprovider.model` in config
3. `image_gen.model` in config (when matching known model IDs)
4. Default model constant

### Response Shape

- **Success:** `success_response(image=url_or_path, model=..., prompt=..., aspect_ratio=..., provider=..., extra={...})`
- **Error:** `error_response(error=..., error_type=..., provider=..., ...)`

File-path responses (from `save_b64_image`) are absolute posix paths; the UI serves them via the FastAPI uploads static mount.

## Layer 2: Backend API Router

### Location

File: `backend/api/routers/photo.py` (generic photo endpoint) or a provider-specific file.

### Standard Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/photo/models` | List models from active provider |
| POST | `/api/photo/generate` | Generate via active provider (body: `{prompt, model?, aspect_ratio?}`) |
| GET | `/api/photo/history` | Recent images from cache dir |

### Registration

1. Create router file in `backend/api/routers/`
2. Import router in `backend/api/main.py` + add to the `from api.routers import ...` line
3. Add `app.include_router(photo.router)` after other routers

### Active Provider Resolution

```python
def _get_active_provider():
    from agent.image_gen_registry import get_active_provider
    provider = get_active_provider()
    if provider is None:
        raise HTTPException(status_code=503, detail="No image gen provider configured")
    return provider
```

## Layer 3: Frontend Component

### Location

`frontend/src/components/PhotoTab.jsx`

### API Calls

- `GET http://localhost:8010/api/photo/models` → model list
- `POST http://localhost:8010/api/photo/generate` → `{ prompt, model?, aspect_ratio }` → `{ success, image, error, ... }`
- `GET http://localhost:8010/api/photo/history?limit=N` → recent images

### Image Display

File paths from provider need serving via FastAPI static mounts:

```js
const url = data.image.startsWith('http')
  ? data.image
  : `http://localhost:8010/uploads/${data.image.split('/').pop()}`
```

### Component Structure

- Two sub-views: `generate` (prompt input + result preview) and `history` (image gallery)
- Uses `lazy()` import in Hub component
- Model picker from API or hardcoded fallbacks
- Aspect ratio buttons: landscape/square/portrait

## Layer 4: Hub Registration

### File

`frontend/src/components/AutomationHub.jsx`

### Steps

1. Add lazy import: `const PhotoTab = lazy(() => import('./PhotoTab.jsx'))`
2. Add tab definition with icon SVG to the `tabs` array (before `workflows`/`cron`)
3. Add conditional render in the Suspense block:

```jsx
{activeTab === 'photo' && (
  <div className="h-full min-h-0 overflow-hidden">
    <PhotoTab token={token} provider={provider} />
  </div>
)}
```

### Build Verification

```bash
cd frontend && npx vite build
# Look for your chunk: dist/assets/PhotoTab-*.js
```

## Layer 5: Activation

1. Set `image_gen.provider` in `config.yaml` to the provider's `.name`
2. PM2 restart: `pm2 restart hagent-fastapi`
3. F5 browser to load new frontend bundle

## Common Pitfalls

- **Docker not running for proxy providers** — provider's `is_available()` tries a health check; return `False` gracefully
- **Provider shadowing** — if a built-in provider (openai, xai) has the same name, the custom one won't load. Use unique names
- **`save_b64_image` returns absolute path** — the path is under `$HAGENT_HOME/cache/images/`, NOT under frontend `dist/`. The frontend must serve via the `uploads/` static mount or a dedicated endpoint
- **SSH-tunnel-based providers skip b64 entirely** — see the ComfyUI provider (`plugins/image_gen/comfyui/`) which downloads from remote `/view` endpoint and writes directly to cache. The `save_b64_image` helper is only for providers that receive base64 from the API.
- **GGUF models use different class_types** — a ComfyUI workflow for GGUF must use `UnetLoaderGGUF`, `DualCLIPLoaderGGUF` instead of standard `CheckpointLoaderSimple`. See `comfyui skill → references/image-gen-provider-comfyui.md`.
- **Frontend build + hard refresh needed** — after adding a new JSX component, a simple navigate in SPA is not enough. The browser loads old chunks from cache until hard-refreshed (Cmd+Shift+R)
- **Backend restart required after API router changes** — `main.py` changes mean the uvicorn process must be restarted

## Example: ChatGPT2API Provider

The `chatgpt2api` provider in `backend/plugins/image_gen/chatgpt2api/__init__.py` is a complete reference implementation:

- OpenAI `/v1/images/generations` compatible
- 5 virtual models (gpt-image-2 low/medium/high, gpt-5, codex-gpt-image-2)
- Config via `image_gen.chatgpt2api` subsection
- Auth via `CHATGPT2API_AUTH_KEY` env var or config
- Fallback base_url: `http://localhost:3000`
