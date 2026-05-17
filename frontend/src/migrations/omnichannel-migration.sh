#!/bin/bash
# OMNICHANNEL Backend Migration Script
# Tự động copy config và prepare cho tích hợp

set -e

echo "🟢 OMNICHANNEL Backend Migration Started..."

SRC_DIR="/Users/nguyenhat/.hagent/plugins/platforms/omnichannel"
DEST_DIR="/Users/nguyenhat/HAgent/backend/config"

# Create destination directory
mkdir -p "$DEST_DIR"

# Copy .env file if exists
if [ -f "$SRC_DIR/env/config.env" ]; then
    cp "$SRC_DIR/env/config.env" "$DEST_DIR/.omnichannel.env"
    echo "✓ Copied .env configuration"
else
    echo "⚠️  Config.env not found, creating defaults..."
    cat > "$DEST_DIR/.omnichannel.env" << 'EOF'
OMNICHANNEL_ENABLED=true
ZALO_QR_ENABLED=true
OMNICHANNEL_API_PORT=8080
EOF
fi

echo "🟢 Migration completed successfully!"
echo "📁 Config files are now at: $DEST_DIR/.omnichannel.env"
