#!/bin/bash
# Auto-mount remote 4TB SMB share — triggered by launchd on network change
exec "$(dirname "$0")/mount-smb.sh" "100.69.50.64" "My4TBShare"