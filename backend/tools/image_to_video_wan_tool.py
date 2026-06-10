"""Tool: image_to_video_wan — tạo hoạt ảnh từ ảnh tĩnh qua ComfyUI Wan 2.1 I2V GGUF.

Gọi ComfyUI remote (mặc định http://100.69.50.64:8188, RTX 4060 Ti) chạy
workflow Wan2.1-I2V-14B-480P GGUF Q5_K_M để tạo video MP4 ngắn (~2-3s) từ
ảnh đầu vào + prompt mô tả chuyển động.

Quy trình:
1. Đọc ảnh local (image_path) hoặc URL → POST /upload/image
2. POST /prompt với workflow JSON (KSampler 15 bước)
3. Poll /history/{prompt_id} đến khi xong (timeout 30 phút)
4. Tải MP4 từ /view → cache/videos
5. Trả về video_path + video_url cho FE phát.

Cấu hình qua env:
- COMFYUI_URL (default http://100.69.50.64:8188)
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
DEFAULT_NEG = "static, blurry, low quality, distorted, ugly, watermark, text"
SIZE_MAP = {
    "landscape": (832, 480), "16:9": (832, 480), "wide": (832, 480),
    "portrait": (480, 832), "9:16": (480, 832), "tall": (480, 832),
    "square": (640, 640), "1:1": (640, 640),
}


def _resolve_size(size: str) -> tuple[int, int]:
    s = (size or "landscape").strip().lower()
    if s in SIZE_MAP:
        return SIZE_MAP[s]
    if "x" in s:
        try:
            w, h = s.split("x")
            return int(w), int(h)
        except ValueError:
            pass
    return SIZE_MAP["landscape"]


def _fetch_image_bytes(image: str) -> tuple[bytes, str]:
    """Return (bytes, filename) from local path or URL."""
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
                    length: int, steps: int, cfg: float, seed: int) -> dict:
    from services.workflow_template import load_workflow
    return load_workflow("wan_i2v", {
        "image_name": image_name, "prompt": prompt, "neg": neg,
        "w": w, "h": h, "length": length, "steps": steps,
        "cfg": cfg, "seed": seed,
    })


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
        time.sleep(3)
    raise TimeoutError(f"ComfyUI job {prompt_id} timed out after {timeout}s")


def _download_video(client: httpx.Client, vid_meta: dict) -> Path:
    filename = vid_meta.get("filename", "")
    subfolder = vid_meta.get("subfolder", "")
    folder_type = vid_meta.get("type", "output")
    params = urllib.parse.urlencode(
        {"filename": filename, "subfolder": subfolder, "type": folder_type})
    r = client.get(f"{COMFYUI_URL}/view?{params}", timeout=120)
    r.raise_for_status()

    out_dir = get_hagent_home() / "cache" / "videos"
    out_dir.mkdir(parents=True, exist_ok=True)
    local_name = f"wan_i2v_{int(time.time())}_{uuid.uuid4().hex[:6]}.mp4"
    local_path = out_dir / local_name
    local_path.write_bytes(r.content)
    return local_path


def image_to_video_wan(args: dict, **kwargs: Any) -> dict:
    image = (args.get("image_path") or args.get("image") or "").strip()
    if not image:
        return tool_error("Missing 'image_path' (local path or URL).")

    prompt = (args.get("prompt") or "smooth cinematic motion, gentle camera move").strip()
    negative = (args.get("negative") or DEFAULT_NEG).strip()
    width, height = _resolve_size(args.get("size") or args.get("aspect_ratio") or "landscape")
    try:
        length = max(17, min(81, int(args.get("length") or 33)))
        steps = max(8, min(30, int(args.get("steps") or 15)))
        cfg = float(args.get("cfg") or 6.0)
        seed = int(args.get("seed") or int(time.time()) % 2**31)
    except (ValueError, TypeError) as e:
        return tool_error(f"Invalid numeric arg: {e}")

    timeout = int(args.get("timeout") or 1800)

    try:
        with httpx.Client(timeout=httpx.Timeout(connect=10.0, read=120.0,
                                                write=120.0, pool=10.0)) as client:
            try:
                client.get(f"{COMFYUI_URL}/system_stats", timeout=5)
            except Exception as e:
                return tool_error(f"ComfyUI không chạy ở {COMFYUI_URL}: {e}")

            img_bytes, img_name = _fetch_image_bytes(image)
            uploaded_name = _upload_image(client, img_bytes, img_name)

            wf_override = (args.get("workflow") or "").strip()
            if wf_override:
                from services.workflow_template import apply_workflow
                name = wf_override.rsplit(".json", 1)[0]
                workflow = apply_workflow(
                    name,
                    {"image_name": uploaded_name, "prompt": prompt, "neg": negative,
                     "w": width, "h": height, "length": length, "steps": steps,
                     "cfg": cfg, "seed": seed},
                    default_builder=_build_workflow,
                )
            else:
                workflow = _build_workflow(uploaded_name, prompt, negative,
                                           width, height, length, steps, cfg, seed)
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
            for node_id, node_out in outputs.items():
                vids = node_out.get("gifs") or node_out.get("videos") or []
                if vids:
                    video_meta = vids[0]
                    break
            if not video_meta:
                return tool_error(f"Không tìm thấy video output trong history: {outputs}")

            local_path = _download_video(client, video_meta)
    except TimeoutError as e:
        return tool_error(str(e))
    except httpx.HTTPError as e:
        return tool_error(f"HTTP error: {e}")
    except Exception as e:
        logger.exception("image_to_video_wan failed")
        return tool_error(f"Unexpected error: {e}")

    return tool_result({
        "video_path": str(local_path),
        "video_name": local_path.name,
        "video_url": f"/api/i2v/file/{local_path.name}",
        "duration_sec": round(length / 16, 2),
        "size": f"{width}x{height}",
        "steps": steps,
        "cfg": cfg,
        "seed": seed,
        "prompt": prompt,
        "model": "Wan2.1-I2V-14B-480P-Q5_K_M",
        "comfyui_url": COMFYUI_URL,
        "prompt_id": prompt_id,
    })


registry.register(
    name="image_to_video_wan",
    toolset="image_gen",
    schema={
        "name": "image_to_video_wan",
        "description": (
            "Tạo hoạt ảnh (video MP4) từ ảnh tĩnh qua ComfyUI Wan 2.1 "
            "Image-to-Video 14B GGUF (chạy trên GPU remote). Mặc định 33 "
            "frame @ 16fps (~2 giây), 832x480, 15 bước. Mỗi job mất ~10-15 "
            "phút trên RTX 4060 Ti 16GB. Trả về video_path local và "
            "video_url để FE phát."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "image_path": {"type": "string",
                               "description": "Đường dẫn ảnh local hoặc URL http(s)."},
                "prompt": {"type": "string",
                           "description": "Mô tả chuyển động muốn thấy (tiếng Anh tốt hơn)."},
                "negative": {"type": "string",
                             "description": "Negative prompt. Mặc định: static, blurry…"},
                "size": {"type": "string",
                         "description": "'landscape' (832x480, mặc định), 'portrait' (480x832), 'square' (640x640), hoặc '<W>x<H>'."},
                "length": {"type": "integer",
                           "description": "Số frame, 17-81. Mặc định 33 (~2s @16fps)."},
                "steps": {"type": "integer",
                          "description": "KSampler steps, 8-30. Mặc định 15."},
                "cfg": {"type": "number",
                        "description": "Classifier-free guidance. Mặc định 6.0."},
                "seed": {"type": "integer", "description": "Seed (số nguyên)."},
                "timeout": {"type": "integer",
                            "description": "Timeout giây, mặc định 1800."},
                "workflow": {"type": "string",
                             "description": "Optional: tên file workflow JSON / preset (vd 'stickman.json'). Lấy list qua `list_comfyui_workflows`."},
            },
            "required": ["image_path"],
        },
    },
    handler=image_to_video_wan,
    description="Tạo video ngắn từ ảnh qua Wan 2.1 I2V GGUF (ComfyUI remote).",
    emoji="🎞️",
)
