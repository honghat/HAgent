#!/bin/bash
set -euo pipefail

TARGET_UID="${SUDO_UID:-$(stat -f %u /dev/console)}"

launchctl bootout system /Library/LaunchDaemons/com.carriez.RustDesk_service.plist 2>/dev/null || true
launchctl disable system/com.carriez.RustDesk_service 2>/dev/null || true

launchctl bootout "gui/${TARGET_UID}" /Library/LaunchAgents/com.carriez.RustDesk_server.plist 2>/dev/null || true
launchctl disable "gui/${TARGET_UID}/com.carriez.RustDesk_server" 2>/dev/null || true

killall RustDesk 2>/dev/null || true
killall hbbs 2>/dev/null || true
killall hbbr 2>/dev/null || true

echo "RustDesk disabled"
