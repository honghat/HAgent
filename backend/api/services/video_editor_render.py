"""Video editor render — ffmpeg-based, stable.

Strategy:
1. Sort video items by start time → render từng segment (clip hoặc gap đen) → concat.
2. Overlay text PNG (loop 1 -t seg) lên video output.
3. Mix audio: video clip audio + standalone audio tracks → adelay + amix.
"""
from __future__ import annotations

import json
import math
import queue
import random as _random
import shlex
import subprocess
import tempfile
import threading
import time
import traceback
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from api.services.db import get_connection

DATA_ROOT = Path(__file__).resolve().parents[3] / "data" / "editor"
ASSET_DIR = DATA_ROOT / "assets"
BRANDING_DIR = DATA_ROOT / "branding"
OUTPUT_DIR = DATA_ROOT / "output"
TEXT_CACHE = OUTPUT_DIR / ".text_cache"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
BRANDING_DIR.mkdir(parents=True, exist_ok=True)
TEXT_CACHE.mkdir(parents=True, exist_ok=True)

_q: "queue.Queue[int]" = queue.Queue()
_worker_started = False


def _now_ms() -> int:
    return int(time.time() * 1000)


def _set(jid: int, **fields):
    if not fields:
        return
    cols = ",".join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [_now_ms(), jid]
    conn = get_connection()
    conn.execute(
        f"UPDATE editor_render_jobs SET {cols},updated_at=? WHERE id=?", vals
    )
    conn.commit()
    conn.close()


def _resolve(p: str) -> str:
    if p.startswith("/data/editor/assets/"):
        return str(ASSET_DIR / Path(p).name)
    return p


def _hex_rgb(s: str):
    s = (s or "#fff").lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    try:
        return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)
    except ValueError:
        return 255, 255, 255


def _ffmpeg_color(s: str) -> str:
    r, g, b = _hex_rgb(s or "#ffffff")
    return f"0x{r:02x}{g:02x}{b:02x}"


def _has_audio(path: str) -> bool:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a:0",
             "-show_entries", "stream=codec_type", "-of", "csv=p=0", path],
            capture_output=True, text=True, timeout=5,
        )
        return "audio" in (out.stdout or "")
    except Exception:
        return False


def _has_vietnamese(text: str) -> bool:
    """Detect Vietnamese diacritics — chars outside basic Latin."""
    for c in text:
        cp = ord(c)
        if 0x00C0 <= cp <= 0x1EF9:  # Latin Extended-A/B + Vietnamese
            return True
    return False


def _render_text_png(item: dict, w: int, h: int) -> Path:
    text = item.get("text", "")
    size = int(item.get("size") or 64)
    color = item.get("color") or "#ffffff"
    style = item.get("style", "clean")
    pos = item.get("pos") or {"x": 0.5, "y": 0.5}
    font_name = item.get("font") or "Noto Sans"
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    home = Path.home()
    NOTO_BOLD = str(home / "Library/Fonts/NotoSans-Bold.ttf")
    NOTO_REG = str(home / "Library/Fonts/NotoSans-Regular.ttf")
    FONT_PATHS = {
        # Font có hỗ trợ đầy đủ tiếng Việt.
        "Noto Sans": NOTO_BOLD,
        "Noto Sans Regular": NOTO_REG,
        "Arial": "/System/Library/Fonts/Supplemental/Arial.ttf",
        "Arial Bold": "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "Georgia": "/System/Library/Fonts/Supplemental/Georgia.ttf",
        "Verdana": "/System/Library/Fonts/Supplemental/Verdana.ttf",
        "Courier New": "/System/Library/Fonts/Supplemental/Courier New.ttf",
        "Times New Roman": "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
        # Font KHÔNG có dấu tiếng Việt — auto-fallback sang Noto khi text có dấu.
        "Impact": "/System/Library/Fonts/Supplemental/Impact.ttf",
        "Arial Black": "/System/Library/Fonts/Supplemental/Arial Black.ttf",
        "Trebuchet MS": "/System/Library/Fonts/Supplemental/Trebuchet MS.ttf",
        "Comic Sans MS": "/System/Library/Fonts/Supplemental/Comic Sans MS.ttf",
    }
    NON_VIET_FONTS = {"Impact", "Arial Black", "Trebuchet MS", "Comic Sans MS"}

    # Nếu text có dấu tiếng Việt và font người dùng chọn không hỗ trợ → swap sang Noto Bold.
    if _has_vietnamese(text) and font_name in NON_VIET_FONTS:
        font_path = NOTO_BOLD
    else:
        font_path = FONT_PATHS.get(font_name) or NOTO_BOLD

    fallbacks = [font_path, NOTO_BOLD, FONT_PATHS["Arial Bold"], FONT_PATHS["Arial"]]
    font = None
    for fp in fallbacks:
        try:
            font = ImageFont.truetype(fp, size)
            break
        except Exception:
            continue
    if font is None:
        font = ImageFont.load_default()
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    cx, cy = int(w * pos.get("x", 0.5)), int(h * pos.get("y", 0.5))
    x = cx - tw // 2 - bbox[0]
    y = cy - th // 2 - bbox[1]
    rgb = _hex_rgb(color)

    if style == "outline":
        for dx in range(-3, 4):
            for dy in range(-3, 4):
                if dx * dx + dy * dy <= 9:
                    d.text((x + dx, y + dy), text, font=font, fill=(0, 0, 0, 255))
        d.text((x, y), text, font=font, fill=rgb + (255,))
    elif style == "stroke":
        for dx in range(-3, 4):
            for dy in range(-3, 4):
                if dx * dx + dy * dy <= 9:
                    d.text((x + dx, y + dy), text, font=font, fill=rgb + (255,))
        d.text((x, y), text, font=font, fill=(0, 0, 0, 0))
    elif style in ("block", "block-color"):
        pad = max(8, size // 6)
        bg = (0, 0, 0, 220) if style == "block" else rgb + (220,)
        fg = rgb + (255,) if style == "block" else (255, 255, 255, 255)
        d.rectangle((x - pad, y - pad // 2, x + tw + pad, y + th + pad // 2), fill=bg)
        d.text((x, y), text, font=font, fill=fg)
    elif style in ("shadow", "shadow3d"):
        offsets = [(5, 5), (3, 3)] if style == "shadow" else [(5, 5), (4, 4), (3, 3), (2, 2), (1, 1)]
        for ox, oy in offsets:
            d.text((x + ox, y + oy), text, font=font, fill=(0, 0, 0, 255))
        d.text((x, y), text, font=font, fill=rgb + (255,))
    elif style in ("neon", "neon2"):
        neon_rgb = (0, 255, 234) if style == "neon2" else rgb
        for r in range(10, 0, -2):
            d.text((x, y), text, font=font, fill=neon_rgb + (max(50, 255 - r * 22),))
        d.text((x, y), text, font=font, fill=(255, 255, 255, 255))
    elif style in ("gradient", "gradient2"):
        for dx, dy in ((-2, 0), (2, 0), (0, -2), (0, 2)):
            d.text((x + dx, y + dy), text, font=font, fill=(0, 0, 0, 200))
        d.text((x, y), text, font=font, fill=rgb + (255,))
    else:
        for dx, dy in ((-2, 0), (2, 0), (0, -2), (0, 2)):
            d.text((x + dx, y + dy), text, font=font, fill=(0, 0, 0, 220))
        d.text((x, y), text, font=font, fill=rgb + (255,))

    fname = f"text_{abs(hash((text, size, color, style, font_name, w, h, pos.get('x'), pos.get('y'))))}.png"
    fp = TEXT_CACHE / fname
    img.save(fp)
    return fp


def _make_circle_logo(src: str) -> Path | None:
    try:
        img = Image.open(src).convert("RGBA")
    except Exception:
        return None

    side = min(img.size)
    left = (img.width - side) // 2
    top = (img.height - side) // 2
    img = img.crop((left, top, left + side, top + side))

    mask = Image.new("L", (side, side), 0)
    d = ImageDraw.Draw(mask)
    inset = max(1, side // 160)
    d.ellipse((inset, inset, side - inset, side - inset), fill=255)

    out = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    out.alpha_composite(img)
    out.putalpha(Image.composite(img.getchannel("A"), Image.new("L", (side, side), 0), mask))

    fp = Path(tempfile.mkdtemp()) / "logo_circle.png"
    out.save(fp)
    return fp


def _scale_filter(w: int, h: int, fit: str = "contain") -> str:
    if fit == "cover":
        return f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}"
    if fit == "fill":
        return f"scale={w}:{h}"
    return f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black"


def _interpolate_kf(item: dict, local_t: float) -> dict:
    """Interpolate keyframe at local time. Return {x,y,sw,sh,rot,op}."""
    kfs = item.get("keyframes") or []
    pos = item.get("pos") or {}
    size = item.get("size") or {}
    base = {
        "x": pos.get("x", 0.5),
        "y": pos.get("y", 0.5),
        "sw": size.get("w", 0.5),
        "sh": size.get("h", 0.5),
        "rot": item.get("rotation", 0),
        "op": item.get("opacity", 1),
    }
    if not kfs:
        return base
    if local_t <= kfs[0]["t"]:
        return {**base, **kfs[0]}
    if local_t >= kfs[-1]["t"]:
        return {**base, **kfs[-1]}
    a, b = kfs[0], kfs[-1]
    for i in range(len(kfs) - 1):
        if kfs[i]["t"] <= local_t <= kfs[i + 1]["t"]:
            a, b = kfs[i], kfs[i + 1]
            break
    span = b["t"] - a["t"] or 1e-6
    p = (local_t - a["t"]) / span
    easing = a.get("easing", "linear")
    if easing == "easeOut":
        p = 1 - (1 - p) ** 2
    elif easing == "easeIn":
        p = p * p
    def lerp(k):
        return (a.get(k) or base[k]) + ((b.get(k) or base[k]) - (a.get(k) or base[k])) * p
    return {
        "x": lerp("x"), "y": lerp("y"), "sw": lerp("sw"), "sh": lerp("sh"),
        "rot": lerp("rot"), "op": lerp("op"),
    }


_particle_cache: dict = {}

def _make_particle_video(ptype: str, W: int, H: int, fps: int) -> Path | None:
    """Generate a short looping transparent PNG sequence. Cached by key."""
    key = f"{ptype}_{W}_{H}_{fps}_v5"
    if key in _particle_cache and Path(_particle_cache[key]).exists():
        return Path(_particle_cache[key])

    try:
        from PIL import Image, ImageDraw, ImageFilter
    except ImportError:
        return None

    loop_secs = 3
    n_frames = loop_secs * fps
    sw, sh = max(W // 2, 640), max(H // 2, 360)

    rng = _random.Random(42)

    if ptype == 'snow':
        flakes = []
        for _ in range(95):
            depth = rng.random() ** 0.55
            flakes.append({
                'x': rng.random() * sw,
                'y': rng.random() * sh,
                'r': 0.35 + depth * 1.85,
                'vx': rng.uniform(-0.18, 0.18) + depth * rng.uniform(-0.12, 0.12),
                'vy': 0.3 + depth * 1.35,
                'a': int(30 + depth * 125),
                'phase': rng.random() * math.tau,
                'sway': rng.uniform(0.012, 0.032),
            })
    elif ptype == 'rain':
        drops = []
        for _ in range(115):
            depth = rng.random() ** 0.7
            drops.append({
                'x': rng.random() * sw * 1.35 - sw * 0.18,
                'y': rng.random() * sh,
                'len': rng.uniform(7, 18) * (0.55 + depth * 0.55),
                'vx': -0.9 - depth * 1.6,
                'vy': 5.5 + depth * 8.5,
                'a': int(24 + depth * 72),
                'w': 1,
            })
    elif ptype == 'sparkle':
        sparks = [{'x': rng.random() * sw, 'y': rng.random() * sh,
                   'life': rng.random(), 'speed': rng.uniform(0.04, 0.09),
                   'r': rng.uniform(2, 5)} for _ in range(35)]
    elif ptype == 'fire':
        flames = [{'x': rng.random() * sw, 'y': sh + rng.random() * 22,
                   'r': rng.uniform(8, 24), 'vx': rng.uniform(-1.4, 1.4),
                   'vy': -rng.uniform(1.2, 4.5), 'life': rng.random(),
                   'decay': rng.uniform(0.008, 0.02), 'hue': rng.randint(22, 52),
                   'a': rng.uniform(0.18, 0.5), 'wobble': rng.random() * math.tau} for _ in range(120)]
    elif ptype == 'leaves':
        leaves_p = [{'x': rng.random() * sw, 'y': rng.random() * sh,
                     'r': rng.uniform(4, 8), 'vx': rng.uniform(0.4, 1.2), 'vy': rng.uniform(0.4, 1.2),
                     'rot': rng.random() * 6.28, 'rotv': rng.uniform(-0.04, 0.04),
                     'a': rng.randint(120, 200), 'hue': rng.randint(25, 55)} for _ in range(30)]
    else:
        return None

    tmp = Path(tempfile.mkdtemp())
    for f in range(n_frames):
        img = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)

        if ptype == 'snow':
            glow = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
            gd = ImageDraw.Draw(glow)
            for p in flakes:
                drift = math.sin(f * p['sway'] + p['phase']) * (0.35 + p['r'] * 0.12)
                x, y, r, a = p['x'] + drift, p['y'], p['r'], p['a']
                gd.ellipse([x - r * 1.9, y - r * 1.9, x + r * 1.9, y + r * 1.9],
                           fill=(255, 255, 255, max(5, a // 8)))
                d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, a))
                if r > 1.35:
                    d.ellipse([x - r * 0.35, y - r * 0.35, x + r * 0.35, y + r * 0.35],
                              fill=(255, 255, 255, min(205, a + 25)))
                p['x'] += p['vx']; p['y'] += p['vy']
                if p['y'] > sh + 8:
                    p['y'] = -8
                    p['x'] = rng.random() * sw
                if p['x'] < -12:
                    p['x'] = sw + 12
                elif p['x'] > sw + 12:
                    p['x'] = -12
            img = Image.alpha_composite(glow.filter(ImageFilter.GaussianBlur(1.0)), img)

        elif ptype == 'rain':
            mist = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
            md = ImageDraw.Draw(mist)
            for p in drops:
                x, y, le, a = p['x'], p['y'], p['len'], p['a']
                ex = x + p['vx'] * (le / max(p['vy'], 1))
                ey = y + le
                d.line([(x, y), (ex, ey)], fill=(205, 228, 255, a), width=p['w'])
                if y > sh * 0.78 and rng.random() < 0.006:
                    md.arc([ex - 5, ey - 2, ex + 5, ey + 3], 190, 350,
                           fill=(185, 220, 255, max(10, a // 5)), width=1)
                p['x'] += p['vx']; p['y'] += p['vy']
                if p['y'] > sh + le:
                    p['y'] = -le
                    p['x'] = rng.random() * sw * 1.35 - sw * 0.18
            img = Image.alpha_composite(img, mist.filter(ImageFilter.GaussianBlur(0.6)))

        elif ptype == 'sparkle':
            for p in sparks:
                p['life'] += p['speed']
                if p['life'] > 1: p['life'] = 0
                alpha = p['life'] * 2 if p['life'] < 0.5 else (1 - p['life']) * 2
                a = int(alpha * 230)
                r = p['r'] * (0.5 + alpha)
                if a > 5:
                    d.ellipse([p['x'] - r, p['y'] - r, p['x'] + r, p['y'] + r], fill=(255, 240, 180, a))

        elif ptype == 'fire':
            bg = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
            bd = ImageDraw.Draw(bg)
            for y in range(int(sh * 0.58), sh):
                t = max(0, (y - sh * 0.58) / max(1, sh * 0.42))
                a = int(42 * (t ** 1.6))
                bd.line([(0, y), (sw, y)], fill=(255, 95, 0, a))
            img = Image.alpha_composite(img, bg.filter(ImageFilter.GaussianBlur(10)))
            for p in flames:
                a = max(0, int(p['a'] * 255 * (1 - p['life'])))
                r = max(1, int(p['r'] * (1 - p['life'] * 0.75)))
                if a > 5:
                    x = p['x'] + math.sin(p['life'] * 8 + p['wobble']) * r * 0.25
                    h = p['hue']
                    g = min(230, int(80 + h * 2.6))
                    d.ellipse([x - r * 0.45, p['y'] - r, x + r * 0.45, p['y'] + r],
                              fill=(255, g, 18, a))
                p['x'] += p['vx']; p['y'] += p['vy']; p['life'] += p['decay']
                if p['life'] > 1:
                    p['x'] = rng.random() * sw
                    p['y'] = sh + rng.random() * 22
                    p['life'] = 0
                    p['vy'] = -rng.uniform(1.2, 4.5)

        elif ptype == 'leaves':
            for p in leaves_p:
                cx, cy, r, rot, a, hue = p['x'], p['y'], p['r'], p['rot'], p['a'], p['hue']
                # Simple rotated ellipse via polygon
                cos_r, sin_r = math.cos(rot), math.sin(rot)
                pts = []
                for ang in range(0, 360, 30):
                    ex = r * math.cos(math.radians(ang))
                    ey = r * 0.45 * math.sin(math.radians(ang))
                    rx = cx + ex * cos_r - ey * sin_r
                    ry = cy + ex * sin_r + ey * cos_r
                    pts.append((rx, ry))
                G = min(255, hue * 4 + 100); R = min(255, hue * 5)
                d.polygon(pts, fill=(R, G, 20, a))
                p['x'] += p['vx']; p['y'] += p['vy']; p['rot'] += p['rotv']
                if p['y'] > sh + 10 or p['x'] > sw + 10:
                    p['x'] = -5; p['y'] = rng.random() * sh * 0.5

        img.save(tmp / f'f{f:04d}.png')

    _particle_cache[key] = str(tmp)
    return tmp


def _p(cond: str) -> str:
    """Wrap a geq condition safely."""
    return f"({cond})"


def _build_particle_geq(ptype: str, W: int, H: int, fps: int) -> str:
    """Build geq filter for particles. Uses gte(sum,0.5)*255 for alpha."""
    rng = _random.Random(42)

    def snow_expr(N=30):
        conds = []
        for _ in range(N):
            x0 = rng.randint(0, W)
            y0 = rng.randint(0, H)
            vy = round(rng.uniform(1.0, 3.0), 2)
            vx = round(rng.uniform(-0.3, 0.3), 2)
            r2 = round(rng.uniform(4, 16), 1)  # r^2
            px = f"mod({x0}+{vx}*n\\,{W})"
            py = f"mod({y0}+{vy}*n\\,{H})"
            # use squared distance to avoid hypot nesting
            conds.append(f"lt(pow(X-{px}\\,2)+pow(Y-{py}\\,2)\\,{r2})")
        combined = "+".join(conds)
        return (f"geq=r=255:g=255:b=255:"
                f"a='gte({combined}\\,0.5)*220'")

    def rain_expr(N=40):
        conds = []
        for _ in range(N):
            x0 = rng.randint(-W//8, W + W//8)
            y0 = rng.randint(0, H)
            vy = round(rng.uniform(10, 20), 1)
            vx = round(rng.uniform(-3, -1), 1)
            le = rng.randint(10, 20)
            px = f"mod({x0}+{vx}*n\\,{W+W//4})-{W//8}"
            py = f"mod({y0}+{vy}*n\\,{H+le})"
            # Thin vertical-ish rectangle: narrow in X, long in Y
            conds.append(
                f"lt(abs(X-{px})\\,1.5)"
                f"*gte(Y\\,{py})"
                f"*lt(Y\\,{py}+{le})"
            )
        combined = "+".join(conds)
        return (f"geq=r=200:g=225:b=255:"
                f"a='gte({combined}\\,0.5)*180'")

    def sparkle_expr(N=25):
        conds = []
        for _ in range(N):
            x0 = rng.randint(0, W)
            y0 = rng.randint(0, H)
            phase = round(rng.uniform(0, 6.28), 2)
            speed = round(rng.uniform(0.1, 0.25), 3)
            r2 = round(rng.uniform(4, 20), 1)
            conds.append(
                f"max(0\\,sin({phase}+{speed}*n))"
                f"*lt(pow(X-{x0}\\,2)+pow(Y-{y0}\\,2)\\,{r2})"
            )
        combined = "+".join(conds)
        return (f"geq=r=255:g=245:b=180:"
                f"a='clip({combined}\\,0\\,1)*230'")

    def fire_expr(N=20):
        conds = []
        for _ in range(N):
            x0 = rng.randint(W//10, W - W//10)
            period = rng.randint(20, 40)
            phase = rng.randint(0, period)
            vy = round(rng.uniform(3, 8), 1)
            vx = round(rng.uniform(-1.5, 1.5), 2)
            r_max = rng.randint(8, 18)
            life = f"mod(n+{phase}\\,{period})"
            r2 = f"pow(max(1\\,{r_max}-{r_max}*{life}/{period})\\,2)"
            px = f"mod({x0}+{vx}*{life}\\,{W})"
            py = f"mod(H-{vy}*{life}\\,H)"
            fade = f"max(0\\,1-{life}/{period})"
            conds.append(
                f"{fade}*lt(pow(X-{px}\\,2)+pow(Y-{py}\\,2)\\,{r2})"
            )
        combined = "+".join(conds)
        return (f"geq=r=255:g='clip(128+127*sin(n*0.2)\\,0\\,255)':b=0:"
                f"a='clip({combined}\\,0\\,1)*220'")

    def leaves_expr(N=20):
        conds = []
        for _ in range(N):
            x0 = rng.randint(0, W)
            y0 = rng.randint(0, H)
            vx = round(rng.uniform(0.5, 1.5), 2)
            vy = round(rng.uniform(0.5, 1.5), 2)
            rx2 = round(rng.uniform(36, 100), 1)
            ry2 = round(rng.uniform(9, 36), 1)
            angle_speed = round(rng.uniform(0.05, 0.12), 3)
            px = f"mod({x0}+{vx}*n\\,{W})"
            py = f"mod({y0}+{vy}*n\\,{H})"
            cs = f"cos({angle_speed}*n)"
            sn = f"sin({angle_speed}*n)"
            dx = f"(X-{px})"
            dy = f"(Y-{py})"
            xr = f"({dx}*{cs}+{dy}*{sn})"
            yr = f"(-{dx}*{sn}+{dy}*{cs})"
            conds.append(f"lt(pow({xr}\\,2)/{rx2}+pow({yr}\\,2)/{ry2}\\,1)")
        combined = "+".join(conds)
        return (f"geq=r='clip(160+80*sin(X*0.03)\\,0\\,255)':"
                f"g='clip(100+60*cos(Y*0.03)\\,0\\,255)':b=10:"
                f"a='gte({combined}\\,0.5)*200'")

    fn = {'snow': snow_expr, 'rain': rain_expr, 'sparkle': sparkle_expr,
          'fire': fire_expr, 'leaves': leaves_expr}.get(ptype)
    return fn() if fn else ""


def _build_effect_filters(fx: dict) -> str:
    """Build ffmpeg filter chain string for clip effects. Returns '' if none."""
    parts = []

    # eq: saturation / brightness / contrast
    sat = fx.get("saturation")
    bri = fx.get("brightness")
    con = fx.get("contrast")
    gray = fx.get("grayscale")
    if gray:
        sat = 0
    eq_parts = []
    if sat is not None and abs(sat - 1) > 0.02:
        eq_parts.append(f"saturation={sat:.3f}")
    if bri is not None and abs(bri) > 0.01:
        eq_parts.append(f"brightness={bri:.3f}")
    if con is not None and abs(con - 1) > 0.02:
        eq_parts.append(f"contrast={con:.3f}")
    if eq_parts:
        parts.append("eq=" + ":".join(eq_parts))

    # hue rotation
    hue = fx.get("hue")
    if hue and abs(hue) > 1:
        parts.append(f"hue=h={hue:.1f}")

    # sepia
    sepia = fx.get("sepia")
    if sepia and (sepia is True or float(sepia) > 0.05):
        s = 1.0 if sepia is True else float(sepia)
        # mix sepia matrix with identity by factor s
        r = 1 - s + s * 0.393; rg = s * 0.769; rb = s * 0.189
        gr = s * 0.349; g = 1 - s + s * 0.686; gb = s * 0.168
        br = s * 0.272; bg = s * 0.534; b = 1 - s + s * 0.131
        parts.append(f"colorchannelmixer={r:.3f}:{rg:.3f}:{rb:.3f}:0:{gr:.3f}:{g:.3f}:{gb:.3f}:0:{br:.3f}:{bg:.3f}:{b:.3f}:0")

    # blur
    blur = fx.get("blur")
    if blur and float(blur) > 0.3:
        sigma = max(0.5, float(blur))
        parts.append(f"gblur=sigma={sigma:.1f}")

    # sharpen
    if fx.get("sharpen"):
        parts.append("unsharp=5:5:1.2:5:5:0")

    # vignette
    vignette = fx.get("vignette")
    if vignette and float(vignette) > 0.05:
        angle = 3.14159 * 0.15 + float(vignette) * 3.14159 * 0.35
        parts.append(f"vignette=angle={angle:.4f}:mode=forward")

    return ",".join(parts)


def _motion_scale_expr(fx: dict, base: int, seg: float) -> str:
    motion = fx.get("motion")
    zoom = fx.get("zoom")
    if motion in ("pop", "bounce-in"):
        return f"trunc({base}*(0.25+0.75*min(t/{max(seg, 0.001):.4f}\\,1))/2)*2"
    if motion == "pulse":
        return f"trunc({base}*(1+0.08*sin(min(t/{max(seg, 0.001):.4f}\\,1)*4*PI))/2)*2"
    if motion == "spin":
        return f"trunc({base}*(0.8+0.2*min(t/{max(seg, 0.001):.4f}\\,1))/2)*2"
    if zoom == "in":
        return f"trunc({base}*(1+0.25*min(t/{max(seg, 0.001):.4f}\\,1))/2)*2"
    if zoom == "out":
        return f"trunc({base}*(1.25-0.25*min(t/{max(seg, 0.001):.4f}\\,1))/2)*2"
    if motion == "shatter":
        return f"trunc({base}*(1+0.18*max(min((t/{max(seg, 0.001):.4f}-0.55)/0.45\\,1)\\,0))/2)*2"
    return str(base)


def _motion_overlay_expr(fx: dict, ox: int, oy: int, W: int, H: int, seg: float) -> tuple[str, str]:
    p = f"min(t/{max(seg, 0.001):.4f}\\,1)"
    ease = f"(1-pow(1-{p}\\,3))"
    x = f"{ox}-w/2"
    y = f"{oy}-h/2"
    if fx.get("motion") == "enter-left":
        x = f"{ox}-w/2-W*(1-{ease})"
    elif fx.get("motion") == "enter-right":
        x = f"{ox}-w/2+W*(1-{ease})"
    elif fx.get("motion") == "float":
        y = f"{oy}-h/2-H*0.08*sin({p}*2*PI)"
    elif fx.get("motion") == "shake":
        x = f"{ox}-w/2+W*0.04*sin({p}*18*PI)*(1-{p})"
    elif fx.get("slide") == "left":
        x = f"{ox}-w/2-W*0.5*(1-{ease})"
    elif fx.get("slide") == "right":
        x = f"{ox}-w/2+W*0.5*(1-{ease})"
    return x, y


def _ffmpeg_render(project: dict, tl: dict, out_path: Path, jid: int):
    fps = int(project.get("fps") or 30)
    W = int(project.get("width") or 1920)
    H = int(project.get("height") or 1080)

    video_items, text_items, audio_items = [], [], []
    for tr in tl.get("tracks", []):
        kind = tr.get("kind")
        for it in tr.get("items", []):
            s = float(it.get("start") or 0)
            e = float(it.get("end") or 0)
            if e <= s:
                continue
            if kind == "video":
                video_items.append({**it, "_order": len(video_items)})
            elif kind == "text":
                text_items.append(it)
            elif kind in ("audio", "music"):
                audio_items.append(it)
    def visual_z(it: dict) -> int:
        if "z" in it:
            return int(it.get("z") or 0)
        if it.get("kind") == "solid":
            return 0
        if it.get("fit"):
            return 10
        return 20

    video_items.sort(key=lambda x: (x.get("start", 0), visual_z(x), x.get("_order", 0)))

    duration = 0.0
    for it in video_items + text_items + audio_items:
        duration = max(duration, float(it.get("end") or 0))
    duration = max(duration, 0.5)

    args = ["ffmpeg", "-y"]
    # Input 0: black canvas
    args += ["-f", "lavfi", "-i", f"color=c=black:s={W}x{H}:r={fps}:d={duration}"]
    input_idx = 1
    video_filters = []
    audio_filters = []
    cur_vlabel = "[0:v]"
    missing_assets = []

    for i, it in enumerate(video_items):
        if it.get("kind") == "solid":
            s = float(it["start"])
            e = float(it["end"])
            seg = e - s
            color = _ffmpeg_color(it.get("color") or "#ffffff")
            args += ["-f", "lavfi", "-t", f"{seg}", "-i", f"color=c={color}:s={W}x{H}:r={fps}"]
            fade_in = float(it.get("fade_in") or 0)
            fade_out = float(it.get("fade_out") or 0)
            fade = ""
            if fade_in > 0:
                fade += f",fade=t=in:st=0:d={fade_in}"
            if fade_out > 0:
                fade += f",fade=t=out:st={max(0, seg - fade_out)}:d={fade_out}"
            clip_label = f"[v{i}]"
            video_filters.append(
                f"[{input_idx}:v]fps={fps}{fade},setsar=1,setpts=PTS-STARTPTS+{s}/TB{clip_label}"
            )
            out_label = f"[bg{i}]"
            video_filters.append(f"{cur_vlabel}{clip_label}overlay=eof_action=pass{out_label}")
            cur_vlabel = out_label
            input_idx += 1
            continue

        src = _resolve(it.get("asset_path", ""))
        if not src or not Path(src).exists():
            missing_assets.append(it.get("asset_name") or src or "?")
            continue
        ext = Path(src).suffix.lower()
        is_image = it.get("kind") == "image" or ext in {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}
        s = float(it["start"])
        e = float(it["end"])
        seg = e - s
        fit = it.get("fit")

        if is_image:
            args += ["-loop", "1", "-t", f"{seg}", "-i", src]
        else:
            in_t = float(it.get("in") or 0)
            args += ["-ss", f"{in_t}", "-t", f"{seg}", "-i", src]

        fx = it.get("effects") or {}
        effect_chain = _build_effect_filters(fx)
        effect_str = f",{effect_chain}" if effect_chain else ""

        # Backward compat: nếu có fit → dùng scale full canvas (legacy)
        if fit:
            scale = _scale_filter(W, H, fit)
            fade_in = float(it.get("fade_in") or 0)
            fade_out = float(it.get("fade_out") or 0)
            fade = ""
            if fade_in > 0:
                fade += f",fade=t=in:st=0:d={fade_in}"
            if fade_out > 0:
                fade += f",fade=t=out:st={max(0, seg - fade_out)}:d={fade_out}"
            clip_label = f"[v{i}]"
            video_filters.append(
                f"[{input_idx}:v]{scale},fps={fps}{effect_str}{fade},setsar=1,setpts=PTS-STARTPTS+{s}/TB{clip_label}"
            )
            out_label = f"[bg{i}]"
            video_filters.append(
                f"{cur_vlabel}{clip_label}overlay=eof_action=pass{out_label}"
            )
            cur_vlabel = out_label
        else:
            # New: pos/size/rotation/opacity/keyframes
            kfs = it.get("keyframes") or []
            if kfs:
                # Có keyframe → render từng frame với zoompan (phức tạp, tạm bỏ qua)
                # Fallback: dùng snapshot tại giữa segment
                snap = _interpolate_kf(it, seg / 2)
            else:
                pos = it.get("pos") or {}
                size = it.get("size") or {}
                snap = {
                    "x": pos.get("x", 0.5), "y": pos.get("y", 0.5),
                    "sw": size.get("w", 0.5), "sh": size.get("h", 0.5),
                    "rot": it.get("rotation", 0), "op": it.get("opacity", 1),
                }
            # Scale clip về kích thước mong muốn
            clip_w = int(snap["sw"] * W)
            clip_h = int(snap["sh"] * H)
            clip_w = max(2, clip_w if clip_w % 2 == 0 else clip_w + 1)
            clip_h = max(2, clip_h if clip_h % 2 == 0 else clip_h + 1)
            scale_w = _motion_scale_expr(fx, clip_w, seg)
            scale_h = _motion_scale_expr(fx, clip_h, seg)
            # Overlay position (center anchor)
            ox = int(snap["x"] * W)
            oy = int(snap["y"] * H)
            overlay_x, overlay_y = _motion_overlay_expr(fx, ox, oy, W, H, seg)
            clip_label = f"[v{i}]"
            # Scale + fade + rotate (rotate filter yêu cầu fillcolor)
            if fx.get("motion") == "spin":
                rot_rad = f"{snap['rot'] * 3.14159 / 180}+2*PI*t/{max(seg, 0.001):.4f}"
            else:
                rot_rad = str(snap["rot"] * 3.14159 / 180)
            fade_in = float(it.get("fade_in") or 0)
            fade_out = float(it.get("fade_out") or 0)
            fade = ""
            if fade_in > 0:
                fade += f",fade=t=in:st=0:d={fade_in}"
            if fade_out > 0:
                fade += f",fade=t=out:st={max(0, seg - fade_out)}:d={fade_out}"
            if fx.get("motion") == "shatter":
                fade += f",fade=t=out:st={max(0, seg * 0.55)}:d={max(0.1, seg * 0.45)}"
            video_filters.append(
                f"[{input_idx}:v]scale={scale_w}:{scale_h}:eval=frame,"
                f"rotate={rot_rad}:fillcolor=black@0.0,fps={fps}{effect_str}{fade},"
                f"format=yuva420p,colorchannelmixer=aa={snap['op']},"
                f"setsar=1,setpts=PTS-STARTPTS+{s}/TB{clip_label}"
            )
            out_label = f"[bg{i}]"
            video_filters.append(
                f"{cur_vlabel}{clip_label}overlay=x='{overlay_x}':y='{overlay_y}':eval=frame:eof_action=pass{out_label}"
            )
            cur_vlabel = out_label

        if not is_image and _has_audio(src):
            vol = float(it.get("volume") or 1.0)
            delay_ms = int(s * 1000)
            audio_filters.append(
                f"[{input_idx}:a]adelay={delay_ms}|{delay_ms},volume={vol}[a{i}]"
            )

        input_idx += 1

    # Text overlays
    for ti, it in enumerate(text_items):
        png = _render_text_png(it, W, H)
        s = float(it["start"])
        e = float(it["end"])
        seg = e - s
        args += ["-loop", "1", "-t", f"{seg}", "-i", str(png)]
        shifted = f"[txts{ti}]"
        out_label = f"[txt{ti}]"
        video_filters.append(
            f"[{input_idx}:v]fps={fps},setpts=PTS-STARTPTS+{s}/TB{shifted}"
        )
        video_filters.append(
            f"{cur_vlabel}{shifted}overlay=eof_action=pass{out_label}"
        )
        cur_vlabel = out_label
        input_idx += 1

    # Particle overlays — render cached alpha video first. This is more stable
    # than a very long geq expression on newer FFmpeg builds.
    for i, it in enumerate(video_items):
        ptype = (it.get("effects") or {}).get("particle")
        if not ptype:
            continue
        s = float(it["start"]); e = float(it["end"]); seg = e - s
        particle_video = _make_particle_video(ptype, W, H, fps)
        if not particle_video:
            continue
        pl = f"[part{i}]"
        out_label = f"[par{i}]"
        args += [
            "-framerate", str(fps), "-stream_loop", "-1", "-t", f"{seg}",
            "-i", str(particle_video / "f%04d.png"),
        ]
        video_filters.append(
            f"[{input_idx}:v]scale={W}:{H},fps={fps},format=rgba,"
            f"setpts=PTS-STARTPTS+{s}/TB{pl}"
        )
        video_filters.append(f"{cur_vlabel}{pl}overlay=eof_action=pass{out_label}")
        cur_vlabel = out_label
        input_idx += 1

    # Standalone audio
    for ai, it in enumerate(audio_items):
        src = _resolve(it.get("asset_path", ""))
        if not src or not Path(src).exists():
            missing_assets.append(it.get("asset_name") or src or "?")
            continue
        s = float(it["start"])
        e = float(it["end"])
        seg = e - s
        in_t = float(it.get("in") or 0)
        vol = float(it.get("volume") or 1.0)
        args += ["-ss", f"{in_t}", "-t", f"{seg}", "-i", src]
        delay_ms = int(s * 1000)
        audio_filters.append(
            f"[{input_idx}:a]adelay={delay_ms}|{delay_ms},volume={vol}[aa{ai}]"
        )
        input_idx += 1

    if missing_assets and not video_filters:
        raise RuntimeError(
            f"Tất cả asset video đã bị xoá: {', '.join(missing_assets[:5])}. "
            "Re-import lại từ tab Animate/Photo hoặc upload lại."
        )

    # Watermark overlay (always on top)
    watermark = project.get("watermark") or {}
    _wm_tmp = None
    wm_src = None
    if watermark.get("enabled"):
        if watermark.get("asset_path"):
            wm_src = _resolve(watermark["asset_path"])
        elif watermark.get("data_url"):
            import base64, re as _re
            m = _re.match(r"data:image/(\w+);base64,(.*)", watermark["data_url"], _re.DOTALL)
            if m:
                ext = m.group(1)
                _wm_tmp = Path(tempfile.mkdtemp()) / f"wm.{ext}"
                _wm_tmp.write_bytes(base64.b64decode(m.group(2)))
                wm_src = str(_wm_tmp)
        if not wm_src or not Path(wm_src).exists():
            _default_branding = BRANDING_DIR / "logo.png"
            if _default_branding.exists():
                wm_src = str(_default_branding)
    if wm_src and Path(wm_src).exists():
        circle_logo = _make_circle_logo(wm_src)
        if circle_logo:
            wm_src = str(circle_logo)
        wm_scale = float(watermark.get("scale") or 0.08)
        wm_opacity = float(watermark.get("opacity") or 0.4)
        wm_pos = watermark.get("position") or "bottom-right"
        wm_w = int(W * wm_scale)
        margin = int(W * 0.02)
        pos_map = {
            "top-left":     (margin, margin),
            "top-right":    (f"W-w-{margin}", margin),
            "bottom-left":  (margin, f"H-h-{margin}"),
            "bottom-right": (f"W-w-{margin}", f"H-h-{margin}"),
            "center":       ("(W-w)/2", "(H-h)/2"),
        }
        ox, oy = pos_map.get(wm_pos, pos_map["bottom-right"])
        wm_label = "[wm_scaled]"
        wm_out = "[wm_out]"
        args += ["-loop", "1", "-i", wm_src]
        video_filters.append(
            f"[{input_idx}:v]scale={wm_w}:-1,"
            f"format=yuva420p,colorchannelmixer=aa={wm_opacity}{wm_label}"
        )
        video_filters.append(f"{cur_vlabel}{wm_label}overlay=x={ox}:y={oy}:eof_action=repeat{wm_out}")
        cur_vlabel = wm_out
        input_idx += 1

    # Build filter graph
    audio_outputs = [f.split("[")[-1].rstrip("]") for f in audio_filters]
    audio_outputs = [f"[{x}]" for x in audio_outputs]

    fc_parts = video_filters + audio_filters
    if audio_outputs:
        if len(audio_outputs) > 1:
            fc_parts.append(f"{''.join(audio_outputs)}amix=inputs={len(audio_outputs)}:dropout_transition=0[aout]")
        else:
            fc_parts.append(f"{audio_outputs[0]}anull[aout]")

    filter_complex = ";".join(fc_parts)
    args += ["-filter_complex", filter_complex, "-map", cur_vlabel]
    if audio_outputs:
        args += ["-map", "[aout]", "-c:a", "aac", "-b:a", "192k"]
    else:
        args += ["-an"]

    args += [
        "-c:v", "libx264", "-preset", "veryfast", "-crf", str(project.get("crf", 20)),
        "-pix_fmt", "yuv420p", "-r", str(fps), "-t", f"{duration}",
        "-progress", "pipe:1",
        str(out_path),
    ]

    print(f"[editor-render] job {jid} cmd:\n{shlex.join(args)}", flush=True)
    proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    last_pct = 0
    stderr_buf = []

    def _drain_stderr():
        if proc.stderr:
            for line in proc.stderr:
                stderr_buf.append(line)
                if len(stderr_buf) > 200:
                    stderr_buf.pop(0)

    err_t = threading.Thread(target=_drain_stderr, daemon=True)
    err_t.start()

    while True:
        line = proc.stdout.readline() if proc.stdout else ""
        if not line:
            if proc.poll() is not None:
                break
            time.sleep(0.05)
            continue
        if line.startswith("out_time_us="):
            try:
                us = int(line.split("=", 1)[1].strip() or 0)
                pct = max(0, min(99, int(us / 10000 / duration)))
                if pct != last_pct:
                    last_pct = pct
                    _set(jid, progress=pct)
            except Exception:
                pass
    rc = proc.wait()
    err_t.join(timeout=2)
    if rc != 0:
        err = "".join(stderr_buf)[-2000:]
        raise RuntimeError(f"ffmpeg exit {rc}: {err}")


def _run_job(jid: int):
    conn = get_connection()
    job = conn.execute(
        "SELECT j.*, p.timeline_json,p.width,p.height,p.fps,p.title,p.watermark_json "
        "FROM editor_render_jobs j JOIN editor_projects p ON p.id=j.project_id "
        "WHERE j.id=?", (jid,),
    ).fetchone()
    conn.close()
    if not job:
        return
    _set(jid, status="running", progress=1, error=None)
    try:
        tl = json.loads(job["timeline_json"] or "{}")
        try:
            overrides = json.loads(job["error"] or "{}") if job["error"] else {}
        except Exception:
            overrides = {}
        try:
            watermark = json.loads(job["watermark_json"] or "null") or {}
        except Exception:
            watermark = {}
        proj_cfg = {
            "width": int(overrides.get("width") or job["width"]),
            "height": int(overrides.get("height") or job["height"]),
            "fps": int(overrides.get("fps") or job["fps"]),
            "crf": int(overrides.get("crf") or 20),
            "watermark": watermark,
        }
        out = OUTPUT_DIR / f"render_{jid}_{int(time.time())}.mp4"
        _ffmpeg_render(proj_cfg, tl, out, jid)
        rel = f"/data/editor/output/{out.name}"
        _set(jid, status="done", progress=100, output_path=rel, error=None)
    except Exception as e:
        err = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        print(f"[editor-render] job {jid} FAILED:\n{err}", flush=True)
        _set(jid, status="error", error=str(e)[:1000])


def _worker():
    while True:
        try:
            jid = _q.get(timeout=60)
        except queue.Empty:
            continue
        try:
            _run_job(jid)
        except Exception as e:
            print(f"[editor-render] worker crash: {e}\n{traceback.format_exc()}", flush=True)
            try:
                _set(jid, status="error", error=str(e)[:500])
            except Exception:
                pass


def enqueue(jid: int):
    global _worker_started
    if not _worker_started:
        t = threading.Thread(target=_worker, daemon=True, name="editor-render")
        t.start()
        _worker_started = True
    _q.put(jid)
