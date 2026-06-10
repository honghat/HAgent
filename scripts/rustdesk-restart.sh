#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Tắt sạch rồi đợi process biến mất
bash "${SCRIPT_DIR}/rustdesk-off.sh" >/dev/null 2>&1 || true

tries=0
while [ $tries -lt 25 ]; do
  if ! pgrep -x hbbs >/dev/null 2>&1 \
     && ! pgrep -x hbbr >/dev/null 2>&1 \
     && ! pgrep -x RustDesk >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
  tries=$((tries + 1))
done

# Dọn port nếu còn dính
TARGET_UID="${SUDO_UID:-$(stat -f %u /dev/console)}"
for port in 21115 21116 21117 21119 21120; do
  pid=$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pid" ]; then
    kill -9 $pid 2>/dev/null || true
  fi
done

bash "${SCRIPT_DIR}/rustdesk-on.sh"
