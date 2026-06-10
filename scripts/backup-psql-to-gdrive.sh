#!/bin/bash
# Backup toàn bộ PostgreSQL cluster (pg_dumpall) → upload lên Google Drive qua HAgent API.
# Local file xoá ngay sau khi upload (user chọn không giữ bản local).
set -euo pipefail

FOLDER_ID="1HT4KmJB70kQPFz2CklcB4dysnknsXqS4"
PG_USER="nguyenhat"
LOG="/Users/nguyenhat/HAgent/logs/db-backup.log"
STAMP=$(date +%Y%m%d_%H%M%S)
TMP_FILE="/tmp/hagent_pg_dumpall_${STAMP}.sql.gz"

mkdir -p "$(dirname "$LOG")"
exec >> "$LOG" 2>&1

echo "=== $(date '+%Y-%m-%d %H:%M:%S') backup start ==="
/opt/homebrew/bin/pg_dumpall -U "$PG_USER" | gzip > "$TMP_FILE"
SIZE=$(stat -f%z "$TMP_FILE")
echo "dump: $TMP_FILE ($SIZE bytes)"

RESPONSE=$(curl -sS --max-time 600 -X POST http://127.0.0.1:8010/api/drive/upload-path \
  -H 'Content-Type: application/json' \
  -d "{\"path\":\"$TMP_FILE\",\"folder_id\":\"$FOLDER_ID\"}")
echo "upload: $RESPONSE"

notify() {
  curl -sS -m 4 -X POST \
    "http://127.0.0.1:8010/api/agent/stream/broadcast?event_type=agent.notification" \
    -H 'Content-Type: application/json' \
    -d "{\"message\":\"$1\"}" > /dev/null 2>&1 || true
}

if echo "$RESPONSE" | grep -q '"file"'; then
  rm -f "$TMP_FILE"
  HUMAN=$(awk -v s=$SIZE 'BEGIN{printf "%.1f KB", s/1024}')
  notify "Postgres backup → Drive xong ($HUMAN)"
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') done ok ==="
else
  notify "Postgres backup thất bại"
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') FAILED, file kept at $TMP_FILE ==="
  exit 1
fi
