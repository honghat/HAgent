#!/usr/bin/env python3
"""build_tiktok_portrait.py — TikTok-style portrait video 1080×1920

Features:
- Pillow-rendered captions for crisp text (no MoviePy TextClip aliasing)
- SINGLE-LINE ONLY: auto-shrinks font if text overflows 90% width
- Gold warm text (#FFDD44) + black shadow + stroke + semi-transparent bar
- Positioned at top (5% from top, centered)
- Falls back to NotoSans-Bold.ttf for best anti-aliasing

Usage:
  python build_tiktok_portrait.py
"""

import json
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
import numpy as np
from moviepy import (
    ImageClip, AudioFileClip, CompositeVideoClip,
    concatenate_videoclips, vfx,
)

WORKDIR = Path(__file__).parent
OUTPUT = WORKDIR / "final_tiktok.mp4"

with open(WORKDIR / "script.json") as f:
    scenes = json.load(f)

TARGET_W, TARGET_H = 1080, 1920
FPS = 24

scene_image_map = [
    str(WORKDIR / f"scene_{i+1}.png")
    for i in range(len(scenes))
]

# Font: NotoSans Bold TTF — crisp anti-aliasing, full Vietnamese support
FONT_PATH = os.path.expanduser("~/Library/Fonts/NotoSans-Bold.ttf")
if not os.path.exists(FONT_PATH):
    FONT_PATH = "/System/Library/Fonts/Supplemental/Arial.ttf"

print(f"🎬 TikTok build: {len(scenes)} scenes, font={os.path.basename(FONT_PATH)}")


def render_caption_pillow(
    text: str,
    font_path: str,
    font_size: int = 50,
    max_width: int = 972,
    fill: str = "#FFDD44",
    stroke_width: int = 3,
    stroke_fill: str = "black",
    shadow_offset: int = 4,
    shadow_opacity: float = 0.65,
) -> "tuple[Image.Image, int, int]":
    """Render caption with Pillow — single-line only, auto-shrink if needed.

    Returns (RGBA Image, width, height). Will shrink font 2pt at a time
    until text fits max_width. Never wraps across multiple lines.
    """
    # --- Single-line: shrink until it fits ---
    temp_img = Image.new("RGBA", (max_width + 200, 500), (0, 0, 0, 0))
    temp_draw = ImageDraw.Draw(temp_img)

    actual_fs = font_size
    while actual_fs >= 28:
        f = ImageFont.truetype(font_path, actual_fs)
        bbox = temp_draw.textbbox((0, 0), text, font=f, stroke_width=stroke_width)
        tw = bbox[2] - bbox[0]
        if tw <= max_width:
            break
        actual_fs -= 2

    font = ImageFont.truetype(font_path, actual_fs)

    # Measure final dimensions
    bbox = font.getbbox(text)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    pad = max(stroke_width, shadow_offset) + 8
    img_w = text_w + pad * 2
    img_h = text_h + stroke_width + pad * 2 + shadow_offset

    img = Image.new("RGBA", (img_w, img_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    x = (img_w - text_w) // 2
    y = pad

    # Shadow (behind main text)
    shadow_fill = (0, 0, 0, int(255 * shadow_opacity))
    draw.text(
        (x + shadow_offset, y + shadow_offset), text,
        font=font, fill=shadow_fill,
        stroke_width=stroke_width,
        stroke_fill=(0, 0, 0, int(255 * shadow_opacity)),
    )

    # Main text with stroke
    draw.text(
        (x, y), text, font=font, fill=fill,
        stroke_width=stroke_width, stroke_fill=stroke_fill,
    )

    return img, img_w, img_h


clips = []

for i, scene in enumerate(scenes):
    sn = scene["scene_number"]
    caption = scene["subtitle"]
    duration = scene["duration_seconds"]
    img_path = scene_image_map[i]

    print(f"Scene {sn}: \"{caption}\" ({duration}s)")

    # Load & scale image to fill 1080x1920
    img = ImageClip(img_path)
    orig_w, orig_h = img.size
    scale = max(TARGET_W / orig_w, TARGET_H / orig_h)
    new_w, new_h = int(orig_w * scale), int(orig_h * scale)
    img_resized = img.resized((new_w, new_h))

    x_off = (new_w - TARGET_W) // 2
    y_off = (new_h - TARGET_H) // 2
    img_cropped = img_resized.cropped(x1=x_off, y1=y_off, x2=x_off + TARGET_W, y2=y_off + TARGET_H)
    img_cropped = img_cropped.with_duration(duration)

    # Audio
    audio_path = WORKDIR / "audio" / f"audio_{sn:02d}.mp3"
    if audio_path.exists():
        audio_clip = AudioFileClip(str(audio_path))
        img_cropped = img_cropped.with_audio(audio_clip)
        actual_dur = min(duration, audio_clip.duration)
        if actual_dur > 0.5:
            img_cropped = img_cropped.with_duration(actual_dur)
        print(f"  Audio: {audio_path.name} ({audio_clip.duration:.1f}s)")
    else:
        actual_dur = duration
        print(f"  No audio for scene {sn}")

    # --- Pillow-rendered caption ---
    FONT_SIZE = 50
    WRAP_WIDTH = int(TARGET_W * 0.90)  # 972px

    txt_img, txt_img_w, txt_img_h = render_caption_pillow(
        text=caption,
        font_path=FONT_PATH,
        font_size=FONT_SIZE,
        max_width=WRAP_WIDTH,
        fill="#FFDD44",
        stroke_width=3,
        stroke_fill="black",
        shadow_offset=4,
        shadow_opacity=0.65,
    )

    # Position: top 5% of screen (sát header), centered horizontally
    txt_y_pos = int(TARGET_H * 0.05)
    txt_x_center = (TARGET_W - txt_img_w) // 2  # ⚠️ dùng real image width

    txt_img_np = np.array(txt_img)  # ⚠️ BẮT BUỘC — PIL → numpy → ImageClip
    txt_clip = ImageClip(txt_img_np).with_duration(img_cropped.duration)
    txt_clip = txt_clip.with_position((txt_x_center, txt_y_pos))

    # Semi-transparent bar under text (for readability on bright backgrounds)
    BAR_PADDING = 20
    bar_h = txt_img_h + BAR_PADDING
    bar_y = txt_y_pos - 10
    bar_img = Image.new("RGBA", (TARGET_W, bar_h), (0, 0, 0, 100))
    bar_clip = ImageClip(np.array(bar_img)).with_duration(img_cropped.duration)
    bar_clip = bar_clip.with_position((0, bar_y)).with_opacity(0.35)

    # Fade effects
    txt_clip = txt_clip.with_effects([vfx.FadeIn(0.4), vfx.FadeOut(0.5)])
    bar_clip = bar_clip.with_effects([vfx.FadeIn(0.4), vfx.FadeOut(0.5)])

    composite = CompositeVideoClip(
        [img_cropped, bar_clip, txt_clip],
        size=(TARGET_W, TARGET_H),
    )
    composite = composite.with_effects([vfx.FadeIn(0.3), vfx.FadeOut(0.5)])
    clips.append(composite)

print("Concatenating...")
final = concatenate_videoclips(clips, method="compose")
print(f"Duration: {final.duration:.1f}s")

print("Writing video...")
final.write_videofile(
    str(OUTPUT),
    codec="libx264",
    audio_codec="aac",
    fps=FPS,
    preset="medium",
    threads=4,
    bitrate="4000k",
    logger=None,
)

file_size = os.path.getsize(OUTPUT) / (1024 * 1024)
print(f"Done! Duration: {final.duration:.1f}s, Size: {file_size:.1f} MB")
print(f"Output: {OUTPUT}")
