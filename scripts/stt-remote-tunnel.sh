#!/bin/bash
set -euo pipefail

PROVIDER="${1:-sensevoice}"
REMOTE_HOST="${HAGENT_STT_REMOTE_HOST:-100.69.50.64}"
SYNC_BEFORE_START="${HAGENT_STT_SYNC_MODEL_BEFORE_START:-1}"
SYNC_SCRIPT="${HAGENT_STT_SYNC_SCRIPT:-/Users/nguyenhat/HAgent/scripts/stt-remote-sync-model.sh}"

case "${PROVIDER}" in
  sensevoice)
    REMOTE_PORT="${HAGENT_SENSEVOICE_REMOTE_PORT:-9000}"
    LOCAL_PORT="${HAGENT_SENSEVOICE_LOCAL_PORT:-9000}"
    REMOTE_START_CMD="${HAGENT_SENSEVOICE_REMOTE_START_CMD:-cd ~/HAgent/stt && mkdir -p ../logs && bash -c 'nohup env SENSEVOICE_PORT=9000 .venv/bin/python sensevoice_server.py > ../logs/stt.log 2>&1 < /dev/null &'}"
    PM2_NAME="hagent-stt-sensevoice-tunnel"
    ;;
  whisper)
    REMOTE_PORT="${HAGENT_WHISPER_REMOTE_PORT:-9001}"
    LOCAL_PORT="${HAGENT_WHISPER_LOCAL_PORT:-9001}"
    REMOTE_START_CMD="${HAGENT_WHISPER_REMOTE_START_CMD:-cd ~/HAgent/stt && mkdir -p ../logs && bash -c 'nohup ./whisper_remote.sh > ../logs/whisper.log 2>&1 < /dev/null &'}"
    PM2_NAME="hagent-stt-whisper-tunnel"
    ;;
  *)
    echo "Unknown STT provider: ${PROVIDER}" >&2
    exit 2
    ;;
esac

echo "🔗 ${PROVIDER} STT tunnel: localhost:${LOCAL_PORT} -> ${REMOTE_HOST}:${REMOTE_PORT}"

# Stop old tunnel if any
pm2 delete "${PM2_NAME}" >/dev/null 2>&1 || true
pkill -f "ssh.*${LOCAL_PORT}:localhost:${REMOTE_PORT}.*${REMOTE_HOST}" >/dev/null 2>&1 || true

# Sync model to remote when requested (skip warmup for whisper)
if [ "${SYNC_BEFORE_START}" = "1" ] && [ -x "${SYNC_SCRIPT}" ]; then
  if [ "${PROVIDER}" = "whisper" ]; then
    HAGENT_STT_REMOTE_WARMUP=0 "${SYNC_SCRIPT}" || true
  else
    "${SYNC_SCRIPT}" || true
  fi
fi

# Ensure remote STT is running (idempotent: only start if not listening)
ssh -n "${REMOTE_HOST}" "ss -tlnp 2>/dev/null | grep -q ':${REMOTE_PORT} ' || (${REMOTE_START_CMD}); sleep 2" || true

# Run tunnel under PM2 so it survives terminal close
pm2 start ssh \
  --name "${PM2_NAME}" \
  -- \
  -o ServerAliveInterval=15 \
  -o ServerAliveCountMax=3 \
  -o ExitOnForwardFailure=yes \
  -N \
  -L "${LOCAL_PORT}:localhost:${REMOTE_PORT}" \
  "${REMOTE_HOST}"

echo "✅ STT tunnel started via PM2: ${PM2_NAME}"
