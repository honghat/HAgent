#!/bin/bash

# ============================================================
# OMNICHAT BACKEND AUTO-START MIGRATION SCRIPT
# ============================================================
# Purpose: Auto-start OmniChat API server for frontend integration
# Author: HAgent Prime
# Date: May 2026
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/.hagent/config.json"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to ensure Omnichannel backend is started
ensure_omnichannel_backend_started() {
    log "🔍 Checking if OmniChat backend is running..."
    
    # Check if omnichannel backend process exists
    if ps aux | grep -q "[p]ython.*api_server.py"; then
        log "✅ OmniChat backend is already running!"
        return 0
    fi
    
    log "📦 Starting OmniChat backend server..."
    
    # Create backend directory if it doesn't exist
    mkdir -p "${SCRIPT_DIR}/.hagent/plugins/platforms/omnichannel/backend"
    
    # Create config file
    cat > "${SCRIPT_DIR}/.hagent/plugins/platforms/omnichannel/backend/config.json" << EOF
{
  "enabled": true,
  "port": 8080,
  "qr_login_enabled": true,
  "session_file": ".hagent/sessions/omni_chat_session.json",
  "log_level": "INFO"
}
EOF
    
    # Create and run the server
    cd "${SCRIPT_DIR}/.hagent/plugins/platforms/omnichannel/backend"
    
    log "🚀 Launching uvicorn server..."
    uvicorn api_server:app --host 127.0.0.1 --port $(grep port config.json | cut -d'"' -f4) &
    
    sleep 3
    
    # Verify server is responding
    for i in {1..10}; do
        if curl -s "http://127.0.0.1:8080/api/status" > /dev/null 2>&1; then
            log "✅ OmniChat backend is ready!"
            return 0
        fi
        sleep 1
    done
    
    log "⚠️  Could not verify backend is responding, but server started."
    return 0
}

# Function to gracefully stop OmniChat backend
stop_omnichannel_backend() {
    log "🛑 Stopping OmniChat backend..."
    
    # Find and kill the process
    PID=$(ps aux | grep "[p]ython.*api_server.py" | awk '{print $2}')
    
    if [ -n "$PID" ]; then
        kill -TERM $PID 2>/dev/null || true
        sleep 2
        
        if ps aux | grep "[p]ython.*api_server.py" > /dev/null; then
            log "⚠️  Process still running, attempting force kill..."
            kill -9 $PID 2>/dev/null || true
        fi
        
        log "✅ OmniChat backend stopped."
    else
        log "ℹ️  OmniChat backend was not running."
    fi
    
    return 0
}

# Main execution
case "${1:-start}" in
    start)
        ensure_omnichannel_backend_started
        ;;
    stop)
        stop_omnichannel_backend
        ;;
    restart)
        stop_omnichannel_backend
        sleep 1
        ensure_omnichannel_backend_started
        ;;
    status)
        if ps aux | grep "[p]ython.*api_server.py"; then
            log "✅ OmniChat backend is RUNNING"
        else
            log "❌ OmniChat backend is NOT running"
        fi
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac

log "=============================================="
log "OmniChat Backend Migration Complete!"
log "=============================================="
