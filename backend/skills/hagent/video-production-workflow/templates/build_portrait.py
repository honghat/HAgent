#!/usr/bin/env python3
"""
build_portrait.py — template cho video dọc 1080×1920

QUAN TRỌNG: Đo real duration từ audio TTS thay vì dùng duration_seconds từ script.json.
Render 1 lần duy nhất (không concat từng scene) để tránh giật.
"""
import json, sys
from pathlib import Path
from moviepy import (
    ImageClip, AudioFileClip, TextClip, ColorClip,
    CompositeVideoClip, concatenate_videoclips, vfx
)

W, H = 1080, 1920
FPS = 24
WORKDIR = Path(__file__).parent

with open(WORKDIR / "script.json") as f:
    script = json.load(f)

# === Bước 1: ĐO real audio duration (giải quyết lỗi TTS giật) ===
scene_durs = []
for scene in script["scenes"]:
    sn = scene["scene_number"]
    audio_path = WORKDIR / f"audio_nam_minh_{sn+1:02d}.mp3"
    if audio_path.exists():
        try:
            ac = AudioFileClip(str(audio_path))
            scene_durs.append(ac.duration)
            ac.close()
        except:
            scene_durs.append(scene["duration_seconds"])
    else:
        scene_durs.append(scene["duration_seconds"])

total_dur = sum(scene_durs)
print(f"Total audio: {total_dur:.2f}s ({len(scene_durs)} scenes)")

# === Bước 2: Tạo clips ===
scene_clips = []
for i, scene in enumerate(script["scenes"]):
    sn = scene["scene_number"]
    dur = scene_durs[i]
    subtitle = scene["subtitle"]
    camera = scene.get("camera_move", "static")

    img_path = WORKDIR / f"scene_{sn+1:02d}.png"
    if not img_path.exists():
        print(f"WARNING: Missing {img_path}")
        continue

    img = ImageClip(str(img_path))
    scale = max(W / img.w, H / img.h)
    img = img.resized(scale)
    img = img.cropped(x_center=img.w/2, y_center=img.h/2, width=W, height=H)
    img = img.with_duration(dur)

    # Camera move
    if camera in ("zoom_in",):
        img = img.with_effects([vfx.Resize(lambda t, d=dur: 1 + 0.02 * t / d)])
    elif camera == "zoom_out":
        img = img.with_effects([vfx.Resize(lambda t, d=dur: 1.02 - 0.02 * t / d)])

    fade = min(0.4, dur/3)
    img = img.with_effects([vfx.FadeIn(fade), vfx.FadeOut(fade)])

    # Audio
    audio_path = WORKDIR / f"audio_nam_minh_{sn+1:02d}.mp3"
    if audio_path.exists():
        try:
            audio = AudioFileClip(str(audio_path))
            img = img.with_audio(audio)
        except Exception as e:
            print(f"  Audio error: {e}")

    # Subtitle
    txt = TextClip(text=subtitle,
        font="/System/Library/Fonts/Supplemental/Arial.ttf",
        font_size=32, color="white", stroke_color="black",
        stroke_width=1.5, text_align="center",
    ).with_duration(dur).with_position(("center", H - 50))

    bg_bar = ColorClip(size=(W, 60)).with_duration(dur).with_opacity(0.3)
    bg_bar = bg_bar.with_position(("center", H - 68))

    scene_clip = CompositeVideoClip([img, bg_bar, txt], size=(W, H))
    scene_clips.append(scene_clip)

# === Bước 3: Render 1 lần (không concat từng scene) ===
print(f"Rendering {total_dur:.1f}s portrait video...")
final = concatenate_videoclips(scene_clips, method="compose")
final_out = WORKDIR / "final_video_portrait.mp4"
final.write_videofile(str(final_out), fps=FPS,
    codec="libx264", audio_codec="aac",
    bitrate="2000k", audio_bitrate="192k", logger=None)

print(f"✅ {final_out} ({final.duration:.1f}s, {final_out.stat().st_size/1024/1024:.1f}MB)")
