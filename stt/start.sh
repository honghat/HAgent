#!/bin/bash

# ============================================================
#  STT Service Manager — HAgent
#  Starts SenseVoice STT (port 9000)
# ============================================================

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
cd "$DIR"

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

echo -e "${BLUE}${BOLD}Starting STT Service (SenseVoice)...${NC}"

if [ ! -d ".venv" ]; then
    echo -e "${YELLOW}Creating virtual environment...${NC}"
    python3 -m venv .venv
fi

source .venv/bin/activate 2>/dev/null || source .venv/bin/bin/activate

if [ ! -f ".deps_installed" ]; then
    echo -e "${YELLOW}Installing dependencies for SenseVoice...${NC}"
    pip install --upgrade pip
    pip install fastapi uvicorn python-multipart numpy funasr modelscope faster-whisper
    pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
    touch .deps_installed
fi

if ! python3 - <<'PY' >/dev/null 2>&1
import torch  # noqa: F401
import funasr  # noqa: F401
PY
then
    echo -e "${YELLOW}Repairing missing SenseVoice dependencies...${NC}"
    pip install fastapi uvicorn python-multipart numpy funasr modelscope faster-whisper
    pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
fi

printf "  ${BLUE}[1/1]${NC} SenseVoice STT (9000)... "
lsof -ti:9000 | xargs kill -9 2>/dev/null || true
mkdir -p "$ROOT/logs"
nohup setsid -f python3 sensevoice_server.py > "$ROOT/logs/stt.log" 2>&1 < /dev/null
echo -e "${GREEN}✓ started${NC}"

echo ""
echo -e "${GREEN}${BOLD}SenseVoice STT is running!${NC}"
echo -e "  Endpoint: http://localhost:9000/v1/audio/transcriptions"
echo ""
