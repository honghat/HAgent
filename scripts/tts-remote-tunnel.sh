#!/bin/bash
set -euo pipefail

PROVIDER="${1:-kokoro}"
REMOTE_HOST="${HAGENT_TTS_REMOTE_HOST:-${HAGENT_STT_REMOTE_HOST:-100.69.50.64}}"
SYNC_BEFORE_START="${HAGENT_TTS_SYNC_BEFORE_START:-1}"
SYNC_SCRIPT="${HAGENT_TTS_SYNC_SCRIPT:-/Users/nguyenhat/HAgent/scripts/tts-remote-sync.sh}"

case "${PROVIDER}" in
  kokoro)
    LOCAL_PORT="${HAGENT_KOKORO_LOCAL_PORT:-8881}"
    REMOTE_PORT="${HAGENT_KOKORO_REMOTE_PORT:-8881}"
    PM2_NAME="${HAGENT_KOKORO_TUNNEL_PM2:-hagent-tts-kokoro-tunnel}"
    REMOTE_START_CMD="${HAGENT_KOKORO_REMOTE_START_CMD:-cd ~/HAgent/tts && mkdir -p ../logs kokoro && nohup setsid -f env KOKORO_PORT=${REMOTE_PORT} .venv/bin/python kokoro_server.py > ../logs/kokoro.log 2>&1 < /dev/null}"
    ;;
  lux)
    LOCAL_PORT="${HAGENT_LUX_LOCAL_PORT:-8880}"
    REMOTE_PORT="${HAGENT_LUX_REMOTE_PORT:-8880}"
    PM2_NAME="${HAGENT_LUX_TUNNEL_PM2:-hagent-tts-lux-tunnel}"
    REMOTE_START_CMD="${HAGENT_LUX_REMOTE_START_CMD:-cd ~/HAgent/tts/LuxTTS && mkdir -p ../../logs && nohup setsid -f env PYTHONPATH=\"\$PWD:\$PWD/zipvoice\" .venv/bin/python server.py > ../../logs/lux.log 2>&1 < /dev/null}"
    ;;
  *)
    echo "Unknown TTS provider: ${PROVIDER}" >&2
    exit 2
    ;;
esac

echo "🔗 ${PROVIDER}: localhost:${LOCAL_PORT} -> ${REMOTE_HOST}:${REMOTE_PORT}"

if [ "${SYNC_BEFORE_START}" = "1" ] && [ -x "${SYNC_SCRIPT}" ]; then
  "${SYNC_SCRIPT}"
fi

ssh -n "${REMOTE_HOST}" "${REMOTE_START_CMD}"
sleep 2

if command -v pm2 >/dev/null 2>&1; then
  pm2 delete "${PM2_NAME}" >/dev/null 2>&1 || true
  pm2 start ssh --name "${PM2_NAME}" -- \
    -o ServerAliveInterval=15 \
    -o ServerAliveCountMax=3 \
    -N -L "${LOCAL_PORT}:localhost:${REMOTE_PORT}" "${REMOTE_HOST}"
else
  pkill -f "ssh.*${LOCAL_PORT}:localhost:${REMOTE_PORT}.*${REMOTE_HOST}" 2>/dev/null || true
  ssh -f -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
    -N -L "${LOCAL_PORT}:localhost:${REMOTE_PORT}" "${REMOTE_HOST}"
fi

echo "✅ ${PROVIDER} TTS tunnel started"
