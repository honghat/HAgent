#!/bin/bash
set -e
BLUE='\033[0;34m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
DIR="$(cd "$(dirname "$0")" && pwd)"
# Tìm python: ưu tiên môi trường chung hatai_env nếu có
export PATH="/Users/nguyenhat/HAgent/learn/.venv/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if [ -f "${HATAI_PYTHON:-/Users/nguyenhat/HAgent/learn/.venv/bin/python}" ]; then
  PYTHON="${HATAI_PYTHON:-/Users/nguyenhat/HAgent/learn/.venv/bin/python}"
else
  PYTHON="python3"
fi

# Kiểm tra và cài edge-tts + aiohttp nếu chưa có
if ! $PYTHON -c "import edge_tts" 2>/dev/null; then
  echo -e "  ${YELLOW}→ Cài edge-tts cho giọng Hoài My / Nam Minh...${NC}"
  $PYTHON -m pip install edge-tts -q 2>/dev/null || true
fi
if ! $PYTHON -c "import aiohttp" 2>/dev/null; then
  echo -e "  ${YELLOW}→ Cài aiohttp cho Edge TTS Server...${NC}"
  $PYTHON -m pip install aiohttp -q 2>/dev/null || true
fi

# ============ CẤU HÌNH TỐI ƯU ============
export NODE_OPTIONS="--max-old-space-size=2048"
ulimit -v 8388608 2>/dev/null || true
export NEXT_TELEMETRY_DISABLED=1
export WHISPER_MODEL=medium
# ==========================================

echo -e "${BLUE}${BOLD}"
echo "  ███╗   ██╗███████╗██╗    ██╗██╗  ██╗ █████╗ ████████╗"
echo "  ████╗  ██║██╔════╝██║    ██║██║  ██║██╔══██╗╚══██╔══╝"
echo "  ██╔██╗ ██║█████╗  ██║ █╗ ██║███████║███████║   ██║   "
echo "  ██║╚██╗██║██╔══╝  ██║███╗██║██╔══██║██╔══██║   ██║   "
echo "  ██║ ╚████║███████╗╚███╔███╔╝██║  ██║██║  ██║   ██║   "
echo "  ╚═╝  ╚═══╝╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   "
echo -e "${NC}"
echo -e "  ${YELLOW}${BOLD}60 Ngày Thay Đổi Cuộc Đời${NC}"
echo "  ──────────────────────────────────────────────────"
echo ""

cd "$DIR"

# 1. PostgreSQL (Disabled - migrated to SQLite)
printf "  ${BLUE}[1/5]${NC} PostgreSQL... "
echo -e "${YELLOW}– Đã chuyển sang SQLite${NC}"

# 2. LuxTTS & 3. Vietnamese TTS (Moved to /tts directory)
printf "  ${BLUE}[2/3]${NC} TTS Services... "
echo -e "${YELLOW}– Đã tách sang thư mục /tts (Vui lòng chạy /tts/start.sh)${NC}"

# 4. Whisper STT (Moved to /stt directory)
printf "  ${BLUE}[4/6]${NC} Whisper STT... "
echo -e "${YELLOW}– Đã tách sang thư mục /stt${NC}"


# 5. Edge TTS Server (Moved to /tts directory)
printf "  ${BLUE}[5/7]${NC} Edge TTS... "
echo -e "${YELLOW}– Đã tách sang thư mục /tts${NC}"

# 6. AI Server
printf "  ${BLUE}[6/7]${NC} AI Server 192.168.1.9:8080... "
curl -s --max-time 2 http://192.168.1.9:8080/health > /dev/null 2>&1 \
  && echo -e "${GREEN}✓ online${NC}" || echo -e "${YELLOW}– offline${NC}"

# 7. Next.js
echo -e "  ${BLUE}[7/7]${NC} Khởi động NewHat App..."
lsof -ti:8006 | xargs kill -9 2>/dev/null || true; sleep 1

echo ""
  echo -e "  ${GREEN}┌──────────────────────────────────────────┐${NC}"
  echo -e "  ${GREEN}│  🚀  http://localhost:8006               │${NC}"
  echo -e "  ${GREEN}│  ⚡  EdgeTTS: http://localhost:5002 (Fast)│${NC}"
  echo -e "  ${GREEN}│  🔊  LuxTTS:  http://localhost:8880 (Lazy)│${NC}"
  echo -e "  ${GREEN}│  🎙️   VN TTS:  http://localhost:5001 (Hybr)│${NC}"
  echo -e "  ${GREEN}│  🎤  Whisper: http://localhost:9000 (Hybr)│${NC}"
  echo -e "  ${GREEN}│  🗄️   PostgreSQL: newhat@localhost:5432   │${NC}"
  echo -e "  ${GREEN}└──────────────────────────────────────────┘${NC}"
echo ""

# Chạy app trong background (Standalone mode siêu nhẹ)
export PORT=8006
export HOSTNAME="0.0.0.0"

# Nạp biến môi trường từ .env và .env.local
if [ -f "$DIR/.env" ]; then
  set -a; source "$DIR/.env"; set +a
fi
if [ -f "$DIR/.env.local" ]; then
  set -a; source "$DIR/.env.local"; set +a
fi

# Đảm bảo các file cần thiết có trong standalone folder
mkdir -p "$DIR/.next/standalone/.next/static"
cp -r "$DIR/public" "$DIR/.next/standalone/" 2>/dev/null || true
cp -r "$DIR/.next/static" "$DIR/.next/standalone/.next/" 2>/dev/null || true
cp -r "$DIR/prisma" "$DIR/.next/standalone/" 2>/dev/null || true

nohup node "$DIR/.next/standalone/server.js" > /tmp/newhat_app.log 2>&1 &

echo -n "  Đang kiểm tra kết nối... "
for i in {1..30}; do
  if curl -s http://localhost:8006 > /dev/null; then
    echo -e "${GREEN}✓ OK${NC}"
    echo ""
    echo -e "  ${YELLOW}Đã khởi động thành công!${NC}"
    echo -e "  ${YELLOW}Cửa sổ Terminal này sẽ tự động đóng sau 3 giây...${NC}"
    sleep 3
    # Lệnh AppleScript để tắt Terminal window
    osascript -e 'tell application "Terminal" to close (every window whose name contains "start.sh")' &
    exit 0
  fi
  echo -n "."
  sleep 1
done

echo -e "\n  ${RED}✗ App chưa sẵn sàng sau 30 giây.${NC}"
echo -e "  Vui lòng kiểm tra log: ${BOLD}tail -f /tmp/newhat_app.log${NC}"
