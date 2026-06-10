# ComfyUI ImageGenProvider — SSH Tunnel + GGUF Pattern

This plugin (at `backend/plugins/image_gen/comfyui/`) is a non-standard
`ImageGenProvider` implementation that:
- Connects to a **remote ComfyUI** server via SSH tunnel
- Uses **GGUF-specialized class_types** (`UnetLoaderGGUF`, `DualCLIPLoaderGGUF`)
- Runs **SDXL-Lightning 4-step** (1024×1024, cfg=1, sgm_uniform)
- Has **no API key** or authentication
- Uses stick-figure style for prompts

## Key Implementation Details

### SSH Tunnel Lifecycle

```python
def _ensure_ssh_tunnel(base_url: str) -> bool:
    # Check if reachable first
    try:
        r = requests.get(f"{base_url}/system_stats", timeout=5)
        if r.status_code == 200:
            return True
    except Exception:
        pass
    # Start tunnel to hat-linux (100.69.50.64)
    SSH_TUNNEL_CMD = [
        "ssh", "-N", "-f",
        "-L", "8188:127.0.0.1:8188",
        "hatnguyen@100.69.50.64",
    ]
    subprocess.run(SSH_TUNNEL_CMD, capture_output=True, timeout=15)
    time.sleep(2)  # Wait for tunnel to establish
    # Verify
    r = requests.get(f"{base_url}/system_stats", timeout=5)
    return r.status_code == 200
```

### Workflow Template (SDXL-Lightning 4step GGUF)

Uses GGUF-specific class_types — must NOT use `CheckpointLoaderSimple`:

| Node | class_type | Notes |
|------|-----------|-------|
| 1 | `UnetLoaderGGUF` | Loads GGUF file (e.g. `sdxl_lightning_4step.q5_1.gguf`) |
| 2 | `DualCLIPLoaderGGUF` | Loads two CLIP models (`clip_vitl` + `clip_vitg`) for SDXL |
| 3 | `VAELoader` | SDXL VAE (`sdxl-vae-fp16-fix.safetensors`) |
| 4 | `EmptyLatentImage` | 1024×1024 |
| 5 | `CLIPTextEncodeSDXL` | Positive prompt (SDXL-specific, not standard CLIPTextEncode) |
| 6 | `CLIPTextEncodeSDXL` | Negative prompt |
| 7 | `KSampler` | 4 steps, cfg=1, euler, sgm_uniform |
| 8 | `VAEDecode` | |
| 9 | `SaveImage` | Prefix: `comfyui_gen` |

### Prompt Generation

```python
def _build_prompt(scene_description: str) -> str:
    base = (
        "simple stick figure, black line art, white background, "
        "minimal drawing, clean vector style, full body, centered, "
        "no scenery, no color, no shading"
    )
    return f"{scene_description}. {base}"
```

### Output Handling

Unlike providers that return b64 or URLs, this provider:
1. Submits to ComfyUI's POST `/prompt`
2. Polls GET `/history/{prompt_id}` for completion (60s timeout)
3. Downloads from `/view?filename=...&type=output`
4. Writes to `$HAGENT_HOME/cache/images/comfyui_<timestamp>_<uuid>.png`
5. Returns absolute file path

#### Cache vs Remote Filename Gap

**Critical:** The cache filename (`comfyui_<timestamp>_<uuid>.png`) is **completely different** from the remote ComfyUI output filename (`comfyui_gen_00001_.png`, determined by `SaveImage.filename_prefix`). The code downloads via ComfyUI's `/view` endpoint and saves with a new timestamp+uuid — the original output filename is discarded.

This means:
- **Can't map cache filename → remote output filename** from the local cache alone
- The `DELETE /api/photo/delete/{filename}` endpoint only removes the local cache file; it does not clean up `~/ComfyUI/output/` on the remote server
- **No mapping possible** — since the original ComfyUI output filename (`comfyui_gen_00001_.png`) is discarded during download, the local cache cannot target individual remote files
- The `DELETE /api/photo/delete/{filename}` endpoint in `api/routers/photo.py` added SSH `rm -f ~/ComfyUI/output/*.png` as a blanket cleanup — **every single delete removes ALL PNG files** on the remote ComfyUI output directory
- This is intentional: ComfyUI images are ephemeral outputs, and the trade-off (delete all vs leave orphaned files) favors simplicity
- `photo.py` uses **filesystem scanning** (`$HAGENT_HOME/cache/images/`) for history, NOT a DB table — no SQLAlchemy `ImageRecord` model exists
- ⚠️ **User must** move any kept PNGs out of `~/ComfyUI/output/` before deleting any image from the frontend

## Error Handling

- If SSH tunnel fails → `error_response(error_type="provider_unavailable")`
- If ComfyUI queue times out (60s) → `error_response(error_type="provider_error")`
- No placeholder fallback (unlike the video pipeline client)
- provider name: `"comfyui"`
- model id: `"sdxl_lightning_4step"`

### Config

```yaml
image_gen:
  provider: comfyui
  comfyui:
    host: "http://127.0.0.1:8188"     # optional, default
    model: "sdxl_lightning_4step.q5_1.gguf"  # optional, default
```

## Plugin Registration

```yaml
# plugin.yaml
name: comfyui
kind: backend
```

```python
# __init__.py entry point
def register(ctx) -> None:
    ctx.register_image_gen_provider(ComfyUIImageGenProvider())
```

The `register()` function is auto-discovered when the plugin directory exists
under `backend/plugins/image_gen/` and the plugin system runs discovery.
