#!/usr/bin/env python3
"""Download models needed for ComfyUI AnimateDiff to hat-linux."""
import json, subprocess, sys, os

HOST = "100.69.50.64"
USER = "hatnguyen"

models = {
    "checkpoints/dreamshaper_8.safetensors": {
        "url": "https://huggingface.co/datasets/ek1/civitai-sm/resolve/main/dreamshaper_8.safetensors",
        "size_gb": 2.0,
        "label": "Dreamshaper 8 checkpoint",
    },
    "animatediff_models/mm_sd_v15_v2.ckpt": {
        "url": "https://huggingface.co/guoyww/animatediff/resolve/main/mm_sd_v15_v2.ckpt",
        "size_gb": 1.7,
        "label": "AnimateDiff motion module v2",
    },
}

def remote_exec(cmd):
    ssh_cmd = ["ssh", f"{USER}@{HOST}", cmd]
    result = subprocess.run(ssh_cmd, capture_output=True, text=True, timeout=300)
    return result.returncode, result.stdout.strip(), result.stderr.strip()

def download_with_wget(remote_path, url, label):
    # Use nohup + wget in background via ssh
    # First check if file exists and size
    rc, out, err = remote_exec(f"ls -la ~/ComfyUI/models/{remote_path} 2>/dev/null")
    if rc == 0:
        parts = [p for p in out.split() if p]
        if len(parts) >= 5:
            size = int(parts[4]) if parts[4].isdigit() else 0
            if size > 1_000_000_000:  # >1GB
                print(f"✅ {label} already exists ({size/1e9:.1f} GB), skipping")
                return True

    # Delete if corrupt small file
    remote_exec(f"rm -f ~/ComfyUI/models/{remote_path}")

    # Get dir
    dir_name = os.path.dirname(remote_path)
    remote_exec(f"mkdir -p ~/ComfyUI/models/{dir_name}")

    print(f"⬇️  Downloading {label}... ({url})")
    # Use background wget via ssh -f
    download_cmd = f"nohup wget -O ~/ComfyUI/models/{remote_path} '{url}' > ~/dl_{os.path.basename(remote_path)}.log 2>&1 &"
    rc, out, err = remote_exec(download_cmd)
    print(f"  → Started download in background. Check later with: ssh hatnguyen@{HOST} 'tail -3 ~/dl_{os.path.basename(remote_path)}.log'")
    return True

if __name__ == "__main__":
    for remote_path, info in models.items():
        download_with_wget(remote_path, info["url"], info["label"])
    print("\n✅ All downloads initiated. Use check_model_status.py to verify progress.")
