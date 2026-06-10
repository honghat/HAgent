from __future__ import annotations

import os
import logging
from fastapi import APIRouter, HTTPException, UploadFile, Form
from api.services.db import get_db

router = APIRouter(prefix="/api/learn/stt", tags=["learn"])

WHISPER_SERVER = os.environ.get("WHISPER_SERVER")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "medium")


@router.get("")
async def check_stt():
    if not WHISPER_SERVER:
        return {"available": False, "reason": "WHISPER_SERVER not set"}
    import httpx
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(f"{WHISPER_SERVER}/health")
        return {"available": resp.is_success, "url": WHISPER_SERVER, "model": WHISPER_MODEL}
    except Exception:
        return {"available": False, "reason": "Server not reachable"}


@router.post("")
async def transcribe(
    audio: UploadFile,
    language: str = Form("en"),
    prompt: str = Form(""),
):
    import httpx
    content = await audio.read()
    ext = "webm"
    if audio.content_type:
        if "mp4" in audio.content_type:
            ext = "mp4"
        elif "ogg" in audio.content_type:
            ext = "ogg"
        elif "wav" in audio.content_type:
            ext = "wav"

    lang = language if language and language not in ("undefined", "null") else "en"
    user_prompt = prompt or ""
    if lang == "en" and not user_prompt:
        user_prompt = "This is an English speaking practice session. Please transcribe the audio accurately."

    # 1. Try Groq Cloud first
    if GROQ_API_KEY:
        try:
            files = {"file": (f"audio.{ext}", content, audio.content_type or "audio/webm")}
            data = {"model": "whisper-large-v3", "language": lang}
            if user_prompt:
                data["prompt"] = user_prompt
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    "https://api.groq.com/openai/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                    data=data,
                    files=files,
                )
            if resp.is_success:
                result = resp.json()
                return {"text": result.get("text", "")}
            logging.warning("Groq STT failed: %s", resp.text)
        except Exception as e:
            logging.warning("Groq STT error: %s", e)

    # 2. Fallback to local Whisper
    if not WHISPER_SERVER:
        raise HTTPException(status_code=503, detail="No STT provider available")
    try:
        files = {"file": (f"audio.{ext}", content, audio.content_type or "audio/webm")}
        data = {"model": WHISPER_MODEL, "language": "en", "response_format": "json"}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{WHISPER_SERVER}/v1/audio/transcriptions", data=data, files=files)
        if not resp.is_success:
            raise HTTPException(status_code=502, detail=f"Whisper error: {resp.status_code}")
        result = resp.json()
        return {"text": result.get("text", "")}
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="STT request timed out")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
