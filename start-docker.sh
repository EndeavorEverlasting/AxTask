#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if command -v npm >/dev/null 2>&1; then
  npm run docker:up
else
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js is required to start Docker locally; please install Node.js or run npm" >&2
    exit 1
  fi
  exec node tools/local/docker-start.mjs
fi
