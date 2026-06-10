#!/usr/bin/env python3
"""Whisper STT server — faster-whisper GPU (chính), Groq cloud (fallback)."""
from __future__ import annotations

import io
import os
import subprocess
import tempfile
import wave
from threading import Lock

import requests
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse

PORT = int(os.environ.get("WHISPER_PORT", "9001"))
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.environ.get("GROQ_WHISPER_MODEL", "whisper-large-v3")
GROQ_URL = os.environ.get("GROQ_STT_URL", "https://api.groq.com/openai/v1/audio/transcriptions")
GROQ_TIMEOUT = int(os.environ.get("GROQ_STT_TIMEOUT", "20"))

FASTER_WHISPER_MODEL = os.environ.get("FASTER_WHISPER_MODEL", "small")
FASTER_WHISPER_DEVICE = os.environ.get("FASTER_WHISPER_DEVICE", "")
FASTER_WHISPER_COMPUTE_TYPE = os.environ.get("FASTER_WHISPER_COMPUTE_TYPE", "")
VI_PROMPT = os.environ.get(
    "WHISPER_VI_PROMPT",
    "Xin chào, đây là một đoạn hội thoại tiếng Việt có dấu đầy đủ.",
)

app = FastAPI(title="Whisper STT")
_fw_model = None
_fw_lock = Lock()


def _resolve_device() -> tuple[str, str]:
    device = FASTER_WHISPER_DEVICE.strip().lower()
    compute = FASTER_WHISPER_COMPUTE_TYPE.strip().lower()
    if not device or device == "auto":
        try:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            device = "cpu"
    if not compute:
        compute = "float16" if device == "cuda" else "int8"
    return device, compute


def _load_fw():
    global _fw_model
    if _fw_model is not None:
        return _fw_model
    with _fw_lock:
        if _fw_model is not None:
            return _fw_model
        from faster_whisper import WhisperModel

        device, compute = _resolve_device()
        print(f"⚡ Loading faster-whisper model={FASTER_WHISPER_MODEL} device={device} compute={compute}")
        _fw_model = WhisperModel(FASTER_WHISPER_MODEL, device=device, compute_type=compute)
        return _fw_model


def _to_wav_16k_mono(audio_bytes: bytes) -> bytes:
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error",
         "-i", "pipe:0", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
         "-f", "wav", "pipe:1"],
        input=audio_bytes, capture_output=True, check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {proc.stderr.decode(errors='ignore')[:300]}")
    return proc.stdout


def _transcribe_faster_whisper(audio_bytes: bytes, language: str, prompt: str) -> str:
    model = _load_fw()
    wav_bytes = _to_wav_16k_mono(audio_bytes)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(wav_bytes)
        tmp_path = tmp.name
    try:
        segments, _info = model.transcribe(
            tmp_path,
            language=(language or None),
            initial_prompt=(prompt or None),
            vad_filter=True,
            beam_size=5,
        )
        return " ".join(seg.text.strip() for seg in segments).strip()
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _try_groq(file_content: bytes, mime: str, filename: str, language: str, prompt: str, temperature: str) -> str | None:
    if not GROQ_API_KEY:
        return None
    try:
        files = {"file": (filename or "audio.webm", file_content, mime or "audio/webm")}
        data = {"model": GROQ_MODEL, "temperature": temperature}
        if language:
            data["language"] = language
        if prompt:
            data["prompt"] = prompt
        resp = requests.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            files=files,
            data=data,
            timeout=GROQ_TIMEOUT,
        )
        if resp.status_code == 200:
            return (resp.json().get("text") or "").strip() or None
        print(f"❌ Groq HTTP {resp.status_code}: {resp.text[:200]}")
    except Exception as exc:  # noqa: BLE001
        print(f"❌ Groq lỗi: {exc}")
    return None


@app.get("/health")
def health():
    device, compute = _resolve_device()
    return {
        "status": "ok",
        "engine": "faster-whisper",
        "model": FASTER_WHISPER_MODEL,
        "device": device,
        "compute_type": compute,
        "loaded": _fw_model is not None,
        "groq_available": bool(GROQ_API_KEY),
        "port": PORT,
    }


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form(""),
    language: str = Form(""),
    response_format: str = Form("json"),
    prompt: str = Form(""),
    temperature: str = Form("0"),
):
    audio = await file.read()
    if not audio:
        return JSONResponse({"error": "No audio data"}, status_code=400)

    lang = (language or "").strip().lower()
    if not prompt and lang.startswith("vi"):
        prompt = VI_PROMPT

    try:
        text = _transcribe_faster_whisper(audio, language=lang, prompt=prompt)
        if text:
            return JSONResponse({"text": text, "language": lang, "source": "faster-whisper"})
        print("⚠️ faster-whisper rỗng, thử Groq fallback...")
    except Exception as exc:  # noqa: BLE001
        print(f"⚠️ faster-whisper lỗi: {exc}, thử Groq fallback...")

    text = _try_groq(audio, file.content_type or "audio/webm", file.filename or "", lang, prompt, temperature)
    if text:
        return JSONResponse({"text": text, "language": lang, "source": "groq"})

    return JSONResponse({"error": "STT failed (faster-whisper + Groq)"}, status_code=500)


if __name__ == "__main__":
    import uvicorn

    print(f"🚀 Whisper STT sẵn sàng tại port {PORT}")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
