#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "[AxTask] Docker is not installed or not on PATH."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "[AxTask] Docker engine is not running."
  exit 1
fi

docker compose --env-file .env.docker ps
