#!/bin/bash
# Mount SMB share — usage: mount-smb.sh <IP> <SHARE_NAME> [USER]
# Mounts to ~/mnt/<SHARE_NAME>

SHARE_IP="${1:?Usage: mount-smb.sh <IP> <SHARE_NAME> [USER]}"
SHARE_NAME="${2:?Usage: mount-smb.sh <IP> <SHARE_NAME> [USER]}"
LOCAL_USER="${3:-hatnguyen}"
MOUNT_POINT="${HOME}/mnt/${SHARE_NAME}"

# Get password from keychain
PASS=$(security find-internet-password -s "${SHARE_IP}" -w 2>/dev/null)
if [ -z "$PASS" ]; then
    echo "❌ Password not found in keychain for $SHARE_IP"
    exit 1
fi

# URL-encode password
encode_url() {
    printf '%s' "$1" | python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.read(), safe=""))'
}
PASS=$(encode_url "$PASS")

# Check already mounted
if mount | grep -q "${SHARE_IP}/${SHARE_NAME}"; then
    echo "✅ ${SHARE_NAME} already mounted"
    exit 0
fi

# Clean stale mount
diskutil unmount force "${MOUNT_POINT}" 2>/dev/null || true

echo "🔄 Mounting //${SHARE_IP}/${SHARE_NAME}..."
mkdir -p "${MOUNT_POINT}"

mount -t smbfs -o noowners "smb://${LOCAL_USER}:${PASS}@${SHARE_IP}/${SHARE_NAME}" "${MOUNT_POINT}"

if [ $? -eq 0 ]; then
    echo "✅ Mounted ${SHARE_NAME} to ${MOUNT_POINT}"
    open "${MOUNT_POINT}" 2>/dev/null || true
else
    echo "❌ Failed to mount ${SHARE_NAME}"
    rmdir "${MOUNT_POINT}" 2>/dev/null || true
fi
