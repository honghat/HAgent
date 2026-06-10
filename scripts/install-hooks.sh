#!/usr/bin/env bash
# scripts/install-hooks.sh — link git hooks vào .git/hooks
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_SRC="$ROOT/scripts/git-hooks"
HOOKS_DST="$ROOT/.git/hooks"

if [[ ! -d "$HOOKS_DST" ]]; then
  echo "❌ Không tìm thấy $HOOKS_DST. Đang ở repo git chứ?" >&2
  exit 1
fi

for hook in "$HOOKS_SRC"/*; do
  name=$(basename "$hook")
  chmod +x "$hook"
  ln -sf "$hook" "$HOOKS_DST/$name"
  echo "✓ Linked $name"
done

echo ""
echo "✅ Hooks installed. Test: git commit --dry-run"
