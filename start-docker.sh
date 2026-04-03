#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "[AxTask] Docker is not installed or not on PATH."
  echo "[AxTask] Install Docker Desktop on workstations, or Docker Engine + Compose plugin on servers."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[AxTask] Docker Compose v2 plugin is missing."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "[AxTask] Docker engine is not running. Start Docker Desktop and try again."
  exit 1
fi

if [[ ! -f ".env.docker" ]]; then
  cp ".env.docker.example" ".env.docker"
  echo "[AxTask] Created .env.docker from .env.docker.example"
fi

if grep -Eq "replace-with-32-plus-char-secret|replace-me" ".env.docker"; then
  echo "[AxTask] Replace placeholder values in .env.docker before startup."
  exit 1
fi

echo "[AxTask] Starting Docker stack..."
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
