#!/usr/bin/env bash
# omnichannel_setup.sh - Quick setup & verify cho Hagent Omnichannel Hub
# Usage: source ~/.hagent/plugins/platforms/omnichannel/setup_omnichannel.sh

set -e  # Exit on any error

echo "═══════════════════════════════════════════════════════════"
echo "    🚀 OMNICHANNEL HUB SETUP & TEST - HEMES GATEWAY"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: python3 not found. Install from brew or python.org"
    exit 1
fi
echo "✅ Python3 available: $(python3 --version)"

# Check required directories
OMNI_DIR="$HOME/.hagent/plugins/platforms/omnichannel"
if [ ! -d "$OMNI_DIR" ]; then
    echo "❌ Error: Omnichannel directory not found at $OMNI_DIR"
    echo "   Running setup to create placeholder files..."
    
    mkdir -p "$OMNI_DIR"
    
    # Create env.example as reference
    cat > "${OMNI_DIR}/.env.example" << 'EOF'
# ==========================================
# OMNICHANNEL HUB CONFIGURATION
# Copy Zalo/Facebook cookies here to activate
# ==========================================

# --- ZALO (REQUIRED) ---
ZALO_COOKIE_STRING='PHPSESSID=dummy; zalome_userid=123; _zalo_session=xxx'
ZALO_BOT_UID='9876543210'  # Optional, auto-detect if not set

# --- FACEBOOK (OPTIONAL) ---
FACEBOOK_COOKIE_STRING='c_user=123456; ux=abc123; datr=xyz789'
FACEBOOK_HEADLESS=false

# ==========================================
OMNICHANNEL_ENABLED=true
OMNICHANNEL_ZALO_ADAPTER=/Users/nguyenhat/.hagent/plugins/platforms/zalo/adapter.py
OMNICHANNEL_FB_ADAPTER=/Users/nguyenhat/.hagent/plugins/platforms/facebook/adapter.py
EOF
    echo "✅ Created $OMNI_DIR/.env.example"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "📋 NEXT STEPS:"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "1️⃣  Get Zalo Cookie:"
echo "   → Open: https://chat.zalo.me in browser"
echo "   → Login with your Zalo account"  
echo "   → Press F12 → Application → Cookies → zalome.com"
echo "   → Copy full string and paste into ~/.hagent/omnichannel.env"
echo ""
echo "2️⃣  Get ZALO_BOT_UID:"
echo "   → After login, press F12 → Console tab"
echo "   → Find your bot/user ID (usually shown in localStorage)"
echo "   → Paste into ~/.hagent/omnichannel.env"
echo ""
echo "3️⃣  (Optional) Facebook:"
echo "   → Same process but for facebook.com/fbsbx.com cookies"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "🧪 QUICK TEST COMMANDS:"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Show current status from env file if exists
ENV_FILE="$HOME/.hagent/omnichannel.env"
if [ -f "$ENV_FILE" ]; then
    echo "# Status Check:"
    echo "  source ~/.hagent/omnichannel.env"
    echo "  # Verify:"
    echo "  echo 'ZALO_COOKIE: ${ZALO_COOKIE_STRING}'"
    echo "  echo 'OMNICHANNEL_ENABLED: $OMNICHANNEL_ENABLED'"
    echo ""
fi

echo "═══════════════════════════════════════════════════════════"
echo "📡 READY TO RUN:"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "# Initialize omnichannel hub:"
echo "  python3 $OMNI_DIR/init.py"
echo ""
echo "# Run full test (requires cookies set):"  
echo "  python3 $OMNI_DIR/test_omnichannel.py $ENV_FILE"
echo ""
echo "═══════════════════════════════════════════════════════════"
