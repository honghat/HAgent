#!/bin/bash
# Script to find and mount HatAI drive by label

DISK_ID=$(diskutil list | grep "HatAI" | awk "{print \$NF}")

if [ -z "$DISK_ID" ]; then
    echo "❌ Không tìm thấy ổ đĩa có nhãn HatAI."
    exit 1
fi

echo "🚀 Đang mount ổ đĩa HatAI ($DISK_ID)..."
diskutil mount $DISK_ID

