#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$ROOT_DIR/searxng-src"
VENV_DIR="$ROOT_DIR/.venv"
BACKEND_PYTHON="$ROOT_DIR/../.venv/bin/python"

if [[ ! -x "$BACKEND_PYTHON" ]]; then
  echo "Missing backend Python runtime at $BACKEND_PYTHON" >&2
  exit 1
fi

if [[ ! -d "$SRC_DIR/.git" ]]; then
  git clone --depth 1 https://github.com/searxng/searxng.git "$SRC_DIR"
fi

"$BACKEND_PYTHON" -m venv "$VENV_DIR"
"$VENV_DIR/bin/python" -m pip install -U pip setuptools wheel pyyaml msgspec typing-extensions pybind11
"$VENV_DIR/bin/python" -m pip install --use-pep517 --no-build-isolation -e "$SRC_DIR"

echo "Installed SearXNG Lite into $ROOT_DIR"
