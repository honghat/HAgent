#!/usr/bin/env python3
"""Tạo stick figure animation GIF với nhiều pose khác nhau."""

import math
import subprocess
import tempfile
from pathlib import Path

OUTPUT = "/home/hatnguyen/HAgent_stick_animation.gif"
W, H = 1024, 1024
NUM_FRAMES = 30
FPS = 10
LINE_COLOR = "#000000"
BG_COLOR = "#FFFFFF"
STROKE = 6

# Joint coordinates relative to center (cx, cy) — stick figure proportions
# Fixed body dimensions
HEAD_R = 40
BODY_LEN = 100
UPPER_ARM = 60
LOWER_ARM = 55
UPPER_LEG = 75
LOWER_LEG = 70

def make_frame(t):
    """Return SVG frame for frame index t (0..NUM_FRAMES-1)."""
    cx, cy = W // 2, H // 2
    angle = t / NUM_FRAMES * 2 * math.pi

    # Head
    head_cx, head_cy = cx, cy - BODY_LEN // 2 - HEAD_R
    head_r = HEAD_R

    # Body line
    body_top = cy - BODY_LEN // 2
    body_bot = cy + BODY_LEN // 2

    # Arms — swing like pendulum
    arm_swing = math.sin(angle * 1.5) * 0.6
    # Left arm
    la1_x = cx
    la1_y = body_top + 20
    la2_x = cx - UPPER_ARM * math.cos(arm_swing)
    la2_y = body_top + 20 + UPPER_ARM * math.sin(abs(arm_swing))
    la3_x = la2_x - LOWER_ARM * math.cos(arm_swing + 0.3)
    la3_y = la2_y + LOWER_ARM * math.sin(abs(arm_swing) + 0.3)

    # Right arm
    ra_swing = math.sin(angle * 1.5 + math.pi) * 0.6
    ra1_x = cx
    ra1_y = body_top + 20
    ra2_x = cx - UPPER_ARM * math.cos(ra_swing)
    ra2_y = body_top + 20 + UPPER_ARM * math.sin(abs(ra_swing))
    # Mirror for right arm
    ra2_x = cx + UPPER_ARM * math.cos(ra_swing)
    ra3_x = ra2_x + LOWER_ARM * math.cos(ra_swing + 0.3)
    ra3_y = ra2_y + LOWER_ARM * math.sin(abs(ra_swing) + 0.3)

    # Legs — walk cycle
    leg_swing = math.sin(angle) * 0.5
    # Left leg
    ll1_x = cx
    ll1_y = body_bot
    ll2_x = cx - UPPER_LEG * math.sin(leg_swing)
    ll2_y = body_bot + UPPER_LEG * math.cos(leg_swing)
    ll3_x = ll2_x - LOWER_LEG * math.sin(leg_swing + 0.2)
    ll3_y = ll2_y + LOWER_LEG * math.cos(leg_swing + 0.2)

    # Right leg (opposite)
    rleg_swing = math.sin(angle + math.pi) * 0.5
    rl1_x = cx
    rl1_y = body_bot
    rl2_x = cx - UPPER_LEG * math.sin(rleg_swing)
    rl2_y = body_bot + UPPER_LEG * math.cos(rleg_swing)
    rl3_x = rl2_x - LOWER_LEG * math.sin(rleg_swing + 0.2)
    rl3_y = rl2_y + LOWER_LEG * math.cos(rleg_swing + 0.2)
    # Mirror right leg
    rl2_x = cx + UPPER_LEG * math.sin(rleg_swing)
    rl3_x = rl2_x + LOWER_LEG * math.sin(rleg_swing + 0.2)

    # Eyes — blink occasionally
    eye_open = int(t % 8 < 7)
    eye_r = 5
    leye_x, leye_y = head_cx - 12, head_cy - 5
    reye_x, reye_y = head_cx + 12, head_cy - 5

    # Mouth — smile with slight variation
    mouth_d = 8
    mouth_y = head_cy + 10

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <rect width="{W}" height="{H}" fill="{BG_COLOR}"/>
  <g stroke="{LINE_COLOR}" stroke-width="{STROKE}" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <!-- Head -->
    <circle cx="{head_cx:.1f}" cy="{head_cy:.1f}" r="{head_r}"/>
    <!-- Body -->
    <line x1="{cx}" y1="{body_top}" x2="{cx}" y2="{body_bot}"/>
    <!-- Left arm -->
    <line x1="{la1_x}" y1="{la1_y}" x2="{la2_x:.1f}" y2="{la2_y:.1f}"/>
    <line x1="{la2_x:.1f}" y1="{la2_y:.1f}" x2="{la3_x:.1f}" y2="{la3_y:.1f}"/>
    <!-- Right arm -->
    <line x1="{ra1_x}" y1="{ra1_y}" x2="{ra2_x:.1f}" y2="{ra2_y:.1f}"/>
    <line x1="{ra2_x:.1f}" y1="{ra2_y:.1f}" x2="{ra3_x:.1f}" y2="{ra3_y:.1f}"/>
    <!-- Left leg -->
    <line x1="{ll1_x}" y1="{ll1_y}" x2="{ll2_x:.1f}" y2="{ll2_y:.1f}"/>
    <line x1="{ll2_x:.1f}" y1="{ll2_y:.1f}" x2="{ll3_x:.1f}" y2="{ll3_y:.1f}"/>
    <!-- Right leg -->
    <line x1="{rl1_x}" y1="{rl1_y}" x2="{rl2_x:.1f}" y2="{rl2_y:.1f}"/>
    <line x1="{rl2_x:.1f}" y1="{rl2_y:.1f}" x2="{rl3_x:.1f}" y2="{rl3_y:.1f}"/>
  </g>
  <g fill="{LINE_COLOR}">
    <!-- Eyes -->
"""

    if eye_open:
        svg += f"""    <circle cx="{leye_x}" cy="{leye_y}" r="{eye_r}"/>
    <circle cx="{reye_x}" cy="{reye_y}" r="{eye_r}"/>
"""
    else:
        svg += f"""    <line x1="{leye_x - eye_r}" y1="{leye_y}" x2="{leye_x + eye_r}" y2="{leye_y}" stroke="{LINE_COLOR}" stroke-width="{STROKE}" stroke-linecap="round"/>
    <line x1="{reye_x - eye_r}" y1="{reye_y}" x2="{reye_x + eye_r}" y2="{reye_y}" stroke="{LINE_COLOR}" stroke-width="{STROKE}" stroke-linecap="round"/>
"""

    svg += f"""  </g>
  <!-- Smile -->
  <path d="M {head_cx - mouth_d:.1f} {mouth_y:.1f} Q {head_cx:.1f} {mouth_y + 8:.1f} {head_cx + mouth_d:.1f} {mouth_y:.1f}" stroke="{LINE_COLOR}" stroke-width="{STROKE}" stroke-linecap="round" fill="none"/>
</svg>"""
    return svg


def main():
    output_path = Path(OUTPUT)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        pngs = []

        # Render each frame as SVG → PNG via cairosvg (or rsvg-convert)
        try:
            import cairosvg
            has_cairo = True
        except ImportError:
            has_cairo = False

        for i in range(NUM_FRAMES):
            svg = make_frame(i)
            svg_path = tmp / f"frame_{i:04d}.svg"
            svg_path.write_text(svg)

            png_path = tmp / f"frame_{i:04d}.png"
            if has_cairo:
                cairosvg.svg2png(url=str(svg_path), write_to=str(png_path),
                                 output_width=W, output_height=H)
            else:
                subprocess.run([
                    "rsvg-convert",
                    "-w", str(W), "-h", str(H),
                    "-o", str(png_path),
                    str(svg_path)
                ], check=True, capture_output=True)
            pngs.append(str(png_path))

        # Build palette
        palette_path = tmp / "palette.png"
        subprocess.run([
            "ffmpeg", "-y",
            "-framerate", str(FPS),
            "-i", str(tmp / "frame_%04d.png"),
            "-vf", "palettegen=max_colors=32:stats_mode=diff",
            str(palette_path)
        ], check=True, capture_output=True)

        # Render GIF
        subprocess.run([
            "ffmpeg", "-y",
            "-framerate", str(FPS),
            "-i", str(tmp / "frame_%04d.png"),
            "-i", str(palette_path),
            "-lavfi", "paletteuse=dither=bayer:bayer_scale=5",
            "-loop", "0",
            str(output_path)
        ], check=True, capture_output=True)

    print(f"OK: {output_path} ({output_path.stat().st_size / 1024:.0f} KB, {NUM_FRAMES} frames @ {FPS}fps)")


if __name__ == "__main__":
    main()
