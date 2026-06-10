#!/usr/bin/env python3
from __future__ import annotations

import io
import os
import subprocess
import wave
from threading import Lock

import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse

APP_HOST = os.environ.get("SENSEVOICE_HOST", "0.0.0.0")
APP_PORT = int(os.environ.get("SENSEVOICE_PORT", os.environ.get("WHISPER_PORT", "9000")))
MODEL_DIR = os.environ.get("SENSEVOICE_MODEL", "iic/SenseVoiceSmall")
ENABLE_VAD = os.environ.get("SENSEVOICE_VAD", "1") not in ("0", "false", "False", "")
VAD_MAX_SEG_MS = int(os.environ.get("SENSEVOICE_VAD_MAX_SEG_MS", "30000"))
BATCH_SIZE_S = int(os.environ.get("SENSEVOICE_BATCH_SIZE_S", "60"))
MERGE_LENGTH_S = int(os.environ.get("SENSEVOICE_MERGE_LENGTH_S", "15"))


def _resolve_device() -> str:
    forced = os.environ.get("SENSEVOICE_DEVICE", "").strip().lower()
    if forced and forced != "auto":
        return forced
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda:0"
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


DEVICE = _resolve_device()

app = FastAPI(title="SenseVoice STT Server")
_model = None
_lock = Lock()


def _decode_to_pcm_f32_16k(audio_bytes: bytes) -> np.ndarray:
    proc = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            "pipe:0",
            "-ar",
            "16000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            "-f",
            "wav",
            "pipe:1",
        ],
        input=audio_bytes,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode(errors="ignore")[:300])

    with wave.open(io.BytesIO(proc.stdout), "rb") as wf:
        frames = wf.readframes(wf.getnframes())
    pcm_i16 = np.frombuffer(frames, dtype=np.int16)
    return pcm_i16.astype(np.float32) / 32768.0


def _load_model():
    global _model
    if _model is not None:
        return _model

    with _lock:
        if _model is not None:
            return _model

        from funasr import AutoModel

        kwargs = dict(
            model=MODEL_DIR,
            trust_remote_code=True,
            disable_update=True,
            device=DEVICE,
        )
        if ENABLE_VAD:
            kwargs["vad_model"] = "fsmn-vad"
            kwargs["vad_kwargs"] = {"max_single_segment_time": VAD_MAX_SEG_MS}
        _model = AutoModel(**kwargs)
        return _model


def _postprocess(raw: str) -> str:
    try:
        from funasr.utils.postprocess_utils import rich_transcription_postprocess
        return rich_transcription_postprocess(raw).strip()
    except Exception:
        import re
        return re.sub(r"<\|[^|>]*\|>", "", raw).strip()


def _extract_text(result: object) -> str:
    if isinstance(result, list) and result:
        first = result[0]
        if isinstance(first, dict):
            return str(first.get("text", ""))
    if isinstance(result, dict):
        return str(result.get("text", ""))
    return ""


SUPPORTED_LANGS = {"auto", "zh", "en", "yue", "ja", "ko", "nospeech"}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "engine": "sensevoice",
        "model": MODEL_DIR,
        "device": DEVICE,
        "vad": ENABLE_VAD,
        "loaded": _model is not None,
        "port": APP_PORT,
        "supported_languages": sorted(SUPPORTED_LANGS),
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
    try:
        audio_bytes = await file.read()
        if not audio_bytes:
            return JSONResponse({"error": "No audio data"}, status_code=400)

        audio = _decode_to_pcm_f32_16k(audio_bytes)
        stt_model = _load_model()
        req_lang = (language or "").strip().lower()
        lang = req_lang if req_lang in SUPPORTED_LANGS else "auto"

        gen_kwargs = dict(
            input=audio,
            cache={},
            language=lang,
            use_itn=True,
            ban_emo_unk=True,
        )
        if ENABLE_VAD:
            gen_kwargs.update(
                batch_size_s=BATCH_SIZE_S,
                merge_vad=True,
                merge_length_s=MERGE_LENGTH_S,
            )

        result = stt_model.generate(**gen_kwargs)
        text = _postprocess(_extract_text(result))

        if not text:
            return JSONResponse({"error": "No transcript returned"}, status_code=500)

        return JSONResponse({"text": text, "source": "sensevoice", "language": lang})
    except Exception as exc:  # noqa: BLE001
        return JSONResponse({"error": f"SenseVoice failed: {exc}"}, status_code=500)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=APP_HOST, port=APP_PORT)
