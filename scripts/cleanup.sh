#!/usr/bin/env bash
# scripts/cleanup.sh — dọn cache/junk an toàn (idempotent).
# Chạy: bash scripts/cleanup.sh [--dry-run]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DRY=${1:-}

echo "==> .DS_Store"
if [[ "$DRY" == "--dry-run" ]]; then
  find "$ROOT" -name ".DS_Store" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/.venv/*" -print
else
  find "$ROOT" -name ".DS_Store" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/.venv/*" -delete -print | wc -l | xargs echo "  removed:"
fi

echo "==> __pycache__"
if [[ "$DRY" == "--dry-run" ]]; then
  find "$ROOT" -type d -name "__pycache__" -not -path "*/.venv/*" -not -path "*/node_modules/*" -print
else
  COUNT=$(find "$ROOT" -type d -name "__pycache__" -not -path "*/.venv/*" -not -path "*/node_modules/*" | wc -l | tr -d ' ')
  find "$ROOT" -type d -name "__pycache__" -not -path "*/.venv/*" -not -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true
  echo "  removed: $COUNT directories"
fi

echo "==> *.pyc"
if [[ "$DRY" == "--dry-run" ]]; then
  find "$ROOT" -name "*.pyc" -not -path "*/.venv/*" -print
else
  find "$ROOT" -name "*.pyc" -not -path "*/.venv/*" -delete -print 2>/dev/null | wc -l | xargs echo "  removed:"
fi

echo "==> Vite cache"
for cache in "$ROOT/frontend/node_modules/.vite" "$ROOT/frontend/.vite"; do
  if [[ -d "$cache" ]]; then
    if [[ "$DRY" == "--dry-run" ]]; then
      echo "  would rm -rf $cache"
    else
      rm -rf "$cache" && echo "  removed: $cache"
    fi
  fi
done

echo "==> Xong. Cleanup sâu hơn (learn/.next, logs, *.db) cần review thủ công."
