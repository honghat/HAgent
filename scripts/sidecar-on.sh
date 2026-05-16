#!/bin/bash
# Auto-connect Sidecar to Hat iPad
# Runs at login via launch agent or login item

export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
LOG_DIR="/Users/nguyenhat/HAgent/logs"
mkdir -p "$LOG_DIR"

echo "[$(date)] Sidecar auto-connect starting..." >> "$LOG_DIR/sidecar.log"

# Wait for network
for i in {1..15}; do
    if ping -c1 -t1 100.69.50.64 &>/dev/null; then
        echo "[$(date)] Network ready" >> "$LOG_DIR/sidecar.log"
        break
    fi
    sleep 2
done

# Post Darwin notification to trigger Sidecar connection
/usr/bin/swift <<'SWIFT' >> "$LOG_DIR/sidecar.log" 2>&1
import Foundation
let center = CFNotificationCenterGetDarwinNotifyCenter()
CFNotificationCenterPostNotification(center, CFNotificationName("com.apple.sidecar.connect" as CFString), nil, nil, false)
CFNotificationCenterPostNotification(center, CFNotificationName("com.apple.sidecar-relay.connect" as CFString), nil, nil, false)
SWIFT

echo "[$(date)] Sidecar notification posted" >> "$LOG_DIR/sidecar.log"
