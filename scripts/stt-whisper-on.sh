#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON="${HATAI_PYTHON:-/Users/nguyenhat/HAgent/stt/.venv/bin/python}"
WHISPER_MODEL=medium
WHISPER_PORT=9000

# Load GROQ_API_KEY from .env
if [ -f "$DIR/.env" ]; then
  export $(grep GROQ_API_KEY "$DIR/.env" | xargs)
fi

echo "🚀 Đang khởi động Whisper Proxy..."
GROQ_API_KEY=$GROQ_API_KEY WHISPER_MODEL=$WHISPER_MODEL WHISPER_PORT=$WHISPER_PORT nohup $PYTHON "$DIR/whisper_server.py" > /tmp/whisper.log 2>&1 &

sleep 2
if curl -s --max-time 2 http://localhost:9000/health > /dev/null 2>&1; then
  echo "✅ Whisper đã sẵn sàng tại cổng 9000."
else
  echo "⏳ Whisper đang tải model, vui lòng kiểm tra: tail -f /tmp/whisper.log"
fi
