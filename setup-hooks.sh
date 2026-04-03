#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$ROOT_DIR"

echo "[AxTask] Configuring git hooks path..."
git config core.hooksPath .githooks

echo "[AxTask] Syncing dependencies..."
npm run deps:sync

echo "[AxTask] Hook setup complete."
