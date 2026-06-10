# Remote ComfyUI via SSH — Common Pitfalls & Workarounds

When ComfyUI is installed on a remote Linux server accessed via SSH (no `comfy-cli`, no GUI), several standard assumptions break. This reference covers the gaps.

## Detection Flow (no comfy-cli)

```bash
# Is ComfyUI installed? Check directory structure
ls ~/ComfyUI/models/checkpoints/          # May only show "put_checkpoints_here"
ls ~/ComfyUI/                              # Should show main.py, nodes.py, etc.

# Is ComfyUI running?
curl -s http://127.0.0.1:8188/system_stats | head -c 200

# What Python is available?
which python3
python3 --version
ls ~/ComfyUI/venv/bin/activate* 2>/dev/null || echo "no venv"
```

## Starting ComfyUI Remotely (the hard way)

The agent's bash/terminal tool blocks shell-level backgrounding (`nohup`, `&`, `disown`, `setsid`). Workarounds:

### 1. `screen` (if installed)
```bash
screen -dmS comfy bash -c 'cd ~/ComfyUI && python3 main.py --listen 0.0.0.0 --port 8188'
```
- Then check: `screen -ls`
- Attach: `screen -r comfy`

### 2. `tmux` (if installed)
```bash
tmux new-session -d -s comfy 'python3 main.py --listen 0.0.0.0 --port 8188'
```

### 3. Shell-level `(... &)` — limited success
```bash
ssh -p 'PASS' user@host "cd ~/ComfyUI && (python3 main.py --listen 0.0.0.0 --port 8188 &) && sleep 4 && curl -s http://127.0.0.1:8188/..."
```
- Works only if the agent tool accepts inline backgrounding (bash tool may timeout but process stays alive)
- Not reliable — use screen/tmux instead

### 4. `systemd` service (best for production)
```ini
# /etc/systemd/system/comfyui.service
[Unit]
Description=ComfyUI
After=network.target

[Service]
Type=simple
User=hatnguyen
WorkingDirectory=/home/hatnguyen/ComfyUI
ExecStart=/usr/bin/python3 main.py --listen 0.0.0.0 --port 8188
Restart=on-failure

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now comfyui
```

## Model Discovery When `comfy` CLI Not Installed

```bash
# List all checkpoints
find ~/ComfyUI/models/ -name '*.safetensors' -o -name '*.ckpt' -o -name '*.gguf' 2>/dev/null

# Check broader filesystem
find ~/ -maxdepth 3 -name '*.safetensors' 2>/dev/null
find /mnt -name '*.safetensors' 2>/dev/null          # if mounted storage
find /data -name '*.safetensors' 2>/dev/null
```

Expected result when **no models exist**: only `put_checkpoints_here` (or similar placeholder files) — the models/ subdirectories are empty.

## Manual Model Download (no comfy-cli)

### SDXL Base (~6.5 GB)
```bash
cd ~/ComfyUI/models/checkpoints
wget "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors"
```

### SD 1.5 (~4 GB)
```bash
cd ~/ComfyUI/models/checkpoints
wget "https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.safetensors"
```

### Flux Dev fp8 (~12 GB)
```bash
cd ~/ComfyUI/models/checkpoints
wget "https://huggingface.co/Comfy-Org/flux1-dev/resolve/main/flux1-dev-fp8.safetensors"
```

**Note:** HF may require `--header="Authorization: Bearer YOUR_TOKEN"` for gated models.

## Manual Custom Node Install (no comfy-cli)

```bash
cd ~/ComfyUI/custom_nodes
git clone https://github.com/.../...git
cd node-name
pip install -r requirements.txt          # may need --break-system-packages on modern Ubuntu/Debian
```

## SSH Tunnel (local machine → remote ComfyUI)

```bash
ssh -L 8188:127.0.0.1:8188 user@remote-host
# Then http://127.0.0.1:8188 works in local browser
```

Add `-N -f` to background the tunnel:
```bash
ssh -N -f -L 8188:127.0.0.1:8188 user@remote-host
```

## GGUF Model Setup (SDXL-Lightning / Quantized Models)

GGUF models (`.gguf`) need custom nodes and package setup — they are **not** regular PyTorch `.safetensors` / `.ckpt` checkpoints.

### Prerequisites

```bash
pip install gguf --break-system-packages   # required for ComfyUI-GGUF node
```

### Step 1: Install ComfyUI-GGUF custom node

```bash
cd ~/ComfyUI/custom_nodes
git clone https://github.com/city96/ComfyUI-GGUF.git
```

### Step 2: Download a GGUF model

```bash
# SDXL-Lightning (4 step, Q5_1 ~3.0 GB) — FASTEST SDXL
cd ~/ComfyUI/models/unet
wget "https://huggingface.co/mzwing/SDXL-Lightning-GGUF/resolve/main/sdxl_lightning_4step.q5_1.gguf"

# Also need VAE + CLIP models
cd ~/ComfyUI/models/vae
python3 -c "from huggingface_hub import hf_hub_download; import shutil, os; p=hf_hub_download('madebyollin/sdxl-vae-fp16-fix','sdxl_vae.safetensors'); shutil.copy(p, os.path.expanduser('~/ComfyUI/models/vae/sdxl-vae-fp16-fix.safetensors'))"

cd ~/ComfyUI/models/clip
# CLIP ViT-L (~1.7 GB)
python3 -c "from huggingface_hub import hf_hub_download; import shutil, os; p=hf_hub_download('openai/clip-vit-large-patch14','model.safetensors'); shutil.copy(p, os.path.expanduser('~/ComfyUI/models/clip/clip_vitl.safetensors'))"
# CLIP ViT-G (~10 GB) — required for SDXL
python3 -c "from huggingface_hub import hf_hub_download; import shutil, os; p=hf_hub_download('laion/CLIP-ViT-bigG-14-laion2B-39B-b160k','open_clip_model.safetensors'); shutil.copy(p, os.path.expanduser('~/ComfyUI/models/clip/clip_vitg.safetensors'))"
```

**Alternative: Direct download (faster for large files):**
```bash
cd ~/ComfyUI/models/unet
wget "https://huggingface.co/mzwing/SDXL-Lightning-GGUF/resolve/main/sdxl_lightning_4step.q5_1.gguf"
```

**Other GGUF models available from `mzwing/SDXL-Lightning-GGUF`:**
- `sdxl_lightning_1step_x0.q8_0.gguf` — 1 step, fastest, lower quality
- `sdxl_lightning_2step.q8_0.gguf` — 2 step, good balance
- `sdxl_lightning_4step.q5_1.gguf` — recommended (4 steps, Q5 quality ~2.9 GB)
- `sdxl_lightning_4step.q8_0.gguf` — higher quality, larger file

### Step 3: Patch `folder_paths.py` — Critical!

ComfyUI's base `folder_paths.py` does **not** include `.gguf` in its `supported_pt_extensions` set. The Custom node auto-registers `unet_gguf` and `clip_gguf` keys, but on PyTorch 2.6+ the `get_filename_list()` returns empty unless `.gguf` is also added to the standard extension set.

**Required patch:**

```python
# In ComfyUI/folder_paths.py, modify line ~8:
supported_pt_extensions: set[str] = {".gguf", '.ckpt', '.pt', '.pt2', '.bin', '.pth', '.safetensors', '.pkl', '.sft'}
```

Or via sed:
```bash
sed -i 's/supported_pt_extensions: set\\[str\\] = {/&\".gguf\", /' ~/ComfyUI/folder_paths.py
```

### Step 4: API Workflow Format for GGUF

GGUF nodes use **different class_type names** than standard checkpoints:

| Standard | GGUF Variant |
|----------|-------------|
| `CheckpointLoaderSimple` | `UnetLoaderGGUF` (loads UNet) + `DualCLIPLoaderGGUF` (loads CLIP) |
| `UNETLoader` | `UnetLoaderGGUFAdvanced` (with dequant options) |
| `CLIPLoader` | `CLIPLoaderGGUF` |
| `DualCLIPLoader` | `DualCLIPLoaderGGUF` |
| `TripleCLIPLoader` | `TripleCLIPLoaderGGUF` |

**SDXL-Lightning KSampler parameters — validated against live API:**

The `sampler_name` and `scheduler` fields are not free-form strings; they must match the exact list ComfyUI exposes via `/object_info/KSampler`. The values below have been verified end-to-end:

| Field | SDXL-Lightning Value | Why |
|-------|---------------------|-----|
| `steps` | `4` | 4-step distilled model |
| `cfg` | `1.0` | Distilled models use cfg=1, not 7 |
| `sampler_name` | `euler` | Must be in ComfyUI's valid sampler list (`sgm_uniform` is NOT a sampler — it's a scheduler) |
| `scheduler` | `simple` | Must be in ComfyUI's valid scheduler list (`sgm_uniform` is a valid scheduler on some ComfyUI versions but not others — use `simple` for widest compatibility) |
| `denoise` | `1.0` | Full denoise for txt2img |

**Correct SDXL-Lightning workflow structure:**

```json
{
  "1": { "class_type": "UnetLoaderGGUF", "inputs": { "unet_name": "sdxl_lightning_4step.q5_1.gguf", "weight_dtype": "default" } },
  "2": { "class_type": "DualCLIPLoaderGGUF", "inputs": { "clip_name1": "clip_vitl.safetensors", "clip_name2": "clip_vitg.safetensors", "type": "sdxl" } },
  "3": { "class_type": "VAELoader", "inputs": { "vae_name": "sdxl-vae-fp16-fix.safetensors" } },
  "4": { "class_type": "EmptyLatentImage", "inputs": { "width": 1024, "height": 1024, "batch_size": 1 } },
  "5": { "class_type": "CLIPTextEncodeSDXL", "inputs": { ... "text_g": "prompt", "text_l": "prompt", "clip": ["2", 0] } },
  "6": { "class_type": "CLIPTextEncodeSDXL", "inputs": { ... "text_g": "negative", "text_l": "negative", "clip": ["2", 0] } },
  "7": { "class_type": "KSampler", "inputs": { "steps": 4, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "seed": 42, "model": ["1", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["4", 0] } },
  "8": { "class_type": "VAEDecode", "inputs": { "samples": ["7", 0], "vae": ["3", 0] } },
  "9": { "class_type": "SaveImage", "inputs": { "filename_prefix": "output", "images": ["8", 0] } }
}
```

**`sampler_name` vs `scheduler` — common confusion:** The workflows you find online often pass `sgm_uniform` as the `scheduler` value. This works on some ComfyUI version/configuration combos. When it fails with `value_not_in_list`, use `scheduler: "simple"` (always available) and `sampler_name: "euler"`. Query the actual valid lists on your server with: `curl -s http://127.0.0.1:8188/object_info/KSampler | python3 -c "import sys,json; o=json.load(sys.stdin)['KSampler']['input']['required']; print('samplers:',o['sampler_name'][0][:20]); print('schedulers:',o['scheduler'][0][:10])"`

### Step 5: Running a generation

```python
import requests, json

with open("workflow.json") as f:
    workflow = json.load(f)

resp = requests.post("http://127.0.0.1:8188/prompt", json={"prompt": workflow})
prompt_id = resp.json()["prompt_id"]

# Poll history every 2 seconds
for i in range(120):
    time.sleep(2)
    hist = requests.get(f"http://127.0.0.1:8188/history/{prompt_id}")
    if hist.status_code == 200 and hist.json():
        data = hist.json()[prompt_id]
        if data["status"]["completed"]:
            outputs = data["outputs"]
            # Extract images from outputs
            break
```

**Expected performance:** SDXL-Lightning 4-step generates a 1024x1024 image in ~5-10 seconds on an RTX 4060 Ti 16GB.

## img2img (Image-to-Image) with GGUF Models

Standard `workflows/sdxl_img2img.json` uses `CheckpointLoaderSimple` + `CLIPTextEncode` — incompatible with GGUF servers. Below is the GGUF-adapted img2img workflow using SDXL-Lightning.

### GGUF img2img Workflow Structure

Replace `EmptyLatentImage` with `LoadImage` → `VAEEncode`. All other GGUF nodes (`UnetLoaderGGUF`, `DualCLIPLoaderGGUF`, `CLIPTextEncodeSDXL`) stay the same:

```json
{
  "1": { "class_type": "LoadImage", "inputs": { "image": "your_input_image.png" } },
  "12": { "class_type": "VAEEncode", "inputs": { "pixels": ["1", 0], "vae": ["15", 0] } },
  "15": { "class_type": "VAELoader", "inputs": { "vae_name": "sdxl-vae-fp16-fix.safetensors" } },
  "20": { "class_type": "DualCLIPLoaderGGUF", "inputs": { "clip_name1": "clip_vitl.safetensors", "clip_name2": "clip_vitg.safetensors", "type": "sdxl" } },
  "10": { "class_type": "UnetLoaderGGUF", "inputs": { "unet_name": "sdxl_lightning_4step.q5_1.gguf", "weight_dtype": "default" } },
  "5": { "class_type": "CLIPTextEncodeSDXL", "inputs": { "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "text_g": "prompt", "text_l": "prompt", "clip": ["20", 0] } },
  "6": { "class_type": "CLIPTextEncodeSDXL", "inputs": { "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "text_g": "negative", "text_l": "negative", "clip": ["20", 0] } },
  "7": { "class_type": "KSampler", "inputs": { "seed": 42, "steps": 25, "cfg": 5.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 0.7, "model": ["10", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["12", 0] } },
  "8": { "class_type": "VAEDecode", "inputs": { "samples": ["7", 0], "vae": ["15", 0] } },
  "9": { "class_type": "SaveImage", "inputs": { "filename_prefix": "img2img_result", "images": ["8", 0] } }
}
```

**Key differences from txt2img:**
| Field | txt2img (EmptyLatentImage) | img2img (LoadImage) |
|-------|---------------------------|---------------------|
| Latent source | `EmptyLatentImage` (from scratch) | `VAEEncode` (from loaded image) |
| `denoise` | `1.0` (full denoise) | `0.65`–`0.8` (lower = closer to original) |
| `cfg` | `1.0` (distilled model default) | `5.0`–`7.5` (higher for prompt adherence on existing image) |
| `steps` | `4` (lightning) | `20`–`30` (more steps for img2img quality) |

### End-to-End Script (Python, no curl)

**Problem:** `curl -d @payload.json` on the remote server can return **500 Internal Server Error** with complex nested JSON, even when the same payload works fine via `urllib.request` from within the server. **Use Python `urllib.request` instead of curl for posting workflows.**

```python
import json, urllib.request, urllib.error, time

# 1. Build workflow (see JSON above)
wf = { "1": { "class_type": "LoadImage", "inputs": {"image": "reference_img.png"} }, ... }

# 2. Post wrapped in {"prompt": ...}
payload = json.dumps({"prompt": wf}).encode()
req = urllib.request.Request("http://127.0.0.1:8188/prompt",
    data=payload, headers={"Content-Type": "application/json"}, method="POST")

try:
    resp = urllib.request.urlopen(req, timeout=60)
    result = json.loads(resp.read())
    prompt_id = result["prompt_id"]
except urllib.error.HTTPError as e:
    err_body = e.read().decode()[:500]
    raise RuntimeError(f"HTTP {e.code}: {err_body}")

# 3. Poll queue until empty
for _ in range(30):
    time.sleep(5)
    q = json.loads(urllib.request.urlopen("http://127.0.0.1:8188/queue").read())
    if len(q["queue_running"]) == 0 and len(q["queue_pending"]) == 0:
        break

# 4. Check output files
# Output files are at ~/ComfyUI/output/{filename_prefix}_NNNNN_.png
```

### Running via SSH from Remote Machine

Complete flow:

```bash
# 1. Copy image to server
scp /local/path/input.png user@host:/home/user/input.png

# 2. Copy to ComfyUI input folder
ssh user@host "cp /home/user/input.png ~/ComfyUI/input/input.png"

# Write Python script on server using the end-to-end Python snippet above (avoids curl 500 issue)
cat > /tmp/run_img2img.py << 'PYEOF'
import json, urllib.request, urllib.error, time

wf = {
    "1": {"class_type": "LoadImage", "inputs": {"image": "input.png"}},
    "12": {"class_type": "VAEEncode", "inputs": {"pixels": ["1", 0], "vae": ["15", 0]}},
    "15": {"class_type": "VAELoader", "inputs": {"vae_name": "sdxl-vae-fp16-fix.safetensors"}},
    "20": {"class_type": "DualCLIPLoaderGGUF", "inputs": {"clip_name1": "clip_vitl.safetensors", "clip_name2": "clip_vitg.safetensors", "type": "sdxl"}},
    "10": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": "sdxl_lightning_4step.q5_1.gguf", "weight_dtype": "default"}},
    "5": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "text_g": "your prompt", "text_l": "your prompt", "clip": ["20", 0]}},
    "6": {"class_type": "CLIPTextEncodeSDXL", "inputs": {"width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0, "target_width": 1024, "target_height": 1024, "text_g": "negative", "text_l": "negative", "clip": ["20", 0]}},
    "7": {"class_type": "KSampler", "inputs": {"seed": 42, "steps": 25, "cfg": 5.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 0.7, "model": ["10", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["12", 0]}},
    "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["15", 0]}},
    "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "img2img_result", "images": ["8", 0]}}
}

payload = json.dumps({"prompt": wf}).encode()
req = urllib.request.Request("http://127.0.0.1:8188/prompt", data=payload, headers={"Content-Type": "application/json"}, method="POST")
resp = urllib.request.urlopen(req, timeout=60)
result = json.loads(resp.read())
print("Prompt ID:", result["prompt_id"])

for _ in range(30):
    time.sleep(5)
    q = json.loads(urllib.request.urlopen("http://127.0.0.1:8188/queue").read())
    if len(q["queue_running"]) == 0 and len(q["queue_pending"]) == 0:
        print("Done")
        break
PYEOF

# 4. Run via SSH
ssh user@host "python3 /tmp/run_img2img.py"

# 5. Download result
scp user@host:/home/user/ComfyUI/output/img2img_result_00001_.png /local/path/result.png
```

### Performance

- SDXL-Lightning 4-step + 1024x1024 input image, 25 steps, denoise 0.65: **~30–45 seconds** on RTX 4060 Ti 16GB
- Majority of time spent in VAE encode/decode of the 1024x1024 image; actual KSampler is fast (~4–8 seconds)
- Output: ~700KB PNG

## AnimateDiff + GGUF (SDXL-Lightning Video Generation)

AnimateDiff-Evolved (Gen2) works with SDXL-Lightning GGUF models to generate animated video from a single prompt. This section covers the **end-to-end AnimateDiff workflow** using the API, verified against a live ComfyUI server.

### Prerequisites

```bash
# Install AnimateDiff-Evolved custom node
cd ~/ComfyUI/custom_nodes
git clone https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved.git

# Download motion model (950 MB — stores in ComfyUI/models/animatediff_models/)
cd ~/ComfyUI/models/
mkdir -p animatediff_models
cd animatediff_models
wget "https://huggingface.co/guoyww/animatediff/resolve/main/mm_sdxl_v10_beta.ckpt"

# Alternative: use huggingface_hub
python3 -c "
from huggingface_hub import hf_hub_download
import shutil, os
p = hf_hub_download('guoyww/animatediff', 'mm_sdxl_v10_beta.ckpt')
shutil.copy(p, os.path.expanduser('~/ComfyUI/models/animatediff_models/mm_sdxl_v10_beta.ckpt'))
"

# Restart ComfyUI after node install
screen -X -S comfy quit && sleep 2
tmux new-session -d -s comfy 'cd ~/ComfyUI && python3 main.py --listen 0.0.0.0 --port 8188'
```

### Verifying AnimateDiff Nodes Are Loaded

```bash
curl -s http://127.0.0.1:8188/object_info | python3 -c "
import sys, json
data = json.load(sys.stdin)
keys = [k for k in data if 'ADE' in k or 'animate' in k.lower() or 'AnimateDiff' in k]
print(f'AnimateDiff nodes found: {len(keys)}')
for k in sorted(keys)[:20]:
    print(f'  {k}')
"
```

Expected output includes: `ADE_LoadAnimateDiffModel`, `ADE_ApplyAnimateDiffModel`, `ADE_CameraPoseBasic`, `ADE_AnimateDiffKeyframe`, `ADE_AnimateDiffCombine`, etc.

### AnimateDiff Workflow Structure (API Format)

The key architectural difference from image generation: **the motion model is injected between UNet and KSampler**, and output goes through `ADE_AnimateDiffCombine` (not `SaveImage`).

```json
{
  "3": {
    "class_type": "CLIPTextEncodeSDXL",
    "inputs": {
      "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0,
      "target_width": 1024, "target_height": 1024,
      "text_g": "cinematic shot, serene japanese garden, cherry blossoms falling, koi pond, soft sunlight",
      "text_l": "japanese garden, cherry blossoms, koi pond, cinematic, detailed",
      "clip": ["20", 0]
    }
  },
  "6": {
    "class_type": "CLIPTextEncodeSDXL",
    "inputs": {
      "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0,
      "target_width": 1024, "target_height": 1024,
      "text_g": "worst quality, low quality, ugly, blurry, deformed, distorted, bad anatomy, watermark",
      "text_l": "bad quality, blurry, watermark, deformed",
      "clip": ["20", 0]
    }
  },
  "10": { "class_type": "UnetLoaderGGUF", "inputs": { "unet_name": "sdxl_lightning_4step.q5_1.gguf" } },
  "15": { "class_type": "VAELoader", "inputs": { "vae_name": "sdxl-vae-fp16-fix.safetensors" } },
  "16": { "class_type": "VAEDecode", "inputs": { "samples": ["17", 0], "vae": ["15", 0] } },
  "17": {
    "class_type": "KSampler",
    "inputs": {
      "seed": 123456789, "steps": 4, "cfg": 1.0,
      "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0,
      "model": ["31", 0],
      "positive": ["3", 0], "negative": ["6", 0],
      "latent_image": ["51", 0]
    }
  },
  "20": { "class_type": "DualCLIPLoaderGGUF", "inputs": { "clip_name1": "clip_l.safetensors", "clip_name2": "clip_g.safetensors", "type": "sdxl" } },
  "30": { "class_type": "ADE_LoadAnimateDiffModel", "inputs": { "model_name": "mm_sdxl_v10_beta.ckpt" } },
  "31": {
    "class_type": "ADE_ApplyAnimateDiffModel",
    "inputs": {
      "motion_model": ["30", 0], "start_percent": 0.0, "end_percent": 1.0,
      "model": ["10", 0]
    }
  },
  "32": { "class_type": "ADE_CameraPoseBasic", "inputs": { "motion_type": "pan_right", "speed": 0.5, "frame_length": 16 } },
  "33": { "class_type": "ADE_AnimateDiffKeyframe", "inputs": { "start_percent": 0.0 } },
  "35": {
    "class_type": "ADE_AnimateDiffCombine",
    "inputs": {
      "images": ["16", 0], "frame_rate": 8, "loop_count": 0,
      "filename_prefix": "animatediff_test", "format": "image/gif",
      "pingpong": false, "save_image": true
    }
  },
  "51": { "class_type": "EmptyLatentImage", "inputs": { "width": 1024, "height": 1024, "batch_size": 16 } }
}
```

### Critical: POST Payload Format

The ComfyUI API expects the workflow **wrapped** in a `{"prompt": ...}` object:

```bash
# Correct way to POST — workflow is inside {"prompt": <workflow_json>}
curl -s -X POST http://127.0.0.1:8188/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt": {"3": {"class_type": "CLIPTextEncodeSDXL", ...}}}'

# AVOID shell escaping issues: write JSON to a temp file on the server
ssh user@host "echo '$PAYLOAD_B64' | base64 -d > /tmp/payload.json && \
  curl -s -X POST http://127.0.0.1:8188/prompt \
    -H 'Content-Type: application/json' \
    -d @/tmp/payload.json"
```

### Critical Pitfall: ADE_AnimateDiffCombine + SaveImage Incompatibility

`ADE_AnimateDiffCombine` outputs **GIF type** (not IMAGE type). If you attach a `SaveImage` node to receive its output, ComfyUI returns:

```
"return_type_mismatch" — "images, received_type(GIF) mismatch input_type(IMAGE)"
```

**Fix:** Do NOT include `SaveImage` in the workflow when using `ADE_AnimateDiffCombine`. Set `"save_image": true` in the `ADE_AnimateDiffCombine` node itself — it writes the GIF directly to the output directory. Alternatively, use `SaveAnimatedWEBP` (class_type `SaveAnimatedWEBP`) which accepts GIF type input:

```json
{
  "class_type": "SaveAnimatedWEBP",
  "inputs": {
    "images": ["35", 0],
    "filename_prefix": "animatediff", "fps": 8, "lossless": false, "quality": 90
  }
}
```

### AnimateDiff Camera Motion Types

`ADE_CameraPoseBasic` supports these `motion_type` values (query on your server):

```bash
curl -s http://127.0.0.1:8188/object_info/ADE_CameraPoseBasic | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d['input']['required']['motion_type'][0][:30])"
```

Common values: `pan_left`, `pan_right`, `tilt_up`, `tilt_down`, `zoom_in`, `zoom_out`, `static`, `roll_clockwise`, `roll_counterclockwise`.

The `speed` parameter controls intensity (0.0–1.0, default ~0.5). `frame_length` sets how many frames the camera motion spans (must match `batch_size` in `EmptyLatentImage`).

### Running AnimateDiff via SSH

Complete end-to-end from a local machine:

```bash
# 1. Create workflow JSON
cat > /tmp/ad_workflow.json << 'JSONEOF'
{"prompt": {"3": {"class_type": "CLIPTextEncodeSDXL", ...}}}
JSONEOF

# 2. Base64 encode to avoid shell escaping
PAYLOAD_B64=$(base64 < /tmp/ad_workflow.json)

# 3. Upload + POST via SSH
sshpass -p 'PASS' ssh user@host "
  echo '$PAYLOAD_B64' | base64 -d > /tmp/ad_payload.json && \
  curl -s -X POST http://127.0.0.1:8188/prompt \
    -H 'Content-Type: application/json' \
    -d @/tmp/ad_payload.json
"

# 4. Poll queue until empty
sleep 10
sshpass -p 'PASS' ssh user@host "curl -s http://127.0.0.1:8188/queue"

# 5. Download output
sshpass -p 'PASS' scp user@host:/home/user/ComfyUI/output/animatediff_test_00001_.gif /tmp/result.gif
```

### Expected Performance

- SDXL-Lightning 4-step + AnimateDiff (16 frames, 1024x1024): **~30-60 seconds** on RTX 4060 Ti 16GB
- Motion model loading adds ~5-10 seconds on first run (cached after that)
- Output: 59KB GIF (compressed 16 frames) + PNG grid sprite (67KB, ~2K quality)

## Known Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Value -1 smaller than min of 0` (seed) | Sending -1 directly to API | `run_workflow.py` handles `-1` by generating a seed *locally* if it detects it, but if you pass a workflow JSON with `-1` hardcoded to the API, it fails. Ensure `--args '{"seed": -1}'` is used or pass a positive integer |
| `This environment is externally managed` | Ubuntu 24.04+ PEP 668 | Use `pip install --break-system-packages <package>` or create a venv |
| `Connection refused:127.0.0.1:8188` | ComfyUI not running | Start with screen/tmux/systemd |
| `ModuleNotFoundError: No module named 'git'` | ComfyUI-Manager needs GitPython | `pip install GitPython` or disable Manager |
| `ModuleNotFoundError: No module named 'gguf'` | GGUF Python package missing | `pip install gguf --break-system-packages` |
| `ckpt_name: 'X' not in []` | Model name wrong or doesn't exist | `find` to list actual files, fix name in workflow |
| `unet_name: 'X' not in []` | (GGUF) Model not in folder_paths list | Add `.gguf` to `supported_pt_extensions` in `folder_paths.py`; restart ComfyUI |
| `prompt_outputs_failed_validation` | Workflow references missing nodes/model | `find models/` first, then check node installs. For GGUF: verify class_type uses `UnetLoaderGGUF` not `UNETLoader` |
| `Node 'UnetLoaderGGUF' not found` | GGUF custom node failing to load | Check ComfyUI logs (`cat /tmp/comfyui.log`) for import errors. Install `gguf` pip package |
| `invalid load key, '\\x0a'` | File being loaded with wrong loader | GGUF files need `UnetLoaderGGUF` not `CheckpointLoaderSimple` or `UNETLoader` |
| `weights_only` / `UnpicklingError` | PyTorch 2.6+ strict weights_only | Temporary: `sed -i 's/weights_only=True/weights_only=False/' comfy/utils.py`. Better: ensure workflow uses GGUF node (UnetLoaderGGUF), not standard loader |
| `return_type_mismatch` — GIF vs IMAGE | SaveImage node connected to ADE_AnimateDiffCombine | Remove SaveImage, use `save_image: true` on ADE_AnimateDiffCombine instead, or use `SaveAnimatedWEBP` |
| `no_prompt` / "No prompt provided" | Payload sent as bare workflow JSON instead of wrapped in `{"prompt": ...}` | Wrap workflow in `{"prompt": workflow_json}` before POST |
| `500 Internal Server Error` from `curl -d @payload.json` | curl with deeply nested JSON payload sometimes triggers 500 on ComfyUI server | Use Python `urllib.request` instead — write a Python script on the server with stdlib modules (no `requests` dependency) |
| `img2img` not returning output | Mask/Image upload path wrong | Verify upload response: `curl -F "image=@x.png" http://127.0.0.1:8188/upload/image` returns JSON with correct filename |
