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

DEFAULT_SERVICES=$(node -e "const c=require('./ecosystem.config.cjs'); console.log(c.DEFAULT_SERVICES.join(','))")

echo "Starting default HAgent services via PM2..."
echo "On-demand services stay stopped by default: hagent-stt, hagent-tts-piper, hagent-tts-lux"
pm2 start ecosystem.config.cjs --only "$DEFAULT_SERVICES" --force

echo ""
echo "Services status:"
pm2 list

echo ""
echo "Use 'pm2 logs' to see real-time logs."
echo "Use 'pm2 stop all' to stop all services."
