#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$ROOT_DIR/searxng-src"
VENV_DIR="$ROOT_DIR/.venv"
PID_FILE="$ROOT_DIR/searxng.pid"
LOG_FILE="$ROOT_DIR/searxng.log"
SETTINGS_FILE="$ROOT_DIR/settings.yml"

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  echo "Missing SearXNG virtualenv at $VENV_DIR" >&2
  exit 1
fi

export SEARXNG_SETTINGS_PATH="$SETTINGS_FILE"
export SEARXNG_SECRET="$("$VENV_DIR/bin/python" - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
)"

cd "$SRC_DIR"

if [[ "${SEARXNG_PM2_FOREGROUND:-}" == "1" ]]; then
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    OLD_PID="$(cat "$PID_FILE")"
    echo "Stopping detached SearXNG PID $OLD_PID before PM2 takeover"
    kill "$OLD_PID" 2>/dev/null || true
    for _ in 1 2 3 4 5; do
      kill -0 "$OLD_PID" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "$OLD_PID" 2>/dev/null; then
      echo "SearXNG PID $OLD_PID did not stop" >&2
      exit 1
    fi
  fi
  echo "$$" > "$PID_FILE"
  exec "$VENV_DIR/bin/python" -m searx.webapp
fi

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "SearXNG already running with PID $(cat "$PID_FILE")"
  exit 0
fi

nohup "$VENV_DIR/bin/python" -m searx.webapp >"$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
sleep 2

if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "SearXNG started on http://127.0.0.1:8888 (PID $(cat "$PID_FILE"))"
else
  echo "SearXNG failed to start. See $LOG_FILE" >&2
  exit 1
fi
