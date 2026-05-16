#!/bin/bash
set -euo pipefail

TARGET_UID="${SUDO_UID:-$(stat -f %u /dev/console)}"

launchctl bootout system /Library/LaunchDaemons/com.carriez.RustDesk_service.plist 2>/dev/null || true
launchctl disable system/com.carriez.RustDesk_service 2>/dev/null || true

launchctl bootout "gui/${TARGET_UID}" /Library/LaunchAgents/com.carriez.RustDesk_server.plist 2>/dev/null || true
launchctl disable "gui/${TARGET_UID}/com.carriez.RustDesk_server" 2>/dev/null || true

# Tắt server
killall hbbs 2>/dev/null || true
killall hbbr 2>/dev/null || true

# Thoát ứng dụng RustDesk
osascript -e 'quit app "RustDesk"' 2>/dev/null || true
killall RustDesk 2>/dev/null || true

# Gỡ RustDesk khỏi Dock
launchctl asuser "${TARGET_UID}" /usr/bin/python3 -c "
import plistlib, subprocess
path = '/Users/nguyenhat/Library/Preferences/com.apple.dock.plist'
try:
    with open(path, 'rb') as f:
        plist = plistlib.load(f)
    for key in ('persistent-apps', 'persistent-others', 'recent-apps'):
        items = plist.get(key, [])
        filtered = []
        for item in items:
            td = item.get('tile-data', {})
            label = td.get('file-label', '')
            url = td.get('_CFURLString', '')
            bundle = td.get('bundle-identifier', '')
            if 'RustDesk' not in label and 'RustDesk' not in url and 'rustdesk' not in bundle.lower():
                filtered.append(item)
        plist[key] = filtered
    with open(path, 'wb') as f:
        plistlib.dump(plist, f)
    subprocess.run(['killall', 'Dock'])
except Exception as e:
    print(f'Dock error: {e}')
" 2>/dev/null || true

echo "RustDesk disabled (server stopped, app quit, removed from Dock)"
