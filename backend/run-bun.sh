#!/usr/bin/env bash
# Run Telegram backend with Bun
set -e

cd /Users/nguyenhat/HAgent/backend

# Check if Bun is installed
if ! command -v bun &> /dev/null; then
  echo "❌ Bun không được cài đặt. Vui lòng cài đặt trước."
  exit 1
fi

echo "🚀 Chạy Telegram backend với Bun..."
bun run start
