#!/bin/bash
# ============================================================
#  HAgent Unified Start Script
#  Uses PM2 to manage all services
# ============================================================

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "PM2 is not installed. Installing globally..."
    npm install -g pm2
fi

echo "Starting all HAgent services via PM2..."
pm2 start ecosystem.config.cjs --force

echo ""
echo "Services status:"
pm2 list

echo ""
echo "Use 'pm2 logs' to see real-time logs."
echo "Use 'pm2 stop all' to stop all services."
