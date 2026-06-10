#!/bin/bash
set -euo pipefail

PROVIDER="${1:-kokoro}"
REMOTE_HOST="${HAGENT_TTS_REMOTE_HOST:-${HAGENT_STT_REMOTE_HOST:-100.69.50.64}}"

case "${PROVIDER}" in
  kokoro)
    LOCAL_PORT="${HAGENT_KOKORO_LOCAL_PORT:-8881}"
    REMOTE_PORT="${HAGENT_KOKORO_REMOTE_PORT:-8881}"
    PM2_NAME="${HAGENT_KOKORO_TUNNEL_PM2:-hagent-tts-kokoro-tunnel}"
    REMOTE_STOP_CMD="${HAGENT_KOKORO_REMOTE_STOP_CMD:-pkill -f 'kokoro_server.py|kokoro.*server' || true}"
    ;;
  lux)
    LOCAL_PORT="${HAGENT_LUX_LOCAL_PORT:-8880}"
    REMOTE_PORT="${HAGENT_LUX_REMOTE_PORT:-8880}"
    PM2_NAME="${HAGENT_LUX_TUNNEL_PM2:-hagent-tts-lux-tunnel}"
    REMOTE_STOP_CMD="${HAGENT_LUX_REMOTE_STOP_CMD:-pkill -f 'LuxTTS.*server.py|/server.py' || true}"
    ;;
  *)
    echo "Unknown TTS provider: ${PROVIDER}" >&2
    exit 2
    ;;
esac

echo "🛑 Stopping ${PROVIDER} TTS tunnel + remote process..."

if command -v pm2 >/dev/null 2>&1; then
  pm2 delete "${PM2_NAME}" >/dev/null 2>&1 || true
fi
pkill -f "ssh.*${LOCAL_PORT}:localhost:${REMOTE_PORT}.*${REMOTE_HOST}" 2>/dev/null || true
ssh "${REMOTE_HOST}" "${REMOTE_STOP_CMD}" || true

echo "✅ ${PROVIDER} TTS stopped"
