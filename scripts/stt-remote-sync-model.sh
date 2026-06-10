#!/bin/bash
set -euo pipefail

REMOTE_HOST="${HAGENT_STT_REMOTE_HOST:-100.69.50.64}"
REMOTE_MODEL_DIR="${HAGENT_STT_REMOTE_MODEL_DIR:-~/HAgent/stt/models}"
LOCAL_MODEL_DIR="${HAGENT_STT_LOCAL_MODEL_DIR:-/Users/nguyenhat/HAgent/stt/models}"
REMOTE_STT_DIR="${HAGENT_STT_REMOTE_DIR:-~/HAgent/stt}"
LOCAL_STT_DIR="${HAGENT_STT_LOCAL_DIR:-/Users/nguyenhat/HAgent/stt}"
REMOTE_WARMUP="${HAGENT_STT_REMOTE_WARMUP:-1}"
REMOTE_WARMUP_CMD="${HAGENT_STT_REMOTE_WARMUP_CMD:-cd ~/HAgent/stt && .venv/bin/python -c 'from funasr import AutoModel; AutoModel(model=\"iic/SenseVoiceSmall\", trust_remote_code=True, disable_update=True); print(\"warmup ok\")'}"

echo "📦 Sync STT scripts to remote: ${REMOTE_HOST}"

ssh "${REMOTE_HOST}" "mkdir -p ${REMOTE_STT_DIR}"
rsync -az \
  "${LOCAL_STT_DIR}/sensevoice_server.py" \
  "${LOCAL_STT_DIR}/whisper_server.py" \
  "${LOCAL_STT_DIR}/whisper_remote.sh" \
  "${LOCAL_STT_DIR}/start.sh" \
  "${REMOTE_HOST}:${REMOTE_STT_DIR}/"
ssh "${REMOTE_HOST}" "chmod +x ${REMOTE_STT_DIR}/start.sh ${REMOTE_STT_DIR}/whisper_remote.sh"
echo "✅ Synced STT server scripts -> remote"

if [ -d "${LOCAL_MODEL_DIR}" ]; then
  ssh "${REMOTE_HOST}" "mkdir -p ${REMOTE_MODEL_DIR}"
  rsync -az --delete "${LOCAL_MODEL_DIR}/" "${REMOTE_HOST}:${REMOTE_MODEL_DIR}/"
  echo "✅ Synced local model dir -> remote"
else
  echo "ℹ️ Local model dir not found (${LOCAL_MODEL_DIR}), skip file sync"
fi

if [ "${REMOTE_WARMUP}" = "1" ] && [ -n "${REMOTE_WARMUP_CMD}" ]; then
  ssh "${REMOTE_HOST}" "${REMOTE_WARMUP_CMD}" || true
  echo "✅ Remote model warmup done"
else
  echo "ℹ️ Skip remote model warmup"
fi
