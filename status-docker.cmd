@echo off
setlocal
cd /d "%~dp0"

where docker >nul 2>&1
if errorlevel 1 (
  echo [AxTask] Docker is not installed or not on PATH.
  exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
  echo [AxTask] Docker engine is not running.
  exit /b 1
)

docker compose --env-file .env.docker ps
exit /b %ERRORLEVEL%
