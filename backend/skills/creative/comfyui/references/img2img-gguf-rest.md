# img2img với GGUF Models qua REST API (không cần scripts)

Khi làm việc với ComfyUI trên **remote SSH** (không có `comfy-cli`, không có `run_workflow.py`), workflow img2img có thể gửi trực tiếp qua REST API.

## Key differences from txt2img

| Aspect | txt2img | img2img |
|--------|---------|---------|
| Input | `EmptyLatentImage` | `LoadImage` → `VAEEncode` |
| KSampler latent source | EmptyLatentImage output | VAEEncode (image) output |
| denoise | 1.0 | <1.0 (typically 0.5–0.85) |

## Full img2img workflow structure

```json
{
  "1": {
    "class_type": "LoadImage",
    "inputs": {
      "image": "your_input_file.png"    // must be in ~/ComfyUI/input/
    }
  },
  "2": {
    "class_type": "DualCLIPLoaderGGUF",
    "inputs": {
      "clip_name1": "clip_vitl.safetensors",   // NOT clip_l.safetensors
      "clip_name2": "clip_vitg.safetensors",   // NOT clip_g.safetensors
      "type": "sdxl"
    }
  },
  "3": {
    "class_type": "CLIPTextEncodeSDXL",
    "inputs": {
      "width": 1024, "height": 1024,
      "crop_w": 0, "crop_h": 0,
      "target_width": 1024, "target_height": 1024,
      "text_g": "positive prompt, full detail",
      "text_l": "short pos summary",
      "clip": ["2", 0]
    }
  },
  "4": {
    "class_type": "CLIPTextEncodeSDXL",
    "inputs": {
      "width": 1024, "height": 1024,
      "crop_w": 0, "crop_h": 0,
      "target_width": 1024, "target_height": 1024,
      "text_g": "negative prompt, avoid these",
      "text_l": "short neg summary",
      "clip": ["2", 0]
    }
  },
  "5": {
    "class_type": "UnetLoaderGGUF",
    "inputs": {
      "unet_name": "sdxl_lightning_4step.q5_1.gguf"
    }
  },
  "6": {
    "class_type": "VAELoader",
    "inputs": {
      "vae_name": "sdxl-vae-fp16-fix.safetensors"
    }
  },
  "7": {
    "class_type": "VAEDecode",
    "inputs": {
      "samples": ["10", 0],
      "vae": ["6", 0]
    }
  },
  "8": {
    "class_type": "SaveImage",
    "inputs": {
      "filename_prefix": "output_prefix",
      "images": ["7", 0]
    }
  },
  "9": {
    "class_type": "VAEEncode",
    "inputs": {
      "pixels": ["1", 0],
      "vae": ["6", 0]
    }
  },
  "10": {
    "class_type": "KSampler",
    "inputs": {
      "seed": 12345,
      "steps": 25,
      "cfg": 5.0,
      "sampler_name": "euler",
      "scheduler": "sgm_uniform",
      "denoise": 0.75,
      "model": ["5", 0],
      "positive": ["3", 0],
      "negative": ["4", 0],
      "latent_image": ["9", 0]
    }
  }
}
```

## Steps to execute

### 1. Upload image to ComfyUI input dir

```bash
# Copy from wherever to ~/ComfyUI/input/
cp /path/to/input.png ~/ComfyUI/input/

# Verify
ls -la ~/ComfyUI/input/input.png
```

**Important:** The `~/ComfyUI/input/` dir is the one ComfyUI reads from — not any other location even if it's symlinked.

### 2. Create the workflow JSON with proper node IDs

Write JSON to a temp file on the server. The payload to `/prompt` must be wrapped in a `{"prompt": { ... }}` object:

```bash
cat > /tmp/workflow.json << 'EOF'
{"prompt": { ... full workflow above ... }}
EOF
```

### 3. Validate JSON

```bash
python3 -c "import json; json.load(open('/tmp/workflow.json'))"
```

### 4. Queue the prompt

```bash
RESP=$(curl -s -X POST http://127.0.0.1:8188/prompt \
  -H "Content-Type: application/json" \
  -d @/tmp/workflow.json)
echo "$RESP" | python3 -m json.tool
```

Expected successful response:
```json
{"prompt_id": "abc-def-123", "number": 42, "node_errors": {}}
```

### 5. Monitor queue until done

```bash
for i in 1 2 3 4 5 6 7; do
  sleep 2
  QUEUED=$(curl -s http://127.0.0.1:8188/queue)
  RUNNING=$(echo "$QUEUED" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('queue_running', [])))")
  PENDING=$(echo "$QUEUED" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('queue_pending', [])))")
  echo "RUN=$RUNNING PEND=$PENDING"
  if [ "$RUNNING" = "0" ] && [ "$PENDING" = "0" ]; then break; fi
  # SDXL takes ~10-20s for 25 steps img2img on GPU
  # If still running after 7 iterations, sleep longer
  if [ "$i" -eq 7 ]; then sleep 15; fi
done
```

### 6. Download the result

```bash
ls -la ~/ComfyUI/output/  # find your output
scp hatnguyen@server:~/ComfyUI/output/your_output.png /local/path/
```

## Known issues & fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Invalid image file: x.png` | File not in ComfyUI's input dir | Copy to `~/ComfyUI/input/` (not any other path) |
| `clip_name2: 'clip_g.safetensors' not in [...]` | Wrong GGUF clip filenames | Use `clip_vitg.safetensors` / `clip_vitl.safetensors` |
| `No prompt provided` | Missing `{"prompt": ...}` wrapper | Wrap nodes dict in `{"prompt": ...}` |
| Steps ≥ 50 are very slow | SDXL-Lightning is optimized for 4-step | Keep steps 4-25 for reasonable speed |

## Prompt engineering for img2img

img2img preserves structure from the input image. How much prompt drives the result vs. the image is controlled by `denoise`:

**SDXL-Lightning GGUF (4-step):** Uses `cfg=1.0` (fixed for lightning models). Only `denoise` controls how much the prompt influences the output.

| denoise | Effect | Use case |
|---------|--------|----------|
| 0.2–0.4 | Light touch — mostly preserves input, subtle style shift | Color tweaks, minor adjustments |
| 0.5–0.7 | Balanced — noticeable changes while keeping composition | Adding/removing accessories, moderate style change |
| 0.75–0.9 | Strong transformation — original structure may shift | Major style transfer, new background |

**Line art / stick figure prompt pattern:** SDXL models naturally want to add detail. To keep simple line art style:

- **Positive:** describe exactly what you want (e.g., `"simple stick figure wearing a hat, black line art, white background, minimal drawing, clean vector style, centered"`)
- **Negative:** explicitly suppress detail (`"realistic, detailed body, clothes, background, 3d, complex, extra limbs, shading, color, extra details"`)

## Speed expectations (SDXL-Lightning GGUF, 1024×1024)

| Steps | Denoise | Time (GPU) |
|-------|---------|------------|
| 4 | 0.6 | ~3-5s |
| 4 | 0.75 | ~3-5s |
| 15 | 0.75 | ~8-12s |
| 25 | 0.75 | ~12-20s |
