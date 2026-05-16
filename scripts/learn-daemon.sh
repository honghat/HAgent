#!/bin/bash
# ============================================================
#  NewHat — LaunchDaemon Startup Script
#  Chạy bởi launchd lúc boot (không cần user login)
# ============================================================

# ── Môi trường tuyệt đối (launchd không có user env) ──────
export HOME="/Users/nguyenhat"
export USER="nguyenhat"
export LOGNAME="nguyenhat"
export PATH="/usr/local/bin:/Users/nguyenhat/HAgent/learn/.venv/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/bin:/bin:/usr/sbin:/sbin"
export LANG="en_US.UTF-8"
export NODE_OPTIONS="--max-old-space-size=2048"
export NEXT_TELEMETRY_DISABLED=1
ulimit -v 8388608 2>/dev/null || true # Giới hạn 8GB RAM tổng cho script này

PYTHON="${HATAI_PYTHON:-/Users/nguyenhat/HAgent/learn/.venv/bin/python}"
NPM="/usr/local/bin/npm"
NODE="/usr/local/bin/node"
DIR="/Users/nguyenhat/HAgent/learn"
LOG="/tmp"
PG_BIN="/opt/homebrew/opt/postgresql@16/bin"
PG_DATA="/opt/homebrew/var/postgresql@16"

# stdout/stderr đã được plist redirect vào log file — không cần tee

echo ""
echo "============================================================"
echo "  NewHat Boot — $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"

cd "$DIR"

# ── 1. PostgreSQL (Disabled - migrated to SQLite) ───────────
# echo "[1/4] PostgreSQL (Disabled)..."

# ── 2. LuxTTS (Moved to /tts) ────────────────────────────────
# echo "[2/5] LuxTTS (Moved to /tts)..."

# ── 3. Piper TTS (Moved to /tts) ──────────────────────────
# echo "[3/5] Piper TTS (Moved to /tts)..."

# ── 4. Whisper STT (Moved to /stt) ───────────────────────────
# echo "[4/5] Whisper STT (Moved to /stt)..."

# ── 5. Next.js (port 8006) ───────────────────────────────
echo "[5/5] Next.js (port 8006)..."
# Kill process cũ trên port 8006 nếu còn
lsof -ti:8006 | xargs kill -9 2>/dev/null || true
sleep 1

echo "  🚀 Khởi động NewHat App..."
echo ""

# Chạy foreground (Standalone mode siêu nhẹ)
export PORT=8006
export HOSTNAME="0.0.0.0"

# Nạp biến môi trường từ .env và .env.local
if [ -f "$DIR/.env" ]; then
  set -a; source "$DIR/.env"; set +a
fi
if [ -f "$DIR/.env.local" ]; then
  set -a; source "$DIR/.env.local"; set +a
fi

# Đảm bảo các file tĩnh và prisma có mặt trong standalone folder
mkdir -p "$DIR/.next/standalone/.next/static"
cp -r "$DIR/public" "$DIR/.next/standalone/" 2>/dev/null || true
cp -r "$DIR/.next/static" "$DIR/.next/standalone/.next/" 2>/dev/null || true
cp -r "$DIR/prisma" "$DIR/.next/standalone/" 2>/dev/null || true

exec "$NODE" "$DIR/.next/standalone/server.js" 2>&1
