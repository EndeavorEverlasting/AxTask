@echo off
setlocal
cd /d "%~dp0"

where docker >nul 2>&1
if errorlevel 1 (
  echo [AxTask] Docker is not installed or not on PATH.
  pause
  exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
  echo [AxTask] Docker engine is not running. Start Docker Desktop and try again.
  pause
  exit /b 1
)

echo [AxTask] Stopping Docker stack...
docker compose --env-file .env.docker down
set EXIT_CODE=%ERRORLEVEL%
docker compose --env-file .env.docker ps
if not "%EXIT_CODE%"=="0" (
  echo.
  echo [AxTask] Docker shutdown failed. Review errors above.
  pause
)
exit /b %EXIT_CODE%
