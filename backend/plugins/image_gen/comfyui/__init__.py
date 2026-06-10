"""ComfyUI image generation backend.

Hỗ trợ nhiều model GGUF chạy trên Hat-Linux RTX 4060 Ti 16 GB:
  - sdxl_lightning_4step  — siêu nhanh (~10s), 1024×1024
  - flux_schnell_q4       — chất lượng cao gần GPT-image, ~25s
"""

from __future__ import annotations

import logging
import os
import random
import subprocess
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

from agent.image_gen_provider import (
    DEFAULT_ASPECT_RATIO,
    ImageGenProvider,
    error_response,
    resolve_aspect_ratio,
    success_response,
)

logger = logging.getLogger(__name__)

DEFAULT_COMFYUI_BASE = "http://100.69.50.64:8188"
DEFAULT_SSH_HOST = "hatnguyen@100.69.50.64"
DEFAULT_MODEL = "sdxl_lightning_4step"
DEFAULT_SIZE = 1024
SSH_TUNNEL_CMD = [
    "ssh", "-N", "-f",
    "-L", "8188:127.0.0.1:8188",
    DEFAULT_SSH_HOST,
]


# ── Model registry ───────────────────────────────────────────────────────────
# Mỗi entry: workflow builder function trả về dict workflow API JSON
def _aspect_to_size(aspect: str, base: int) -> tuple[int, int]:
    """Map aspect ratio → (width, height), giữ multiple of 64."""
    a = (aspect or "1:1").lower()
    if a in ("1:1", "square"):
        return base, base
    if a in ("16:9", "landscape", "wide"):
        return (base * 8 // 7) // 64 * 64, (base * 7 // 12) // 64 * 64  # ~1216x704
    if a in ("9:16", "portrait", "tall"):
        return (base * 7 // 12) // 64 * 64, (base * 8 // 7) // 64 * 64  # ~704x1216
    return base, base


def _wf_sdxl_lightning(prompt: str, neg: str, w: int, h: int, seed: int) -> dict:
    from services.workflow_template import load_workflow
    return load_workflow("sdxl_lightning_4step", {
        "prompt": prompt, "neg": neg, "w": w, "h": h, "seed": seed,
    })


def _wf_flux_schnell(prompt: str, neg: str, w: int, h: int, seed: int) -> dict:
    from services.workflow_template import load_workflow
    return load_workflow("flux_schnell_q4", {
        "prompt": prompt, "w": w, "h": h, "seed": seed,
    })


MODELS: Dict[str, Dict[str, Any]] = {
    "sdxl_lightning_4step": {
        "display": "SDXL-Lightning 4-step",
        "description": "Siêu nhanh (~10s), 1024×1024, đa năng",
        "speed_sec": 10,
        "build": _wf_sdxl_lightning,
        "base_size": 1024,
        "workflow_file": "sdxl_lightning_4step.json",
    },
    "flux_schnell_q4": {
        "display": "Flux.1 Schnell Q4 (chất lượng cao)",
        "description": "Prompt-following xuất sắc, gần GPT-image, ~25s",
        "speed_sec": 25,
        "build": _wf_flux_schnell,
        "base_size": 1024,
        "workflow_file": "flux_schnell_q4.json",
    },
}


def _load_config() -> Dict[str, Any]:
    try:
        from hagent_cli.config import load_config
        cfg = load_config()
        section = cfg.get("image_gen") if isinstance(cfg, dict) else None
        if isinstance(section, dict):
            comfy = section.get("comfyui")
            return comfy if isinstance(comfy, dict) else {}
    except Exception:
        pass
    return {}


def _get_base_url() -> str:
    return os.environ.get("COMFYUI_URL") or _load_config().get("host", DEFAULT_COMFYUI_BASE)


def _ensure_ssh_tunnel(base_url: str) -> bool:
    try:
        r = requests.get(f"{base_url}/system_stats", timeout=5)
        if r.status_code == 200:
            return True
    except Exception:
        pass
    if "127.0.0.1" in base_url or "localhost" in base_url:
        try:
            subprocess.run(SSH_TUNNEL_CMD, capture_output=True, text=True, timeout=15)
            time.sleep(2)
            r = requests.get(f"{base_url}/system_stats", timeout=5)
            return r.status_code == 200
        except Exception as exc:
            logger.warning("SSH tunnel to ComfyUI failed: %s", exc)
    return False


def _images_cache_dir() -> Path:
    from hagent_constants import get_hagent_home
    path = get_hagent_home() / "cache" / "images"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _generate(model_id: str, prompt: str, neg: str, aspect: str,
              seed: int = -1, workflow_override: Optional[str] = None) -> Optional[Path]:
    base_url = _get_base_url()
    spec = MODELS.get(model_id) or MODELS[DEFAULT_MODEL]

    if not _ensure_ssh_tunnel(base_url):
        logger.warning("ComfyUI unreachable at %s", base_url)
        return None

    w, h = _aspect_to_size(aspect, spec["base_size"])
    if seed < 0:
        seed = random.randint(0, 2**31)
    if workflow_override:
        from services.workflow_template import apply_workflow
        name = workflow_override.rsplit(".json", 1)[0]
        workflow = apply_workflow(
            name,
            {"prompt": prompt, "neg": neg, "w": w, "h": h, "seed": seed},
            default_builder=spec["build"],
        )
    else:
        workflow = spec["build"](prompt, neg, w, h, seed)

    try:
        resp = requests.post(f"{base_url}/prompt",
                             json={"prompt": workflow}, timeout=15)
        resp.raise_for_status()
        prompt_id = resp.json()["prompt_id"]

        # Flux ~30s, SDXL ~12s — poll generously
        max_wait = max(60, spec.get("speed_sec", 30) * 4)
        for _ in range(max_wait):
            hist = requests.get(f"{base_url}/history/{prompt_id}", timeout=5)
            if hist.status_code == 200:
                hist_data = hist.json()
                if prompt_id in hist_data:
                    data = hist_data[prompt_id]
                    if data["status"]["completed"]:
                        for _nid, node_out in data["outputs"].items():
                            if "images" in node_out:
                                img_info = node_out["images"][0]
                                img_url = (
                                    f"{base_url}/view?"
                                    f"filename={img_info['filename']}&"
                                    f"subfolder={img_info['subfolder']}&"
                                    f"type={img_info['type']}"
                                )
                                img_resp = requests.get(img_url, timeout=30)
                                img_resp.raise_for_status()
                                cache_dir = _images_cache_dir()
                                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                                short = uuid.uuid4().hex[:8]
                                out_path = cache_dir / f"comfyui_{model_id}_{ts}_{short}.png"
                                out_path.write_bytes(img_resp.content)
                                return out_path
            time.sleep(1)
        logger.warning("ComfyUI prompt %s timed out", prompt_id[:12])
    except Exception as exc:
        logger.warning("ComfyUI generation error: %s", exc)
    return None


class ComfyUIImageGenProvider(ImageGenProvider):
    """ComfyUI image gen — multi-model GGUF trên Hat-Linux."""

    @property
    def name(self) -> str:
        return "comfyui"

    @property
    def display_name(self) -> str:
        return "ComfyUI"

    def is_available(self) -> bool:
        base_url = _get_base_url()
        try:
            r = requests.get(f"{base_url}/system_stats", timeout=3)
            return r.status_code == 200
        except Exception:
            return _ensure_ssh_tunnel(base_url)

    def list_models(self) -> List[Dict[str, Any]]:
        return [
            {"id": mid,
             "display": spec["display"],
             "speed": f"~{spec['speed_sec']}s",
             "strengths": spec["description"],
             "price": "free (local GPU)",
             "workflow_file": spec.get("workflow_file")}
            for mid, spec in MODELS.items()
        ]

    def default_model(self) -> Optional[str]:
        return DEFAULT_MODEL

    def get_setup_schema(self) -> Dict[str, Any]:
        return {
            "name": "ComfyUI",
            "badge": "local",
            "tag": "Multi-model GGUF qua ComfyUI remote (Hat-Linux RTX 4060 Ti)",
            "env_vars": [],
        }

    def generate(self, prompt: str, aspect_ratio: str = DEFAULT_ASPECT_RATIO,
                 **kwargs: Any) -> Dict[str, Any]:
        prompt = (prompt or "").strip()
        aspect = resolve_aspect_ratio(aspect_ratio)
        if not prompt:
            return error_response(error="Prompt is required",
                                  error_type="invalid_argument",
                                  provider="comfyui", aspect_ratio=aspect)

        model_id = (kwargs.get("model") or DEFAULT_MODEL).strip()
        if model_id not in MODELS:
            model_id = DEFAULT_MODEL

        neg = kwargs.get("negative") or (
            "text, watermark, signature, low quality, blurry, deformed, ugly, bad anatomy")

        out_path = _generate(model_id, prompt, neg, aspect,
                             seed=int(kwargs.get("seed") or -1),
                             workflow_override=kwargs.get("workflow"))
        if out_path is None:
            return error_response(
                error="ComfyUI không khả dụng. Bật server qua tab Animate hoặc kiểm tra Hat-Linux.",
                error_type="provider_unavailable",
                provider="comfyui", prompt=prompt, aspect_ratio=aspect)

        return success_response(image=str(out_path), model=model_id,
                                prompt=prompt, aspect_ratio=aspect,
                                provider="comfyui")


def register(ctx) -> None:
    ctx.register_image_gen_provider(ComfyUIImageGenProvider())
    logger.info("Registered ComfyUI image gen provider (multi-model)")
