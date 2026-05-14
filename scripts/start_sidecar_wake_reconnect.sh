#!/bin/bash
set -euo pipefail

BASE_DIR="/Users/nguyenhat/HAgent/scripts"
SRC="$BASE_DIR/sidecar_wake_reconnect.swift"
BIN="$BASE_DIR/sidecar_wake_reconnect"
DEVICE_NAME="${1:-Hat-Ipad}"

if [ ! -x "$BIN" ] || [ "$SRC" -nt "$BIN" ]; then
  /usr/bin/swiftc "$SRC" -o "$BIN"
fi

exec "$BIN" "$DEVICE_NAME"
