#!/usr/bin/env python3
"""LuxTTS + Whisper STT Server - chạy: python server.py"""
import io, os, sys, tempfile
from pathlib import Path
import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="LuxTTS + Whisper Server")

VOICE_DIR = Path(__file__).parent / "voices"
VOICE_DIR.mkdir(exist_ok=True)

lux = None
encoded_voices = {}
whisper_model = None

def get_whisper():
    global whisper_model
    if whisper_model is None:
        from faster_whisper import WhisperModel
        model_size = os.environ.get("WHISPER_MODEL", "medium")
        device = "cpu"
        print(f"Loading Whisper {model_size}...")
        whisper_model = WhisperModel(model_size, device=device, compute_type="int8")
        print(f"Whisper {model_size} ready!")
    return whisper_model

def get_tts():
    global lux
    if lux is None:
        from zipvoice.luxvoice import LuxTTS
        device = "mps" if sys.platform == "darwin" else "cpu"
        print(f"⏳ Loading LuxTTS on {device} (Lazy Load)...")
        lux = LuxTTS("YatharthS/LuxTTS", device=device)
        print("✅ LuxTTS ready!")
    return lux

def encode_voice(name: str, path: str):
    model = get_tts()
    if name not in encoded_voices:
        print(f"⏳ Encoding voice: {name}")
        encoded_voices[name] = model.encode_prompt(path, rms=0.01)
    return encoded_voices[name]

class TTSRequest(BaseModel):
    text: str
    voice: str = "default"
    speed: float = 1.0

@app.get("/health")
def health():
    return {"status": "ok", "voices": list(encoded_voices.keys()), "loaded": lux is not None, "whisper": whisper_model is not None}

@app.post("/v1/audio/transcriptions")
async def transcribe(file: UploadFile = File(...)):
    try:
        model = get_whisper()
        data = await file.read()
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        try:
            segments, _ = model.transcribe(tmp_path, language="en", beam_size=5)
            text = " ".join(s.text.strip() for s in segments)
        finally:
            os.unlink(tmp_path)
        return {"text": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/audio/speech")
async def tts(req: TTSRequest):
    try:
        model = get_tts()
        voice_files = list(VOICE_DIR.glob("*.wav"))
        
        voice_name = req.voice
        voice_path = VOICE_DIR / f"{voice_name}.wav"
        
        if not voice_path.exists():
            if voice_files:
                voice_name = voice_files[0].stem
                voice_path = VOICE_DIR / f"{voice_name}.wav"
            else:
                raise HTTPException(status_code=400, detail="Chưa có file giọng mẫu trong thư mục voices/")
        
        prompt = encode_voice(voice_name, str(voice_path))
        
        import soundfile as sf
        import numpy as np
        wav = model.generate_speech(req.text, prompt, num_steps=4)
        wav = wav.numpy().squeeze()
        
        if req.speed != 1.0:
            import librosa
            wav = librosa.effects.time_stretch(wav, rate=req.speed)
        
        buf = io.BytesIO()
        sf.write(buf, wav, 48000, format="WAV")
        buf.seek(0)
        return StreamingResponse(buf, media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=speech.wav"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/voices/upload")
async def upload_voice(name: str):
    return {"message": f"Đặt file WAV vào {VOICE_DIR}/{name}.wav rồi gọi /voices/reload"}

@app.post("/voices/reload")
def reload_voices():
    encoded_voices.clear()
    for f in VOICE_DIR.glob("*.wav"):
        encode_voice(f.stem, str(f))
    return {"voices": list(encoded_voices.keys())}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8880, log_level="warning")
