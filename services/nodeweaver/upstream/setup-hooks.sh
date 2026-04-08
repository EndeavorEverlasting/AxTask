#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$ROOT_DIR"

echo "[NodeWeaver] Configuring git hooks path..."
git config core.hooksPath .githooks

echo "[NodeWeaver] Syncing dependencies..."
if command -v python3 >/dev/null 2>&1; then
  python3 scripts/sync_dependencies.py --with-dev
elif command -v python >/dev/null 2>&1; then
  python scripts/sync_dependencies.py --with-dev
else
  echo "[NodeWeaver] Python 3 not found. Please run dependency sync manually." >&2
  exit 1
fi

echo "[NodeWeaver] Hook setup complete."
