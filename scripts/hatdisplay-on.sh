#!/bin/bash
set -euo pipefail

TARGET_UID="${SUDO_UID:-$(stat -f %u /dev/console)}"
HATDISPLAY_APP="/Applications/HatDisplay-iPad-Main.app"

if [ ! -d "${HATDISPLAY_APP}" ]; then
  echo "WARN: Không tìm thấy HatDisplay tại ${HATDISPLAY_APP}" >&2
  exit 0
fi

launchctl asuser "${TARGET_UID}" defaults write com.hatai.HatDisplayIPadMain virtualIPadWidth -int 1024
launchctl asuser "${TARGET_UID}" defaults write com.hatai.HatDisplayIPadMain virtualIPadHeight -int 768
launchctl asuser "${TARGET_UID}" defaults write com.hatai.HatDisplayIPadMain virtualIPadHiDPI -bool true
launchctl asuser "${TARGET_UID}" defaults write com.hatai.HatDisplayIPadMain virtualIPadRefreshRate -int 30
launchctl asuser "${TARGET_UID}" defaults write com.hatai.HatDisplayIPadMain VirtualDisplays -string \
  '[{"height":768,"hiDPI":true,"width":1024,"name":"Hat iPad Virtual Display","refreshRate":30}]'
launchctl asuser "${TARGET_UID}" defaults delete com.hatai.HatDisplayIPadMain autoMakeIPadMain 2>/dev/null || true
launchctl asuser "${TARGET_UID}" /usr/bin/open "${HATDISPLAY_APP}" 2>/dev/null || true

echo "HatDisplay enabled"
