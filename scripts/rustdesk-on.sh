#!/bin/bash
set -euo pipefail

TARGET_UID="${SUDO_UID:-$(stat -f %u /dev/console)}"
RUSTDESK_DIR="/Users/nguyenhat/HAgent/rustdesk/server"
RUSTDESK_PREF_DIR="/Users/nguyenhat/Library/Preferences/com.carriez.RustDesk"

configure_quality() {
  mkdir -p "${RUSTDESK_PREF_DIR}"
  cat > "${RUSTDESK_PREF_DIR}/RustDesk_default.toml" <<'EOF'
[options]
image_quality = 'best'
custom_image_quality = '100'
custom_fps = '30'
view_style = 'adaptive'
show_remote_cursor = 'Y'
EOF
}

configure_quality

launchctl enable system/com.carriez.RustDesk_service 2>/dev/null || true
launchctl bootstrap system /Library/LaunchDaemons/com.carriez.RustDesk_service.plist 2>/dev/null || true

launchctl enable "gui/${TARGET_UID}/com.carriez.RustDesk_server" 2>/dev/null || true
launchctl bootstrap "gui/${TARGET_UID}" /Library/LaunchAgents/com.carriez.RustDesk_server.plist 2>/dev/null || true

launchctl asuser "${TARGET_UID}" /bin/bash -lc "pgrep -x hbbs >/dev/null || (cd '${RUSTDESK_DIR}' && nohup ./start-server.sh >/dev/null 2>&1 &)"

# Đợi server hbbs/hbbr lên port mặc định (21116, 21119)
wait_port() {
  local port="$1"
  local tries=0
  while [ $tries -lt 30 ]; do
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.2
    tries=$((tries + 1))
  done
  return 1
}

server_ready=true
wait_port 21116 || server_ready=false
wait_port 21119 || server_ready=false

if ! $server_ready; then
  echo "WARN: hbbs/hbbr chưa listen (21116/21119) — kiểm tra log tại ${RUSTDESK_DIR}/hbbs.log" >&2
fi

# Mở ứng dụng RustDesk GUI nếu chưa chạy
launchctl asuser "${TARGET_UID}" /usr/bin/open -a RustDesk 2>/dev/null || true

# Đợi process RustDesk thực sự running (tối đa ~6s)
tries=0
while [ $tries -lt 30 ]; do
  if pgrep -x RustDesk >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
  tries=$((tries + 1))
done

if ! pgrep -x RustDesk >/dev/null 2>&1; then
  echo "WARN: RustDesk app chưa khởi động được" >&2
fi

# Cảnh báo nếu thiếu Screen Recording permission (nguyên nhân chính của lỗi "chờ hình ảnh")
SCREEN_DB="/Library/Application Support/com.apple.TCC/TCC.db"
if [ -r "$SCREEN_DB" ]; then
  granted=$(sqlite3 "$SCREEN_DB" \
    "SELECT auth_value FROM access WHERE service='kTCCServiceScreenCapture' AND client LIKE '%RustDesk%' LIMIT 1;" 2>/dev/null || echo "")
  if [ -z "$granted" ] || [ "$granted" = "0" ]; then
    echo "WARN: RustDesk có thể chưa được cấp Screen Recording — System Settings → Privacy & Security → Screen Recording" >&2
  fi
fi

echo "RustDesk enabled (server + app)"
