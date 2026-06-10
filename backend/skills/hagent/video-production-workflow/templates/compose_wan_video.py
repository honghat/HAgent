#!/usr/bin/env python3
"""
Compose landscape video from Wan2.1 clips + TTS audio + Pillow subtitles.

- Wan2.1 clips: scene_NN.mp4 (~2s, 832×480, 16fps)
- TTS audio:    audio_NN.mp3 (real duration ~7-10s)
- Clips are looped to match real audio duration.
- Output: final_video.mp4 (832×480, 16fps)

Place alongside script.json, scene_NN.mp4, audio_NN.mp3
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from moviepy import (
    AudioFileClip, CompositeVideoClip, ImageClip, VideoFileClip,
    concatenate_videoclips, vfx,
)

# ── CONFIG ────────────────────────────────────────────────────────────────────
W, H = 832, 480
FPS = 16
WORKDIR = Path(__file__).parent
FONT_PATH = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_SIZE = 24
SUBTITLE_WIDTH = W - 52   # inner padding
# ─────────────────────────────────────────────────────────────────────────────


def render_subtitle(text: str) -> tuple[np.ndarray, int, int]:
    """Word-wrap text, render with shadow via Pillow → numpy array."""
    font = ImageFont.truetype(FONT_PATH, FONT_SIZE)
    words = text.split()
    lines, cur = [], ""
    tmp = ImageDraw.Draw(Image.new("RGBA", (SUBTITLE_WIDTH + 200, 200)))
    for word in words:
        test = (cur + " " + word).strip()
        bbox = tmp.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= SUBTITLE_WIDTH:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)

    lh = FONT_SIZE + 6
    img_w, img_h = SUBTITLE_WIDTH + 20, len(lines) * lh + 20
    img = Image.new("RGBA", (img_w, img_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    y = 8
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        x = (img_w - (bbox[2] - bbox[0])) // 2
        draw.text((x + 2, y + 2), line, font=font, fill=(0, 0, 0, 180))
        draw.text((x, y), line, font=font, fill=(255, 255, 255, 255),
                  stroke_width=1, stroke_fill=(0, 0, 0, 255))
        y += lh
    return np.array(img), img_w, img_h


def make_bar(width: int, height: int, opacity: int = 80) -> np.ndarray:
    bar = np.zeros((height, width, 4), dtype=np.uint8)
    bar[:, :, 3] = opacity
    return bar


def main():
    with open(WORKDIR / "script.json") as f:
        script = json.load(f)
    scenes = script["scenes"]

    # Measure real audio durations
    print("Measuring audio durations...")
    scene_durs = []
    for scene in scenes:
        sn = scene["scene_number"]
        ap = WORKDIR / f"audio_{sn + 1:02d}.mp3"
        if ap.exists():
            ac = AudioFileClip(str(ap))
            scene_durs.append(ac.duration)
            ac.close()
        else:
            scene_durs.append(scene["duration_seconds"])
        print(f"  Scene {sn + 1}: {scene_durs[-1]:.2f}s")

    # Build clips
    print("\nBuilding clips...")
    clips = []
    for i, scene in enumerate(scenes):
        sn = scene["scene_number"]
        dur = scene_durs[i]
        vp = WORKDIR / f"scene_{sn + 1:02d}.mp4"
        ap = WORKDIR / f"audio_{sn + 1:02d}.mp3"

        if not vp.exists():
            print(f"  ⚠️ Missing {vp.name}, skipping")
            continue

        # Load + resize + loop
        raw = VideoFileClip(str(vp)).resized(width=W)
        if raw.h != H:
            raw = raw.resized(height=H).cropped(x_center=raw.w / 2, width=W, height=H)

        loops = int(dur / raw.duration) + 1
        looped = concatenate_videoclips([raw] * loops).subclipped(0, dur)

        # Fade
        fade = min(0.4, dur / 4)
        looped = looped.with_effects([vfx.FadeIn(fade), vfx.FadeOut(fade)])

        # Audio
        if ap.exists():
            looped = looped.with_audio(AudioFileClip(str(ap)))

        # Subtitle
        txt_arr, tw, th = render_subtitle(scene["subtitle"])
        bar_arr = make_bar(W, th + 10, opacity=80)
        bar_clip = ImageClip(bar_arr).with_duration(dur).with_position(("center", H - th - 15))
        txt_clip = ImageClip(txt_arr).with_duration(dur).with_position(((W - tw) // 2, H - th - 10))

        composite = CompositeVideoClip([looped, bar_clip, txt_clip], size=(W, H))
        clips.append(composite)
        print(f"  ✅ Scene {sn + 1}: {dur:.1f}s")

    # Render
    total = sum(scene_durs)
    print(f"\nRendering {total:.1f}s ({total / 60:.1f}min)...")
    final = concatenate_videoclips(clips, method="compose")
    out = WORKDIR / "final_video.mp4"
    final.write_videofile(
        str(out), fps=FPS, codec="libx264",
        audio_codec="aac", bitrate="2000k", audio_bitrate="192k", logger="bar",
    )
    print(f"\n✅ {out} | {final.duration:.1f}s | {out.stat().st_size / 1024 / 1024:.1f}MB")


if __name__ == "__main__":
    main()
