#!/usr/bin/env python3
"""
TTS Server (Edge-TTS + Piper Fallback)
Ưu tiên Edge-TTS để tiết kiệm RAM. Chỉ dùng Piper khi mất mạng.
"""
import os, io, wave, asyncio, edge_tts, traceback
from flask import Flask, request, send_file, jsonify

app = Flask(__name__)
VOICE_DIR = os.path.join(os.path.dirname(__file__), 'piper_voices')
voices = {} # Chứa Piper models (Lazy Load)

def load_piper_voice(name):
    """Load Piper model khi thực sự cần"""
    if name not in voices:
        from piper import PiperVoice
        model_path = os.path.join(VOICE_DIR, 'vi_VN-vais1000-medium.onnx')
        if os.path.exists(model_path):
            print(f"⏳ Loading Piper fallback model...")
            voices[name] = PiperVoice.load(model_path)
    return voices.get(name)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'primary': 'Edge-TTS', 'local_piper_loaded': len(voices) > 0})

async def get_edge_tts(text, voice, speed):
    # Map voice name
    edge_voice = "vi-VN-HoaiMyNeural" if "female" in voice else "vi-VN-NamMinhNeural"
    rate = f"{int((speed - 1) * 100):+d}%"
    communicate = edge_tts.Communicate(text, edge_voice, rate=rate)
    audio_data = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data += chunk["data"]
    return audio_data

@app.route('/v1/audio/speech', methods=['POST'])
def synthesize():
    data = request.json
    text = data.get('text', '')
    voice_name = data.get('voice', 'vi_female')
    speed = data.get('speed', 1.0)

    if not text:
        return jsonify({'error': 'No text provided'}), 400

    # --- 1. THỬ DÙNG EDGE-TTS TRƯỚC (FREE RAM) ---
    try:
        print(f"🌐 Đang gọi Edge-TTS cho: {text[:20]}...")
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        audio_data = loop.run_until_complete(get_edge_tts(text, voice_name, speed))
        
        if audio_data:
            return send_file(io.BytesIO(audio_data), mimetype='audio/mpeg')
    except Exception as e:
        print(f"⚠️ Edge-TTS lỗi (có thể mất mạng): {e}")

    # --- 2. FALLBACK SANG PIPER (LOCAL) ---
    try:
        print(f"🏠 Đang dùng Piper Local làm dự phòng...")
        voice = load_piper_voice('vi_female')
        if not voice:
            return jsonify({'error': 'No local model available'}), 500
            
        from piper.config import SynthesisConfig
        config = SynthesisConfig(length_scale=1.0/speed)
        audio_bytes = io.BytesIO()
        with wave.open(audio_bytes, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(voice.config.sample_rate)
            for chunk in voice.synthesize(text, config):
                wav_file.writeframes(chunk.audio_int16_bytes)
        
        audio_bytes.seek(0)
        return send_file(audio_bytes, mimetype='audio/wav')
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("🎙️  Vietnamese TTS Server (Hybrid: Edge-TTS + Piper)")
    print("🌐 Port: 5001")
    app.run(host='0.0.0.0', port=5001, debug=False)
