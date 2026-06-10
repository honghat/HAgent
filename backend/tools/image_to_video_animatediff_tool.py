"""Tool: image_to_video_animatediff — tạo hoạt ảnh ngắn từ ảnh tĩnh qua
AnimateDiff (SD 1.5) trên ComfyUI. Nhanh hơn Wan 2.1 rất nhiều
(~1-2 phút thay vì ~10-15 phút) nhưng output nhỏ hơn (512x512, 16 frame).

Pipeline:
  ảnh → batch repeat 16 lần → VAE encode → KSampler (denoise 0.6,
  AnimateDiff motion patched vào model) → VAE decode → MP4.

Yêu cầu trên ComfyUI host:
  - models/checkpoints/dreamshaper_8.safetensors
  - models/animatediff_models/mm_sd_v15_v2.ckpt
  - custom_nodes/ComfyUI-AnimateDiff-Evolved
  - custom_nodes/ComfyUI-VideoHelperSuite
"""

from __future__ import annotations

import logging
import os
import time
import urllib.parse
import uuid
from pathlib import Path
from typing import Any

import httpx

from hagent_constants import get_hagent_home
from tools.registry import registry, tool_error, tool_result

logger = logging.getLogger(__name__)


COMFYUI_URL = os.environ.get("COMFYUI_URL", "http://100.69.50.64:8188").rstrip("/")
DEFAULT_NEG = "blurry, low quality, distorted, ugly, watermark, text, deformed"
SIZE_MAP = {
    "square": (512, 512), "1:1": (512, 512),
    "landscape": (768, 432), "16:9": (768, 432),
    "portrait": (432, 768), "9:16": (432, 768),
}


def _resolve_size(size: str) -> tuple[int, int]:
    s = (size or "square").strip().lower()
    if s in SIZE_MAP:
        return SIZE_MAP[s]
    if "x" in s:
        try:
            w, h = s.split("x")
            return int(w), int(h)
        except ValueError:
            pass
    return SIZE_MAP["square"]


def _fetch_image_bytes(image: str) -> tuple[bytes, str]:
    if image.startswith(("http://", "https://")):
        with httpx.Client(timeout=60) as c:
            r = c.get(image)
            r.raise_for_status()
            return r.content, Path(urllib.parse.urlparse(image).path).name or "input.jpg"
    p = Path(image).expanduser()
    if not p.exists():
        raise FileNotFoundError(f"Image not found: {image}")
    return p.read_bytes(), p.name


def _build_workflow(image_name: str, prompt: str, neg: str, w: int, h: int,
                    length: int, steps: int, cfg: float, denoise: float,
                    seed: int, motion_lora: str | None, lora_strength: float) -> dict:
    from services.workflow_template import load_workflow
    wf = load_workflow("animatediff_i2v", {
        "image_name": image_name, "prompt": prompt, "neg": neg,
        "w": w, "h": h, "length": length, "steps": steps,
        "cfg": cfg, "denoise": denoise, "seed": seed,
    })
    if motion_lora:
        wf["20"] = {"class_type": "ADE_AnimateDiffLoRALoader",
                    "inputs": {"lora_name": motion_lora,
                               "strength": float(lora_strength)}}
        wf["2"]["inputs"]["motion_lora"] = ["20", 0]
    return wf


def _upload_image(client: httpx.Client, img_bytes: bytes, name: str) -> str:
    safe_name = f"hagent_{uuid.uuid4().hex[:8]}_{Path(name).name}"
    r = client.post(
        f"{COMFYUI_URL}/upload/image",
        files={"image": (safe_name, img_bytes, "image/png")},
        data={"overwrite": "true"},
        timeout=60,
    )
    r.raise_for_status()
    return r.json().get("name") or safe_name


def _poll_until_done(client: httpx.Client, prompt_id: str, timeout: int) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = client.get(f"{COMFYUI_URL}/history/{prompt_id}", timeout=15)
        if r.status_code == 200 and r.json():
            return r.json()[prompt_id]
        time.sleep(2)
    raise TimeoutError(f"ComfyUI job {prompt_id} timed out after {timeout}s")


def _download_video(client: httpx.Client, vid_meta: dict) -> Path:
    params = urllib.parse.urlencode({
        "filename": vid_meta.get("filename", ""),
        "subfolder": vid_meta.get("subfolder", ""),
        "type": vid_meta.get("type", "output"),
    })
    r = client.get(f"{COMFYUI_URL}/view?{params}", timeout=120)
    r.raise_for_status()
    out_dir = get_hagent_home() / "cache" / "videos"
    out_dir.mkdir(parents=True, exist_ok=True)
    local_name = f"ad_i2v_{int(time.time())}_{uuid.uuid4().hex[:6]}.mp4"
    local_path = out_dir / local_name
    local_path.write_bytes(r.content)
    return local_path


def image_to_video_animatediff(args: dict, **kwargs: Any) -> dict:
    image = (args.get("image_path") or args.get("image") or "").strip()
    if not image:
        return tool_error("Missing 'image_path' (local path or URL).")

    prompt = (args.get("prompt") or "smooth cinematic motion, gentle camera move").strip()
    negative = (args.get("negative") or DEFAULT_NEG).strip()
    width, height = _resolve_size(args.get("size") or args.get("aspect_ratio") or "square")
    motion_lora = args.get("motion_lora") or None
    try:
        length = max(8, min(48, int(args.get("length") or 16)))
        steps = max(8, min(40, int(args.get("steps") or 25)))
        cfg = float(args.get("cfg") or 7.5)
        denoise = float(args.get("denoise") or 0.9)
        lora_strength = float(args.get("lora_strength") or 1.0)
        seed = int(args.get("seed") or int(time.time()) % 2**31)
    except (ValueError, TypeError) as e:
        return tool_error(f"Invalid numeric arg: {e}")
    timeout = int(args.get("timeout") or 600)

    try:
        with httpx.Client(timeout=httpx.Timeout(connect=10.0, read=120.0,
                                                write=120.0, pool=10.0)) as client:
            try:
                client.get(f"{COMFYUI_URL}/system_stats", timeout=5)
            except Exception as e:
                return tool_error(f"ComfyUI không chạy ở {COMFYUI_URL}: {e}")

            img_bytes, img_name = _fetch_image_bytes(image)
            uploaded = _upload_image(client, img_bytes, img_name)

            wf_override = (args.get("workflow") or "").strip()
            if wf_override:
                from services.workflow_template import apply_workflow
                name = wf_override.rsplit(".json", 1)[0]
                workflow = apply_workflow(
                    name,
                    {"image_name": uploaded, "prompt": prompt, "neg": negative,
                     "w": width, "h": height, "length": length, "steps": steps,
                     "cfg": cfg, "denoise": denoise, "seed": seed,
                     "motion_lora": motion_lora, "lora_strength": lora_strength},
                    default_builder=_build_workflow,
                )
            else:
                workflow = _build_workflow(uploaded, prompt, negative, width, height,
                                           length, steps, cfg, denoise, seed,
                                           motion_lora, lora_strength)
            r = client.post(f"{COMFYUI_URL}/prompt",
                            json={"prompt": workflow, "client_id": uuid.uuid4().hex})
            r.raise_for_status()
            data = r.json()
            prompt_id = data.get("prompt_id")
            if not prompt_id:
                return tool_error(f"ComfyUI rejected workflow: {data}")
            if data.get("node_errors"):
                return tool_error(f"Workflow errors: {data['node_errors']}")

            history = _poll_until_done(client, prompt_id, timeout)
            outputs = history.get("outputs", {})
            video_meta = None
            for _nid, node_out in outputs.items():
                vids = node_out.get("gifs") or node_out.get("videos") or []
                if vids:
                    video_meta = vids[0]
                    break
            if not video_meta:
                return tool_error(f"Không tìm thấy video output: {outputs}")

            local_path = _download_video(client, video_meta)
    except TimeoutError as e:
        return tool_error(str(e))
    except httpx.HTTPError as e:
        return tool_error(f"HTTP error: {e}")
    except Exception as e:
        logger.exception("image_to_video_animatediff failed")
        return tool_error(f"Unexpected error: {e}")

    return tool_result({
        "video_path": str(local_path),
        "video_name": local_path.name,
        "video_url": f"/api/i2v/file/{local_path.name}",
        "duration_sec": round(length / 8, 2),
        "size": f"{width}x{height}",
        "engine": "animatediff",
        "model": "dreamshaper_8 + mm_sd_v15_v2",
        "steps": steps,
        "cfg": cfg,
        "denoise": denoise,
        "lora_strength": lora_strength,
        "seed": seed,
        "motion_lora": motion_lora,
        "prompt": prompt,
        "comfyui_url": COMFYUI_URL,
        "prompt_id": prompt_id,
    })


registry.register(
    name="image_to_video_animatediff",
    toolset="image_gen",
    schema={
        "name": "image_to_video_animatediff",
        "description": (
            "Tạo hoạt ảnh ngắn từ ảnh tĩnh qua AnimateDiff (SD 1.5) trên "
            "ComfyUI remote. Nhanh hơn Wan 2.1 ~10x (~1-2 phút) nhưng output "
            "nhỏ hơn (512x512, 16 frame, ~2s @8fps). Phù hợp khi muốn tạo "
            "động ảnh nhanh, không cần độ phân giải cao. Có thể chọn "
            "motion_lora (zoom_in/out, pan_left/right, tilt_up/down, "
            "rolling_clockwise/anticlockwise)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "image_path": {"type": "string",
                               "description": "Đường dẫn ảnh local hoặc URL http(s)."},
                "prompt": {"type": "string",
                           "description": "Mô tả phong cách + chuyển động (EN tốt hơn)."},
                "negative": {"type": "string", "description": "Negative prompt."},
                "size": {"type": "string",
                         "description": "'square' (512x512, mặc định), 'landscape' (768x432), 'portrait' (432x768) hoặc '<W>x<H>'."},
                "length": {"type": "integer",
                           "description": "Số frame, 8-48. Mặc định 16 (~2s @8fps)."},
                "steps": {"type": "integer",
                          "description": "KSampler steps, 8-40. Mặc định 20."},
                "cfg": {"type": "number", "description": "CFG scale. Mặc định 7.0."},
                "denoise": {"type": "number",
                            "description": "Mức biến đổi 0-1; AnimateDiff img2vid cần ≥0.85 để có chuyển động thật. Mặc định 0.9."},
                "lora_strength": {"type": "number",
                                  "description": "Cường độ motion LoRA 0-1.5. Mặc định 1.0."},
                "motion_lora": {"type": "string",
                                "description": "Tên LoRA chuyển động, ví dụ: animatediff_motion_lora_zoom_in.safetensors"},
                "seed": {"type": "integer", "description": "Seed."},
                "timeout": {"type": "integer", "description": "Timeout giây, mặc định 600."},
                "workflow": {"type": "string",
                             "description": "Optional: tên file workflow JSON / preset (vd 'stickman.json'). Lấy list qua `list_comfyui_workflows`."},
            },
            "required": ["image_path"],
        },
    },
    handler=image_to_video_animatediff,
    description="Tạo video ngắn từ ảnh qua AnimateDiff SD1.5 (ComfyUI remote, nhanh).",
    emoji="🎞️",
)
