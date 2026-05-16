#!/bin/bash

# ============================================================
#  STT Service Manager — HAgent
#  Starts Whisper Hybrid Proxy (Groq + Local)
# ============================================================

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Colors
BLUE='\033[0;34m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

echo -e "${BLUE}${BOLD}Starting STT Service...${NC}"

# Virtual Environment
if [ ! -d ".venv" ]; then
    echo -e "${YELLOW}Creating virtual environment...${NC}"
    python3 -m venv .venv
fi

source .venv/bin/activate 2>/dev/null || source .venv/bin/bin/activate

# Install dependencies
if [ ! -f ".deps_installed" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    pip install --upgrade pip
    pip install fastapi uvicorn requests python-multipart
    touch .deps_installed
fi

# Whisper Server (Port 9000)
printf "  ${BLUE}[1/1]${NC} Whisper Hybrid (9000)... "
lsof -ti:9000 | xargs kill -9 2>/dev/null || true
mkdir -p logs
nohup python3 whisper_server.py > logs/stt.log 2>&1 &
echo -e "${GREEN}✓ started${NC}"

echo ""
echo -e "${GREEN}${BOLD}STT service is running!${NC}"
echo -e "  Endpoint: http://localhost:9000/v1/audio/transcriptions"
echo ""
