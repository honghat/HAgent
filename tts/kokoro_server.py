"""Small Kokoro TTS HTTP server for HAgent remote TTS.

The endpoint intentionally mirrors the simple `/tts` JSON contract used by the
frontend/backend bridge:
    {"text": "...", "voice": "af_sky", "speed": 1.0}
"""
from __future__ import annotations

import io
import os
from functools import lru_cache
from typing import Optional

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel


app = FastAPI(title="HAgent Kokoro TTS", version="1.0.0")


class TTSRequest(BaseModel):
    text: str
    voice: str = "af_sky"
    speed: Optional[float] = 1.0


def _lang_code_for_voice(voice: str) -> str:
    # Kokoro uses "a" for American English and "b" for British English.
    if voice.startswith(("bf_", "bm_")):
        return "b"
    return "a"


@lru_cache(maxsize=4)
def _pipeline(lang_code: str):
    try:
        from kokoro import KPipeline
    except Exception as exc:  # pragma: no cover - depends on remote package
        raise RuntimeError("Kokoro package is not installed in the remote venv") from exc
    return KPipeline(lang_code=lang_code)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "engine": "kokoro", "port": int(os.getenv("KOKORO_PORT", "8881"))}


@app.post("/tts")
def synthesize(req: TTSRequest) -> Response:
    text = req.text.strip()
    if not text:
        raise HTTPException(400, "Text is required")

    try:
        pipeline = _pipeline(_lang_code_for_voice(req.voice))
        chunks = []
        for _graphemes, _phonemes, audio in pipeline(
            text,
            voice=req.voice or "af_sky",
            speed=req.speed or 1.0,
        ):
            chunks.append(np.asarray(audio, dtype=np.float32))
        if not chunks:
            raise RuntimeError("Kokoro returned no audio")

        wav = io.BytesIO()
        sf.write(wav, np.concatenate(chunks), 24000, format="WAV")
        return Response(wav.getvalue(), media_type="audio/wav")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Kokoro TTS failed: {exc}") from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("KOKORO_PORT", "8881")))
