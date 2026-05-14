#!/bin/bash

# ============================================================
#  TTS Services Manager — HAgent
#  Starts Edge-TTS, Piper, and LuxTTS
# ============================================================

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Colors
BLUE='\033[0;34m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

echo -e "${BLUE}${BOLD}Starting TTS Services...${NC}"

# Virtual Environment
if [ ! -d ".venv" ]; then
    echo -e "${YELLOW}Creating virtual environment...${NC}"
    python3 -m venv .venv
fi

source .venv/bin/bin/activate 2>/dev/null || source .venv/bin/activate

# Install dependencies if needed
if [ ! -f ".deps_installed" ]; then
    echo -e "${YELLOW}Installing dependencies... (this may take a while)${NC}"
    pip install --upgrade pip
    pip install flask edge-tts aiohttp piper-tts
    if [ -f "LuxTTS/requirements.txt" ]; then
        pip install -r LuxTTS/requirements.txt
    fi
    touch .deps_installed
fi

# 1. Edge-TTS Server (Port 5002)
printf "  ${BLUE}[1/3]${NC} Edge TTS (5002) [Fast]... "
lsof -ti:5002 | xargs kill -9 2>/dev/null || true
nohup python3 edge_tts_server.py > logs/edge_tts.log 2>&1 &
echo -e "${GREEN}✓ started${NC}"

# 2. Piper TTS Server (Port 5001)
printf "  ${BLUE}[2/3]${NC} Piper TTS (5001) [Local]... "
lsof -ti:5001 | xargs kill -9 2>/dev/null || true
nohup python3 piper_server.py > logs/piper.log 2>&1 &
echo -e "${GREEN}✓ started${NC}"

# 3. LuxTTS Server (Port 8880)
printf "  ${BLUE}[3/3]${NC} LuxTTS (8880) [Lazy]... "
if [ -f "LuxTTS/server.py" ]; then
    lsof -ti:8880 | xargs kill -9 2>/dev/null || true
    cd LuxTTS
    nohup python3 server.py > ../logs/luxtts.log 2>&1 &
    cd ..
    echo -e "${GREEN}✓ started${NC}"
else
    echo -e "${RED}✗ LuxTTS/server.py not found${NC}"
fi

echo ""
echo -e "${GREEN}${BOLD}All TTS services are running!${NC}"
echo -e "  EdgeTTS: http://localhost:5002"
echo -e "  Piper:   http://localhost:5001"
echo -e "  LuxTTS:  http://localhost:8880"
echo ""
