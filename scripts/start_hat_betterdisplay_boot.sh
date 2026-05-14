#!/bin/bash
set -u

USER_ID="501"
USER_NAME="nguyenhat"
FLOW="/Users/nguyenhat/HAgent/scripts/start_hat_betterdisplay_virtual.sh"
LOG_PATH="/Users/nguyenhat/HAgent/scripts/hat_betterdisplay_boot.log"

{
  echo "Boot daemon check at $(date)"

  if /bin/launchctl print "gui/$USER_ID" >/dev/null 2>&1; then
    echo "GUI session found for $USER_NAME; starting Hat-BetterDisplay flow"
    /bin/launchctl asuser "$USER_ID" "$FLOW"
  else
    echo "No GUI session for $USER_NAME yet; virtual display cannot be created before macOS exposes a user WindowServer session"
  fi
} >> "$LOG_PATH" 2>&1
