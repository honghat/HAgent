#!/bin/bash
set -u

APP_PATH="/Applications/Hat-BetterDisplay.app"
APP_EXEC="$APP_PATH/Contents/MacOS/Hat-BetterDisplay"
APP_ID="com.hatai.HatBetterDisplay"
BASE_DIR="/Users/nguyenhat/HAgent/scripts"
LOG_PATH="$BASE_DIR/hat_betterdisplay_virtual.log"
LOCK_DIR="/tmp/hatai-hat-betterdisplay-virtual.lock"

if ! /bin/mkdir "$LOCK_DIR" 2>/dev/null; then
  exit 0
fi

cleanup() {
  /bin/rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT

{
  echo "Starting Hat-BetterDisplay activation flow at $(date)"

  /usr/bin/defaults write "$APP_ID" launchAtLogin -bool true
  /usr/bin/defaults write "$APP_ID" syncBrightnessOnStartup -bool true
  /usr/bin/defaults write "$APP_ID" allowUnsafeResolutions -bool true

  if [ -d "$APP_PATH" ]; then
    if ! /usr/bin/osascript -e 'tell application id "com.hatai.HatBetterDisplay" to activate'; then
      /usr/bin/osascript -e 'tell application "/Applications/Hat-BetterDisplay.app" to activate' || true
    fi
  else
    echo "App not found: $APP_PATH"
    exit 1
  fi

  /bin/sleep 8
  "$BASE_DIR/make_ipad_main_display" &
  checker_pid=$!

  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if ! /bin/kill -0 "$checker_pid" 2>/dev/null; then
      break
    fi
    /bin/sleep 2
  done

  if /bin/kill -0 "$checker_pid" 2>/dev/null; then
    echo "Hạt Display not active yet; will retry on next interval"
    /bin/kill "$checker_pid" 2>/dev/null || true
    /bin/wait "$checker_pid" 2>/dev/null || true
  fi

  echo "Finished Hat-BetterDisplay activation flow at $(date)"
} >> "$LOG_PATH" 2>&1
