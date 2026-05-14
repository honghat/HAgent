#!/usr/bin/env python3
"""
Whisper Hybrid Server (Groq + Local Whisper.cpp Fallback)
Ưu tiên dùng Groq Cloud để tiết kiệm RAM. Chỉ chạy Local khi Groq lỗi.
"""
import os, subprocess, time, requests, traceback
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse

# --- CẤU HÌNH ---
PORT = 9000
WHISPER_CPP_PORT = 9001
WHISPER_CPP_PATH = os.path.join(os.path.dirname(__file__), "whisper.cpp")
WHISPER_SERVER_BIN = os.path.join(WHISPER_CPP_PATH, "build/bin/whisper-server")
MODEL_PATH = os.path.join(WHISPER_CPP_PATH, "models/ggml-medium.bin")

# Lấy API Key từ môi trường (Nếu không có sẽ dùng Local)
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "") 

app = FastAPI(title="Whisper Hybrid Proxy")
cpp_process = None

def start_local_whisper():
    global cpp_process
    if cpp_process is None or cpp_process.poll() is not None:
        print(f"⚠️ Groq lỗi hoặc không có Key. Đang kích hoạt Local Whisper.cpp (Medium)...")
        cpp_process = subprocess.Popen([
            WHISPER_SERVER_BIN,
            "-m", MODEL_PATH,
            "--port", str(WHISPER_CPP_PORT),
            "--host", "127.0.0.1",
            "--convert"
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        # Đợi một chút để model load vào RAM (Medium tốn khoảng 3-5s)
        time.sleep(5)
    return True

@app.on_event("shutdown")
def shutdown_event():
    if cpp_process:
        cpp_process.terminate()

@app.get("/health")
def health():
    return {
        "status": "ok", 
        "primary": "Groq Cloud" if GROQ_API_KEY else "Local (No Key)",
        "local_active": cpp_process is not None and cpp_process.poll() is None
    }

@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form("whisper-large-v3-turbo"), # Model mặc định cho Groq
    language: str = Form("vi"),
    response_format: str = Form("json"),
):
    file_content = await file.read()
    
    # --- 1. THỬ DÙNG GROQ TRƯỚC ---
    if GROQ_API_KEY:
        try:
            print(f"🌐 Đang gửi yêu cầu tới Groq Cloud...")
            headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}
            files = {"file": (file.filename or "audio.webm", file_content, file.content_type)}
            data = {"model": "whisper-large-v3-turbo", "language": language}
            
            response = requests.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers=headers, files=files, data=data, timeout=10
            )
            
            if response.status_code == 200:
                print("✅ Groq thành công.")
                return JSONResponse(response.json())
            else:
                print(f"❌ Groq Error: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"❌ Groq Connection Error: {str(e)}")

    # --- 2. NẾU GROQ LỖI HOẶC KHÔNG CÓ KEY -> DÙNG LOCAL ---
    try:
        start_local_whisper()
        print(f"🏠 Đang xử lý bằng Local Whisper.cpp...")
        files = {"file": (file.filename or "audio.webm", file_content, file.content_type)}
        params = {"language": language}
        
        response = requests.post(f"http://127.0.0.1:{WHISPER_CPP_PORT}/inference", files=files, data=params, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            return JSONResponse({"text": result.get("text", "").strip(), "language": language, "source": "local"})
        else:
            return JSONResponse({"error": "Cả Groq và Local đều thất bại"}, status_code=500)
            
    except Exception as e:
        traceback.print_exc()
        return JSONResponse({"error": str(e)}, status_code=500)

if __name__ == "__main__":
    import uvicorn
    # Cố gắng lấy key từ .env nếu chưa có trong env var
    print(f"🚀 Hybrid STT Proxy sẵn sàng tại port {PORT}")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
