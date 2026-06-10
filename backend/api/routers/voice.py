from __future__ import annotations

import asyncio
import io
import json
import logging
import os
import shutil
from pathlib import Path
from typing import Optional

import requests
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

REPO_ROOT = Path(__file__).resolve().parents[3]
STT_URL = os.environ.get("HAGENT_STT_URL", "http://127.0.0.1:9000/v1/audio/transcriptions")
SENSEVOICE_STT_URL = os.environ.get("HAGENT_SENSEVOICE_STT_URL", STT_URL)
WHISPER_STT_URL = os.environ.get("HAGENT_WHISPER_STT_URL", "http://127.0.0.1:9001/v1/audio/transcriptions")
STT_TIMEOUT = int(os.environ.get("HAGENT_STT_TIMEOUT", "60"))
MAX_UTTERANCE_BYTES = 25 * 1024 * 1024  # 25MB hard cap
STT_HEALTH_URL = os.environ.get("HAGENT_STT_HEALTH_URL", STT_URL.replace("/v1/audio/transcriptions", "/health"))
SENSEVOICE_HEALTH_URL = os.environ.get("HAGENT_SENSEVOICE_HEALTH_URL", SENSEVOICE_STT_URL.replace("/v1/audio/transcriptions", "/health"))
WHISPER_HEALTH_URL = os.environ.get("HAGENT_WHISPER_HEALTH_URL", WHISPER_STT_URL.replace("/v1/audio/transcriptions", "/health"))
STT_TUNNEL_SCRIPT = os.environ.get("HAGENT_STT_TUNNEL_SCRIPT", str(REPO_ROOT / "scripts" / "stt-remote-tunnel.sh"))
STT_REMOTE_OFF_SCRIPT = os.environ.get("HAGENT_STT_OFF_SCRIPT", str(REPO_ROOT / "scripts" / "stt-remote-off.sh"))
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "").strip()
GROQ_URL = os.environ.get("GROQ_STT_URL", "https://api.groq.com/openai/v1/audio/transcriptions")
GROQ_MODEL = os.environ.get("GROQ_STT_MODEL", "whisper-large-v3")


class STTToggleRequest(BaseModel):
    action: str  # on | off | restart
    provider: str = "sensevoice"


def _ext_for_mime(mime: str) -> str:
    if "mp4" in mime:
        return "mp4"
    if "ogg" in mime:
        return "ogg"
    if "wav" in mime:
        return "wav"
    if "mpeg" in mime or "mp3" in mime:
        return "mp3"
    return "webm"


def _post_openai_style_stt(
    url: str,
    audio_bytes: bytes,
    filename: str,
    mime: str,
    data: dict,
    provider: str,
) -> str:
    files = {"file": (filename, io.BytesIO(audio_bytes), mime)}
    resp = requests.post(url, files=files, data=data, timeout=STT_TIMEOUT)
    if resp.status_code != 200:
        logger.warning("STT HTTP %s from %s: %s", resp.status_code, url, resp.text[:200])
        detail = resp.text[:300]
        try:
            detail = resp.json().get("error") or resp.json().get("detail") or detail
        except ValueError:
            pass
        raise HTTPException(status_code=502, detail=f"{provider} STT server error: {detail}")
    payload = resp.json()
    text = (payload.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=500, detail="No transcript returned")
    return text


def _call_stt(
    audio_bytes: bytes,
    mime: str,
    language: str = "",
    prompt: str = "",
    temperature: str = "0",
    provider: str = "auto",
) -> str:
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="No audio data")

    selected = (provider or "groq").strip().lower()
    if selected in {"remote", "local", "9000"}:
        selected = "sensevoice"
    if selected not in {"auto", "groq", "sensevoice", "whisper"}:
        raise HTTPException(status_code=400, detail="provider must be groq/sensevoice/whisper")

    filename = f"audio.{_ext_for_mime(mime)}"
    data = {"temperature": temperature}
    if language:
        data["language"] = language
    if prompt:
        data["prompt"] = prompt

    if selected in {"auto", "groq"} and GROQ_API_KEY:
        try:
            files = {"file": (filename, io.BytesIO(audio_bytes), mime)}
            groq_headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}
            groq_data = {"model": GROQ_MODEL, "temperature": temperature}
            if language:
                groq_data["language"] = language
            if prompt:
                groq_data["prompt"] = prompt
            groq_resp = requests.post(
                GROQ_URL,
                files=files,
                data=groq_data,
                headers=groq_headers,
                timeout=STT_TIMEOUT,
            )
            if groq_resp.status_code == 200:
                payload = groq_resp.json()
                text = (payload.get("text") or "").strip()
                if text:
                    return text
            logger.warning("Groq STT HTTP %s: %s", groq_resp.status_code, groq_resp.text[:200])
        except requests.RequestException as exc:
            logger.warning("Groq STT call failed: %s", exc)

    if selected == "groq":
        raise HTTPException(status_code=502, detail="Groq STT unavailable")

    try:
        if selected == "whisper":
            return _post_openai_style_stt(WHISPER_STT_URL, audio_bytes, filename, mime, data, "Whisper")
        return _post_openai_style_stt(SENSEVOICE_STT_URL, audio_bytes, filename, mime, data, "SenseVoice")
    except requests.RequestException as exc:
        logger.warning("STT call failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"{selected} STT server unreachable: {exc}")


async def _pm2(*args: str) -> tuple[int, str]:
    pm2_bin = shutil.which("pm2") or "/usr/local/bin/pm2"
    proc = await asyncio.create_subprocess_exec(
        pm2_bin,
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    out, _ = await proc.communicate()
    return proc.returncode or 0, out.decode("utf-8", "replace")


async def _run_script(path: str, *args: str) -> tuple[int, str]:
    proc = await asyncio.create_subprocess_exec(
        "bash",
        path,
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    out, _ = await proc.communicate()
    return proc.returncode or 0, out.decode("utf-8", "replace")


@router.get("/stt/status")
async def stt_status() -> dict:
    def alive(url: str) -> bool:
        try:
            resp = requests.get(url, timeout=1.5)
            return resp.status_code < 500
        except requests.RequestException:
            return False

    sensevoice_tunnel = "stopped"
    whisper_tunnel = "stopped"
    code, out = await _pm2("jlist")
    if code == 0:
        if "hagent-stt-sensevoice-tunnel" in out or "hagent-stt-tunnel" in out:
            sensevoice_tunnel = "registered"
        if "hagent-stt-whisper-tunnel" in out:
            whisper_tunnel = "registered"

    return {
        "service_alive": alive(STT_HEALTH_URL),
        "default_provider": "groq",
        "providers": ["groq", "sensevoice", "whisper"],
        "groq_available": bool(GROQ_API_KEY),
        "sensevoice": {
            "service_alive": alive(SENSEVOICE_HEALTH_URL),
            "tunnel_pm2": sensevoice_tunnel,
            "url": SENSEVOICE_STT_URL,
        },
        "whisper": {
            "service_alive": alive(WHISPER_HEALTH_URL),
            "tunnel_pm2": whisper_tunnel,
            "url": WHISPER_STT_URL,
        },
        "sensevoice_url": SENSEVOICE_STT_URL,
        "whisper_url": WHISPER_STT_URL,
        "health_url": STT_HEALTH_URL,
        "tunnel_pm2": sensevoice_tunnel,
    }


@router.post("/stt/toggle")
async def stt_toggle(req: STTToggleRequest) -> dict:
    action = (req.action or "").strip().lower()
    if action not in {"on", "off", "restart"}:
        raise HTTPException(status_code=400, detail="action must be on/off/restart")
    provider = (req.provider or "sensevoice").strip().lower()
    if provider not in {"sensevoice", "whisper"}:
        raise HTTPException(status_code=400, detail="provider must be sensevoice/whisper")
    pm2_name = f"hagent-stt-{provider}-tunnel"

    if action in {"on", "restart"}:
        if action == "restart":
            await _pm2("delete", pm2_name)
        code, out = await _run_script(STT_TUNNEL_SCRIPT, provider)
        return {"ok": code == 0, "provider": provider, "action": action, "message": out.strip() or f"{provider} tunnel started"}

    code, out = await _run_script(STT_REMOTE_OFF_SCRIPT, provider)
    await _pm2("delete", pm2_name)
    return {"ok": code == 0, "provider": provider, "action": "off", "message": out.strip() or f"{provider} tunnel stopped"}


@router.post("/stt")
async def stt(
    audio: UploadFile = File(...),
    language: str = Form(""),
    prompt: str = Form(""),
    temperature: str = Form("0"),
    provider: str = Form("groq"),
):
    audio_bytes = await audio.read()
    mime = audio.content_type or "audio/webm"
    text = _call_stt(audio_bytes, mime, language=language, prompt=prompt, temperature=temperature, provider=provider)
    return {"text": text, "provider": provider or "groq"}


def _transcribe(audio_bytes: bytes, language: str, mime: str, provider: str = "groq") -> Optional[str]:
    if not audio_bytes:
        return None
    try:
        return _call_stt(audio_bytes, mime or "audio/webm", language=language or "vi", provider=provider)
    except HTTPException:
        return None


@router.websocket("/ws/voice")
async def voice_ws(ws: WebSocket) -> None:
    await ws.accept()
    await ws.send_json({"type": "ready"})

    buffer = bytearray()
    language = "vi"
    mime = "audio/webm"
    provider = "groq"

    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break

            if "bytes" in msg and msg["bytes"] is not None:
                chunk = msg["bytes"]
                if len(buffer) + len(chunk) > MAX_UTTERANCE_BYTES:
                    await ws.send_json({
                        "type": "error",
                        "message": "Utterance vượt 25MB, đã hủy."
                    })
                    buffer.clear()
                    continue
                buffer.extend(chunk)
                continue

            text = msg.get("text")
            if not text:
                continue
            try:
                event = json.loads(text)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "JSON không hợp lệ"})
                continue

            ev_type = event.get("type")
            if ev_type == "start":
                buffer.clear()
                language = (event.get("language") or "vi").strip() or "vi"
                mime = (event.get("mime") or "audio/webm").strip() or "audio/webm"
                provider = (event.get("provider") or "groq").strip() or "groq"
                continue

            if ev_type == "stop":
                audio = bytes(buffer)
                buffer.clear()
                transcript = _transcribe(audio, language, mime, provider=provider)
                if transcript:
                    await ws.send_json({"type": "final", "text": transcript})
                else:
                    await ws.send_json({
                        "type": "error",
                        "message": "Không nhận diện được giọng nói."
                    })
                continue

            if ev_type == "ping":
                await ws.send_json({"type": "pong"})
                continue

            await ws.send_json({"type": "error", "message": f"Loại sự kiện không biết: {ev_type}"})

    except WebSocketDisconnect:
        return
    except Exception as exc:  # noqa: BLE001
        logger.exception("voice_ws lỗi")
        try:
            await ws.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
