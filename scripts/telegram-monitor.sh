#!/bin/bash
# Telegram monitor for Claude Code
# Usage:
#   ./telegram-monitor.sh daemon   — start long-poll daemon (background)
#   ./telegram-monitor.sh check    — read & clear new messages from inbox
#   ./telegram-monitor.sh stop     — kill daemon

BOT_TOKEN="8079757619:AAHOsEAKci-oQ8M87fp-lysd1z3jOCKIJyo"
PID_FILE="/tmp/tg-daemon.pid"
INBOX="/tmp/tg-inbox.jsonl"
OFFSET_FILE="/tmp/tg-last-update-id"
POLL_TIMEOUT=60

daemon() {
  echo "$$" > "$PID_FILE"
  local offset=""
  [ -f "$OFFSET_FILE" ] && offset=$(cat "$OFFSET_FILE")

  while true; do
    local url="https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?timeout=${POLL_TIMEOUT}"
    [ -n "$offset" ] && url="${url}&offset=${offset}"

    response=$(curl -s "$url" --max-time $((POLL_TIMEOUT + 10)) 2>/dev/null)

    # Parse updates
    echo "$response" | python3 -c "
import json, sys, os
try:
    data = json.load(sys.stdin)
except:
    sys.exit(0)
if not data.get('ok'):
    sys.exit(0)
inbox = os.environ.get('INBOX', '$INBOX')
offset_file = os.environ.get('OFFSET_FILE', '$OFFSET_FILE')
for update in data.get('result', []):
    uid = update['update_id']
    msg = update.get('message') or update.get('edited_message') or {}
    if not msg:
        continue
    entry = {
        'update_id': uid,
        'message_id': msg.get('message_id'),
        'chat_id': str(msg['chat']['id']),
        'from_id': str(msg['from']['id']),
        'date': msg.get('date'),
        'text': msg.get('text', ''),
        'from_name': msg['from'].get('first_name', '')
    }
    with open(inbox, 'a') as f:
        f.write(json.dumps(entry, ensure_ascii=False) + '\n')
    with open(offset_file, 'w') as f:
        f.write(str(uid + 1))
" 2>/dev/null

    # Update offset from file
    if [ -f "$OFFSET_FILE" ]; then
      offset=$(cat "$OFFSET_FILE")
    fi
  done
}

check() {
  if [ ! -f "$INBOX" ]; then
    echo "[]"
    exit 0
  fi

  # Read all messages
  cat "$INBOX" | python3 -c "
import json, sys
lines = [l.strip() for l in sys.stdin if l.strip()]
print(json.dumps(lines, ensure_ascii=False))
" 2>/dev/null

  # Clear inbox
  : > "$INBOX"
}

stop_daemon() {
  if [ -f "$PID_FILE" ]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null
    rm -f "$PID_FILE"
    echo "stopped"
  else
    echo "not running"
  fi
}

case "${1:-check}" in
  daemon) daemon ;;
  check)  check ;;
  stop)   stop_daemon ;;
  *)
    echo "Usage: $0 {daemon|check|stop}"
    exit 1
    ;;
esac
