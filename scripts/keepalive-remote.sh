#!/bin/bash
# Giữ kết nối Tailscale tới remote luôn "ấm" (direct P2P) — tránh cold-start
# timeout ~8s ở lần mount SMB đầu tiên. Chạy định kỳ qua launchd.
REMOTE_IP="100.69.50.64"
# Đánh thức cả SSH (22) và SMB (445) để WireGuard giữ direct path
for port in 22 445; do
    nc -G 5 -z "$REMOTE_IP" "$port" >/dev/null 2>&1
done
echo "$(date '+%Y-%m-%d %H:%M:%S') keepalive ${REMOTE_IP} ok"
