#!/bin/bash
# Hagent Platform Setup Wizard - Zalo & Facebook Messenger

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}  Hagent Zalo & Facebook Setup Wizard${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HAGENT_HOME="${HAGENT_HOME:-$(cd "$SCRIPT_DIR/../../backend" && pwd)}"
PLATFORMS_DIR="${HAGENT_HOME}/plugins/platforms"

# --- CHECK EXISTING COOKIES ---
echo -e "${YELLOW}[1/6] Checking existing credentials...${NC}"

if [ -f "${HAGENT_HOME}/plugins/platforms/zalo/plugin.yaml" ]; then
    ZALO_COOKIE=$(grep -oP 'ZALO_COOKIE_STRING:\s*\K.*' ~/.bashrc ~/.zshrc 2>/dev/null | head -1)
    
    if [ -n "$ZALO_COOKIE" ] && [[ "$ZALO_COOKIE" == *"PHPSESSID"* ]]; then
        echo -e "${GREEN}✓ Zalo credentials found in shell profile${NC}"
        ZALO_READY=true
    else
        echo -e "${YELLOW}⚠ Zalo cookies not found (yet)...${NC}"
        ZALO_READY=false
    fi
else
    echo -e "${RED}✗ Zalo plugin.yaml missing!${NC}"
    exit 1
fi

if [ -f "${HAGENT_HOME}/plugins/platforms/facebook/plugin.yaml" ]; then
    FB_COOKIE=$(grep -oP 'FACEBOOK_COOKIE_STRING:\s*\K.*' ~/.bashrc ~/.zshrc 2>/dev/null | head -1)
    
    if [ -n "$FB_COOKIE" ] && [[ "$FB_COOKIE" == *"c_user"* ]]; then
        echo -e "${GREEN}✓ Facebook cookies found in shell profile${NC}"
        FB_READY=true
    else
        echo -e "${YELLOW}⚠ Facebook cookies not found (yet)...${NC}"
        FB_READY=false
    fi
else
    echo -e "${RED}✗ Facebook plugin.yaml missing!${NC}"
    exit 1
fi

echo ""

# --- SETUP ZALO CREDENTIALS IF NEEDED ---
if [ "$ZALO_READY" = false ]; then
    echo -e "${YELLOW}[2/6] Zalo Setup Required...${NC}"
    
    # Open browser for Zalo login
    echo "Opening Chrome to https://zalo.me/..."
    open -a "Google Chrome" "https://zalo.me/" 2>/dev/null || \
    echo -e "${YELLOW}  (Manual: Open Chrome → zalo.me in browser)${NC}"
    
    echo ""
    echo -e "${BLUE}=== ZALO CREDENTIALS SETUP ===${NC}"
    echo ""
    echo "1. Login to Zalo at https://zalo.me/"
    echo "2. Open DevTools (F12) → Application → Cookies → zalome.com tab"
    echo "3. Click 'Copy as curl' on the FIRST cookie line (PHPSESSID=...)"
    echo ""
    read -p "4. Paste cookie string here: " ZALO_COOKIE_INPUT
    
    # Save to .bashrc
    ZALO_COOKIE_LINE='export ZALO_COOKIE_STRING="'${ZALO_COOKIE_INPUT}'"'
    if ! grep -q "^${ZALO_COOKIE_LINE}$" ~/.zshrc; then
        echo "${ZALO_COOKIE_LINE}" >> ~/.zshrc
    else
        # Replace existing line
        sed -i '' "s/^${ZALO_COOKIE_LINE}.*$/${ZALO_COOKIE_LINE}/" ~/.zshrc
    fi
    
    echo ""
    echo -e "${GREEN}✓ Zalo credentials saved to ~/.zshrc${NC}"
    
    # Get IMEI (optional, for bot identification)
    read -p "5. Enter your device type (iPhone16,1 or Samsung SM-xxx): " ZALO_IMEI_DEFAULT
    
    export ZALO_IMEI="${ZALO_IMEI_DEFAULT:-iPhone16,1}"
    
    # Get Bot UID (optional)
    echo -p "6. Or skip Bot UID for now (set later after first login): " ZALO_BOT_UID
    
    if [ -z "$ZALO_BOT_UID" ]; then
        echo "${ZALO_COOKIE_LINE}" >> ~/.bashrc 2>/dev/null || true
        sed -i '' "/^${ZALO_COOKIE_LINE}.*$/d" ~/.bashrc 2>/dev/null || true
    fi
    
    source ~/.zshrc
fi

echo ""

# --- SETUP FACEBOOK COOKIES IF NEEDED ---
if [ "$FB_READY" = false ]; then
    echo -e "${YELLOW}[3/6] Facebook Setup Required...${NC}"
    
    # Check if Playwright is installed
    if ! python3 -c "import playwright" 2>/dev/null; then
        echo ""
        echo -e "${BLUE}Installing Playwright...${NC}"
        pip install playwright 2>/dev/null || \
        echo -e "${YELLOW}⚠ Could not install Playwright. You'll need to set cookies manually.${NC}"
    fi
    
    # Install browser if needed
    if [ -n "$(command -v playwright)" ]; then
        playwright install chromium 2>/dev/null || true
        echo ""
        echo -e "${GREEN}✓ Playwright installed${NC}"
    else
        echo -e "${YELLOW}⚠ Playwright not available, skipping auto-install${NC}"
    fi
    
    # Open browser for Facebook login
    echo "Opening Chrome to https://facebook.com/..."
    open -a "Google Chrome" "https://facebook.com/" 2>/dev/null || \
    echo -e "${YELLOW}  (Manual: Open Chrome → facebook.com in browser)${NC}"
    
    echo ""
    echo -e "${BLUE}=== FACEBOOK COOKIES SETUP ===${NC}"
    echo ""
    echo "1. Login to Facebook at https://facebook.com/"
    echo "2. Open DevTools (F12) → Application → Cookies → fbsbx.com tab"
    echo "3. Click 'Copy as curl' on the FIRST cookie line (c_user=...)"
    echo ""
    read -p "4. Paste cookie string here: " FB_COOKIE_INPUT
    
    # Save to .bashrc
    FB_COOKIE_LINE='export FACEBOOK_COOKIE_STRING="'${FB_COOKIE_INPUT}'"'
    if ! grep -q "^${FB_COOKIE_LINE}$" ~/.zshrc; then
        echo "${FB_COOKIE_LINE}" >> ~/.zshrc
    else
        sed -i '' "s/^${FB_COOKIE_LINE}.*$/${FB_COOKIE_LINE}/" ~/.zshrc
    fi
    
    echo ""
    echo -e "${GREEN}✓ Facebook cookies saved to ~/.zshrc${NC}"
    
    # Set optional env vars
    read -p "5. Display name for Hagent bot (leave empty for default): " FB_BOT_NAME
    
    export FACEBOOK_HEADLESS=false
fi

echo ""

# --- START HAGENT GATEWAY ---
echo -e "${BLUE}[4/6] Starting Hagent Gateway...${NC}"

cd "${HOME}/hagent-agent" 2>/dev/null || \
{ echo -e "${RED}Error: ~/hagent-agent not found!${NC}"; exit 1; }

# Activate venv and start gateway
source "${HOME}/hagent-agent/venv/bin/activate"

echo ""
echo -e "${BLUE}Gateway starting (Ctrl+C to stop)...${NC}"
echo ""

python "${HOME}/hagent-agent/hagent_cli/main.py" gateway run --replace 2>&1 &

GATEWAY_PID=$!
echo $GATEWAY_PID > ~/hagent_gateway.pid

# Save PID for cleanup
trap "kill $GATEWAY_PID 2>/dev/null; rm -f ~/hagent_gateway.pid" EXIT TERM INT

echo -e "${GREEN}✓ Gateway started (PID: ${GATEWAY_PID})${NC}"
echo ""
echo -e "${BLUE}[5/6] Checking platform status...${NC}"
sleep 3

# Check gateway is responding
if curl -s http://localhost:8000/platforms > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Gateway health check passed${NC}"
else
    echo -e "${YELLOW}⚠ Gateway might still be starting...${NC}"
fi

echo ""

# --- SHOW PLATFORM STATUS ---
echo -e "${BLUE}[6/6] Platform Status:${NC}"
echo ""
echo "Zalo:      ${GREEN}$ZALO_READY (credentials in ~/.zshrc)${NC}"
echo "Facebook:  ${GREEN}$FB_READY (cookies in ~/.zshrc)${NC}"
echo "Telegram:  ${BLUE}(Built-in, already running)${NC}"
echo ""

# --- SHOW NEXT STEPS ---
echo -e "${YELLOW}=== SETUP COMPLETE ===${NC}"
echo ""
echo "✅ Zalo & Facebook Messenger integration ready!"
echo ""
echo "Next steps:"
echo "  1. Check logs: tail -f ${HAGENT_HOME}/logs/gateway-autostart-output.log"
echo "  2. Test sending: hagent deliver zalo --chat YOUR_ID --message 'Hello!'"
echo "  3. Send to FB: hagent deliver facebook --chat YOUR_THREAD_ID --message 'Hi there!'"
echo ""
echo "📚 Documentation:"
echo "   - ${HAGENT_HOME}/plugins/platforms/SETUP_ZALO_FB.md"
echo "   - $(cd "$SCRIPT_DIR/.." && pwd)/platforms/extract_cookies.md"
echo ""

echo -e "${BLUE}=== GATEWAY LOGS ===${NC}"
tail -f "${HAGENT_HOME}/logs/gateway-autostart-output.log" 2>/dev/null || \
echo "Logs file not found yet (gateway just started)"
