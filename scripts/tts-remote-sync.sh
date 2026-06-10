#!/bin/bash
set -euo pipefail

REMOTE_HOST="${HAGENT_TTS_REMOTE_HOST:-${HAGENT_STT_REMOTE_HOST:-100.69.50.64}}"
LOCAL_TTS_DIR="${HAGENT_TTS_LOCAL_DIR:-/Users/nguyenhat/HAgent/tts}"
REMOTE_TTS_DIR="${HAGENT_TTS_REMOTE_DIR:-~/HAgent/tts}"
BOOTSTRAP="${HAGENT_TTS_REMOTE_BOOTSTRAP:-1}"

echo "📦 Sync TTS to remote: ${REMOTE_HOST}:${REMOTE_TTS_DIR}"

ssh "${REMOTE_HOST}" "mkdir -p ~/HAgent/logs ${REMOTE_TTS_DIR}/kokoro"

rsync -az --delete \
  --exclude ".venv" \
  --exclude "logs" \
  --exclude "LuxTTS" \
  --exclude "kokoro" \
  --exclude ".DS_Store" \
  "${LOCAL_TTS_DIR}/" \
  "${REMOTE_HOST}:${REMOTE_TTS_DIR}/"

echo "✅ Synced HAgent TTS -> remote"

ssh "${REMOTE_HOST}" "if [ ! -d ${REMOTE_TTS_DIR}/LuxTTS ] && [ -d ~/tts/LuxTTS ]; then cp -a ~/tts/LuxTTS ${REMOTE_TTS_DIR}/LuxTTS; fi"
echo "✅ Ensured LuxTTS lives under ${REMOTE_TTS_DIR}/LuxTTS"

if [ "${BOOTSTRAP}" = "1" ]; then
  ssh "${REMOTE_HOST}" "cd ${REMOTE_TTS_DIR} && \
    python3 -m venv .venv && \
    .venv/bin/python -m pip install -U pip wheel setuptools >/dev/null && \
    .venv/bin/python -m pip install fastapi uvicorn python-multipart edge-tts gtts soundfile numpy kokoro >/dev/null"
  echo "✅ Bootstrapped remote TTS venv"
fi
