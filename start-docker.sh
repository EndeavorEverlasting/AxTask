#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if command -v npm >/dev/null 2>&1; then
  npm run docker:up
else
  exec node tools/local/docker-start.mjs
fi
