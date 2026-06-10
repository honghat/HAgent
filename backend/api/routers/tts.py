"""TTS endpoints: tất cả TTS gom về 1 cổng backend chính."""
from __future__ import annotations

import asyncio
import io
import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import edge_tts
import httpx
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

tts_router = APIRouter(prefix="/tts", tags=["tts"])
logger = logging.getLogger(__name__)
REPO_ROOT = Path(__file__).resolve().parents[3]

# Không cần service riêng, tất cả xử lý inline
PROVIDERS = {
    "edge": {"pm2": None, "url": None},
    "piper": {"pm2": "hagent-tts-piper", "url": os.getenv("HAGENT_PIPER_TTS_URL", "http://127.0.0.1:5001")},
    "lux": {"pm2": "hagent-tts-lux-tunnel", "url": os.getenv("HAGENT_LUX_TTS_URL", "http://127.0.0.1:8880")},
    "kokoro": {"pm2": "hagent-tts-kokoro-tunnel", "url": os.getenv("HAGENT_KOKORO_TTS_URL", "http://127.0.0.1:8881")},
    "google": {"pm2": None, "url": None},
    "linh": {"pm2": None, "url": None},
    "browser": {"pm2": None, "url": None},
}


class UnifiedTTSRequest(BaseModel):
    text: str
    server: str = "edge"
    voice: str = "vi-VN-HoaiMyNeural"
    rate: str = "+0%"
    pitch: str = "+0Hz"
    speed: Optional[float] = None


class ToggleRequest(BaseModel):
    server: str
    action: str  # on | off | restart


async def _http_alive(url: str, timeout: float = 1.5) -> bool:
    paths = ["/health", "/", "/tts"]
    for p in paths:
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.get(f"{url}{p}")
                if r.status_code < 500:
                    return True
        except Exception:
            continue
    return False


async def _pm2(*args: str) -> tuple[int, str]:
    pm2_bin = shutil.which("pm2") or "/usr/local/bin/pm2"
    proc = await asyncio.create_subprocess_exec(
        pm2_bin, *args,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    out, _ = await proc.communicate()
    return proc.returncode or 0, out.decode("utf-8", "replace")


async def _speak_edge_inline(text: str, voice: str, rate: str, pitch: str) -> bytes:
    """Edge TTS dùng built-in lib (không cần service riêng)."""
    output_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            output_path = tmp.name
        communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate, pitch=pitch)
        await communicate.save(output_path)
        return Path(output_path).read_bytes()
    finally:
        if output_path and Path(output_path).exists():
            try:
                Path(output_path).unlink()
            except Exception:
                pass


async def _speak_piper_inline(text: str, voice: str, speed: float = 1.0) -> bytes:
    """Piper TTS inline (không cần service riêng)."""
    try:
        from piper import PiperVoice
        from piper.config import SynthesisConfig
        import wave

        VOICE_DIR = Path(__file__).parent.parent.parent.parent / "tts" / "piper_voices"
        model_path = VOICE_DIR / "vi_VN-vais1000-medium.onnx"

        if not model_path.exists():
            raise HTTPException(500, f"Piper model not found: {model_path}")

        piper_voice = PiperVoice.load(str(model_path))
        config = SynthesisConfig(length_scale=1.0/speed)

        audio_bytes = io.BytesIO()
        with wave.open(audio_bytes, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(piper_voice.config.sample_rate)
            for chunk in piper_voice.synthesize(text, config):
                wav_file.writeframes(chunk.audio_int16_bytes)

        audio_bytes.seek(0)
        return audio_bytes.read()
    except ImportError:
        raise HTTPException(500, "Piper library not installed")
    except Exception as e:
        logger.exception("Piper TTS failed")
        raise HTTPException(500, f"Piper TTS failed: {e}")


async def _speak_google_tts(text: str, lang: str = 'vi', speed: float = 1.0) -> bytes:
    """Google TTS using gTTS library (free, language-based only)."""
    try:
        from gtts import gTTS
        import io

        # gTTS only supports language codes, not specific voices
        tts = gTTS(text=text, lang=lang, slow=(speed < 0.8))

        # Save to bytes
        fp = io.BytesIO()
        tts.write_to_fp(fp)
        fp.seek(0)
        return fp.read()
    except ImportError:
        raise HTTPException(500, "gTTS library not installed. Run: pip install gtts")
    except Exception as e:
        raise HTTPException(500, f"Google TTS failed: {e}")


async def _speak_linh_inline(text: str, speed: float = 1.0) -> bytes:
    """macOS Vietnamese Linh voice. Uses a temp file and deletes it immediately."""
    if not shutil.which("say"):
        raise HTTPException(500, "macOS say command not found")
    output_path = None
    try:
        with tempfile.NamedTemporaryFile(prefix="hagent-linh-", suffix=".m4a", delete=False) as tmp:
            output_path = tmp.name
        rate = str(max(120, min(320, int(200 * (speed or 1.0)))))
        result = await asyncio.to_thread(
            subprocess.run,
            [
                "say",
                "-v", "Linh",
                "-r", rate,
                "--file-format=m4af",
                "-o", output_path,
                text,
            ],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        if result.returncode != 0:
            raise HTTPException(500, result.stderr.strip() or "Không tạo được giọng Linh")
        data = Path(output_path).read_bytes()
        if not data:
            raise HTTPException(500, "Giọng Linh trả về audio rỗng")
        return data
    finally:
        if output_path and Path(output_path).exists():
            try:
                Path(output_path).unlink()
            except Exception:
                pass


async def _speak_via_http(server: str, payload: dict, path: str = "/tts") -> tuple[bytes, str]:
    info = PROVIDERS[server]
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(f"{info['url']}{path}", json=payload)
        if r.status_code != 200:
            raise HTTPException(503, f"{server} server lỗi: {r.text[:200]}")
        return r.content, r.headers.get("content-type", "audio/mpeg").split(";")[0]


async def _pm2_state(name: str) -> str:
    """Trả về 'online' | 'stopped' | 'errored' | 'unknown' từ `pm2 jlist`."""
    if not name:
        return "unknown"
    code, out = await _pm2("jlist")
    if code != 0:
        return "unknown"
    try:
        import json as _json
        procs = _json.loads(out)
    except Exception:
        return "unknown"
    for p in procs:
        if p.get("name") == name:
            return (p.get("pm2_env") or {}).get("status", "unknown")
    return "stopped"


@tts_router.get("/status")
async def tts_status() -> dict:
    lux_alive = await _http_alive(PROVIDERS["lux"]["url"]) if PROVIDERS["lux"]["url"] else False
    kokoro_alive = await _http_alive(PROVIDERS["kokoro"]["url"]) if PROVIDERS["kokoro"]["url"] else False
    piper_alive = await _http_alive(PROVIDERS["piper"]["url"]) if PROVIDERS["piper"]["url"] else False
    piper_pm2 = await _pm2_state(PROVIDERS["piper"]["pm2"])
    return {
        "edge": {"available": True, "service_alive": True, "label": "Edge (Microsoft)", "pm2": None},
        "google": {"available": True, "service_alive": True, "label": "Google TTS (gTTS)", "pm2": None},
        "linh": {"available": bool(shutil.which("say")), "service_alive": bool(shutil.which("say")), "label": "Linh (macOS)", "pm2": None},
        "browser": {"available": True, "service_alive": True, "label": "Browser TTS", "pm2": None},
        "piper": {
            "available": piper_alive,
            "service_alive": piper_alive,
            "pm2_status": piper_pm2,
            "label": "Piper (local)",
            "pm2": PROVIDERS["piper"]["pm2"],
        },
        "lux": {"available": lux_alive, "service_alive": lux_alive, "label": "Lux (remote HAgent/tts)", "pm2": PROVIDERS["lux"]["pm2"]},
        "kokoro": {"available": kokoro_alive, "service_alive": kokoro_alive, "label": "Kokoro (remote HAgent/tts)", "pm2": PROVIDERS["kokoro"]["pm2"]},
    }


async def _run_remote_tts(provider: str, action: str) -> dict:
    """Quản lý TTS remote/tunnel theo layout ~/HAgent/tts."""
    script = REPO_ROOT / "scripts" / ("tts-remote-off.sh" if action == "off" else "tts-remote-tunnel.sh")
    if not script.exists():
        raise HTTPException(500, f"Missing TTS remote script: {script}")

    proc = await asyncio.create_subprocess_exec(
        "bash", str(script), provider,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    out, _ = await proc.communicate()
    text = out.decode("utf-8", "replace").strip()
    if proc.returncode != 0:
        raise HTTPException(502, f"Không bật/tắt được {provider} TTS remote: {text[-1200:]}")
    return {
        "ok": True,
        "server": provider,
        "action": action,
        "message": text.splitlines()[-1] if text else f"{provider} {action} ok",
        "output": text[-2000:],
    }


async def _run_lux_tunnel(action: str) -> dict:
    """Quản lý Lux TTS tunnel đến máy remote Linux."""
    if action == "off":
        return await _run_remote_tts("lux", "off")
    return await _run_remote_tts("lux", "on")


async def _run_kokoro_tunnel(action: str) -> dict:
    """Quản lý Kokoro TTS tunnel đến máy remote Linux."""
    if action == "off":
        return await _run_remote_tts("kokoro", "off")
    return await _run_remote_tts("kokoro", "on")


@tts_router.post("/toggle")
async def tts_toggle(req: ToggleRequest) -> dict:
    if req.server not in PROVIDERS:
        raise HTTPException(400, f"Unknown server: {req.server}")
    if req.action not in {"on", "off", "restart"}:
        raise HTTPException(400, f"Unknown action: {req.action}")

    # Lux, Kokoro, Piper cần toggle
    if req.server == "lux":
        return await _run_lux_tunnel(req.action)
    if req.server == "kokoro":
        return await _run_kokoro_tunnel(req.action)
    if req.server == "piper":
        # Bật/tắt/restar Piper local server qua pm2
        name = PROVIDERS["piper"]["pm2"]
        if req.action == "on":
            code, out = await _pm2("start", name) if (await _pm2_state(name)) in ("stopped", "errored", "unknown") else (0, "đã chạy")
            # Nếu pm2 không thấy process (unknown) thì load lại từ ecosystem
            if (await _pm2_state(name)) == "stopped" and code != 0:
                from pathlib import Path as _P
                eco = str(_P(__file__).parent.parent.parent.parent / "ecosystem.config.cjs")
                code, out = await _pm2("start", eco, "--only", name)
        elif req.action == "off":
            code, out = await _pm2("stop", name)
        else:  # restart
            code, out = await _pm2("restart", name)
        return {
            "ok": code == 0,
            "server": "piper",
            "action": req.action,
            "message": (out or "").strip() or f"Piper {req.action} ok",
        }

    # Edge, Google, Linh, Browser không cần toggle
    return {"ok": True, "server": req.server, "action": req.action, "message": f"{req.server} luôn sẵn sàng"}


@tts_router.post("/speak")
async def unified_speak(req: UnifiedTTSRequest) -> Response:
    if not req.text.strip():
        raise HTTPException(400, "Text is required")
    server = (req.server or "edge").lower()

    # Browser TTS is handled client-side
    if server == "browser":
        raise HTTPException(400, "Browser TTS is handled client-side")

    if server not in PROVIDERS:
        raise HTTPException(400, f"Unknown server: {server}")

    try:
        if server == "edge":
            audio = await _speak_edge_inline(req.text, req.voice, req.rate, req.pitch)
            media_type = "audio/mpeg"
        elif server == "google":
            # Extract language from voice (e.g., vi-VN-Standard-A -> vi)
            lang = req.voice.split('-')[0] if '-' in req.voice else 'vi'
            audio = await _speak_google_tts(req.text, lang, req.speed or 1.0)
            media_type = "audio/mpeg"
        elif server == "linh":
            audio = await _speak_linh_inline(req.text, req.speed or 1.0)
            media_type = "audio/mp4"
        elif server == "piper":
            audio = await _speak_piper_inline(req.text, req.voice, req.speed or 1.0)
            media_type = "audio/wav"
        elif server == "lux":
            lux_voice = req.voice if req.voice in {"en_us", "en_female", "paul", "en_male"} else "en_female"
            try:
                audio, media_type = await _speak_via_http("lux", {
                    "text": req.text, "voice": lux_voice, "speed": req.speed or 1.0,
                }, path="/v1/audio/speech")
            except HTTPException as e:
                if "Kernel size" in str(e.detail):
                    raise HTTPException(400, "Lux TTS yêu cầu văn bản dài hơn (tối thiểu ~10 ký tự)")
                raise
        elif server == "kokoro":
            audio, media_type = await _speak_via_http("kokoro", {
                "text": req.text, "voice": req.voice or "af_sky", "speed": req.speed or 1.0,
            }, path="/tts")
        return Response(content=audio, media_type=media_type, headers={"Cache-Control": "no-cache"})
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("TTS failed")
        raise HTTPException(500, f"TTS generation failed: {e}")
