#!/bin/bash
set -euo pipefail

PROVIDER="${1:-sensevoice}"
REMOTE_HOST="${HAGENT_STT_REMOTE_HOST:-100.69.50.64}"

case "${PROVIDER}" in
  sensevoice)
    LOCAL_PORT="${HAGENT_SENSEVOICE_LOCAL_PORT:-9000}"
    REMOTE_PORT="${HAGENT_SENSEVOICE_REMOTE_PORT:-9000}"
    REMOTE_STOP_CMD="${HAGENT_SENSEVOICE_REMOTE_STOP_CMD:-pkill -f 'sensevoice_server.py' || true}"
    PM2_NAME="hagent-stt-sensevoice-tunnel"
    ;;
  whisper)
    LOCAL_PORT="${HAGENT_WHISPER_LOCAL_PORT:-9001}"
    REMOTE_PORT="${HAGENT_WHISPER_REMOTE_PORT:-9001}"
    REMOTE_STOP_CMD="${HAGENT_WHISPER_REMOTE_STOP_CMD:-pkill -f 'whisper_server.py' || true}"
    PM2_NAME="hagent-stt-whisper-tunnel"
    ;;
  *)
    echo "Unknown STT provider: ${PROVIDER}" >&2
    exit 2
    ;;
esac

echo "🛑 Stopping ${PROVIDER} STT tunnel + remote STT..."

pm2 delete "${PM2_NAME}" >/dev/null 2>&1 || true
pkill -f "ssh.*${LOCAL_PORT}:localhost:${REMOTE_PORT}.*${REMOTE_HOST}" >/dev/null 2>&1 || true
ssh "${REMOTE_HOST}" "${REMOTE_STOP_CMD}" || true

echo "✅ STT remote stopped."
