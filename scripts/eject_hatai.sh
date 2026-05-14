#!/bin/bash
# Script to safely eject HatAI drive by label

DISK_ID=$(diskutil list | grep "HatAI" | awk "{print \$NF}")

if [ -z "$DISK_ID" ]; then
    echo "❌ Ổ đĩa HatAI hiện không kết nối hoặc đã được rút ra."
    exit 1
fi

echo "⏏️ Đang ngắt kết nối ổ đĩa HatAI ($DISK_ID)..."
diskutil eject $DISK_ID

