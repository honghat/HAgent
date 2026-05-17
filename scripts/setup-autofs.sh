#!/bin/bash
# Setup autofs for SMB mount - auto-mount on access, no polling

SMB_USER="nguyenhat"
SMB_SERVER="100.69.50.64"
SMB_SHARE="My4TBShare"
MOUNT_POINT="/Users/nguyenhat/mnt/My4TBShare"
PASSWORD=$(security find-internet-password -s "$SMB_SERVER" -a "$SMB_USER" -w 2>/dev/null)

if [ -z "$PASSWORD" ]; then
  echo "❌ Password not found in keychain for $SMB_USER@$SMB_SERVER"
  echo "   Run: security add-internet-password -s $SMB_SERVER -a $SMB_USER -w 'your_password' -r 'smb '"
  exit 1
fi

# Create mount point
mkdir -p "$MOUNT_POINT"

# Write autofs map file
sudo bash -c "cat > /etc/auto_smb << 'EOF'
$MOUNT_POINT	-fstype=smbfs,soft,nosuid,noowners,username=$SMB_USER,password=$PASSWORD	://$SMB_SERVER/$SMB_SHARE
EOF
"

# Add to auto_master if not already present
if ! grep -q "auto_smb" /etc/auto_master 2>/dev/null; then
  echo "/-			/etc/auto_smb		-nobrowse" | sudo tee -a /etc/auto_master > /dev/null
fi

# Restart automount
echo "Restarting autofs..."
sudo automount -vc 2>/dev/null || sudo killall -HUP automountd 2>/dev/null

echo "✅ autofs configured. Access $MOUNT_POINT to trigger mount."
echo "   Works like local folder - mount on access, no polling needed."
