#!/bin/bash
echo "🛑 Đang tắt Whisper..."
lsof -ti:9000 | xargs kill -9 2>/dev/null || true
pkill -f whisper-server 2>/dev/null || true
echo "✅ Đã tắt Whisper để giải phóng RAM."
