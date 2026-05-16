#!/bin/bash
# ============================================================
#  HAgent TTS Services Manager
#  Uses PM2 to manage TTS services
# ============================================================

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "Restarting TTS services via PM2..."
pm2 restart hagent-tts-edge hagent-tts-piper hagent-tts-lux

echo ""
pm2 list | grep tts
