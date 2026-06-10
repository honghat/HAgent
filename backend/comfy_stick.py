import json, urllib.request, time, uuid, sys

SERVER = "http://localhost:8188"
client_id = str(uuid.uuid4())

workflow = {
    "3": {
        "inputs": {
            "seed": 66,
            "steps": 4,
            "cfg": 1,
            "sampler_name": "euler",
            "scheduler": "sgm_uniform",
            "denoise": 1,
            "model": ["4", 0],
            "positive": ["6", 0],
            "negative": ["7", 0],
            "latent_image": ["5", 0]
        },
        "class_type": "KSampler"
    },
    "4": {
        "inputs": {
            "unet_name": "sdxl_lightning_4step.q5_1.gguf"
        },
        "class_type": "UnetLoaderGGUF"
    },
    "5": {
        "inputs": {
            "width": 1024,
            "height": 1024,
            "batch_size": 1
        },
        "class_type": "EmptyLatentImage"
    },
    "6": {
        "inputs": {
            "width": 1024,
            "height": 1024,
            "crop_w": 0,
            "crop_h": 0,
            "target_width": 1024,
            "target_height": 1024,
            "text_g": "simple stick figure, black line art, white background, minimal drawing, clean vector style, smiling face, full body, centered, no scenery, no color",
            "text_l": "only one stick figure, isolated on pure white background, no objects, no environment, stickman, simple lines",
            "clip": ["10", 0]
        },
        "class_type": "CLIPTextEncodeSDXL"
    },
    "7": {
        "inputs": {
            "width": 1024,
            "height": 1024,
            "crop_w": 0,
            "crop_h": 0,
            "target_width": 1024,
            "target_height": 1024,
            "text_g": "realistic, detailed body, clothes, background, landscape, shadow, 3d, complex, extra limbs, deformed hands",
            "text_l": "text, watermark, signature, letters, numbers, multiple people, scenery, complex environment",
            "clip": ["10", 0]
        },
        "class_type": "CLIPTextEncodeSDXL"
    },
    "8": {
        "inputs": {
            "images": ["9", 0]
        },
        "class_type": "SaveImage"
    },
    "9": {
        "inputs": {
            "samples": ["3", 0],
            "vae": ["11", 0]
        },
        "class_type": "VAEDecode"
    },
    "10": {
        "inputs": {
            "clip_name1": "clip_vitl.safetensors",
            "clip_name2": "clip_vitg.safetensors",
            "type": "sdxl"
        },
        "class_type": "DualCLIPLoaderGGUF"
    },
    "11": {
        "inputs": {
            "vae_name": "sdxl-vae-fp16-fix.safetensors"
        },
        "class_type": "VAELoader"
    }
}

req = urllib.request.Request(
    SERVER + "/prompt",
    data=json.dumps({"prompt": workflow, "client_id": client_id}).encode(),
    headers={"Content-Type": "application/json"}
)
resp = json.loads(urllib.request.urlopen(req).read())
print("Queued:", json.dumps(resp, indent=2))
prompt_id = resp["prompt_id"]

for i in range(60):
    time.sleep(2)
    try:
        resp2 = json.loads(urllib.request.urlopen(SERVER + "/history/" + prompt_id).read())
        if prompt_id in resp2:
            hist = resp2[prompt_id]
            if "outputs" in hist:
                for node_id, output in hist["outputs"].items():
                    if "images" in output:
                        for img in output["images"]:
                            parts = [p for p in [img.get("subfolder",""), img["filename"]] if p]
                            print("OUTPUT:" + "/".join(parts))
                sys.exit(0)
    except Exception as e:
        print("Check:", e)
    print("Waiting...", i)
print("TIMEOUT")
sys.exit(1)
