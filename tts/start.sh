#!/bin/bash
# ============================================================
#  HAgent TTS Services Manager
#  Uses PM2 to manage TTS services
# ============================================================

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "Restarting default TTS service via PM2..."
echo "Piper/Lux are on-demand; start them with: ./scripts/svc on tts-piper tts-lux"
pm2 restart hagent-tts-edge

echo ""
pm2 list | grep tts
