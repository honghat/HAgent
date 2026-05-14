#!/bin/bash

# Load path
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Log directory
LOG_DIR="/Users/nguyenhat/HAgent/logs"
mkdir -p "$LOG_DIR"

echo "Starting HAgent Services at $(date)" >> "$LOG_DIR/startup.log"

# Clean up existing processes
lsof -ti:8004,8010,3004 | xargs kill -9 2>/dev/null || true

# Start Backend
echo "Starting Backend..." >> "$LOG_DIR/startup.log"
cd /Users/nguyenhat/HAgent/backend
npm run dev >> "$LOG_DIR/backend.log" 2>&1 &

# Start Frontend
echo "Starting Frontend..." >> "$LOG_DIR/startup.log"
cd /Users/nguyenhat/HAgent/frontend
npm run dev >> "$LOG_DIR/frontend.log" 2>&1 &

wait
