#!/bin/bash
set -euo pipefail

TARGET_UID="${SUDO_UID:-$(stat -f %u /dev/console)}"
RUSTDESK_DIR="/Users/nguyenhat/HAgent/rustdesk/server"

launchctl enable system/com.carriez.RustDesk_service 2>/dev/null || true
launchctl bootstrap system /Library/LaunchDaemons/com.carriez.RustDesk_service.plist 2>/dev/null || true

launchctl enable "gui/${TARGET_UID}/com.carriez.RustDesk_server" 2>/dev/null || true
launchctl bootstrap "gui/${TARGET_UID}" /Library/LaunchAgents/com.carriez.RustDesk_server.plist 2>/dev/null || true

launchctl asuser "${TARGET_UID}" /bin/bash -lc "pgrep -x hbbs >/dev/null || (cd '${RUSTDESK_DIR}' && nohup ./start-server.sh >/dev/null 2>&1 &)"

# Mở ứng dụng RustDesk GUI nếu chưa chạy
launchctl asuser "${TARGET_UID}" /usr/bin/open -a RustDesk 2>/dev/null || true

echo "RustDesk enabled (server + app)"
