@echo off
setlocal
cd /d "%~dp0"

where docker >nul 2>&1
if errorlevel 1 (
  echo [AxTask] Docker is not installed or not on PATH.
  echo [AxTask] Install Docker Desktop on workstations, or Docker Engine + Compose plugin on servers.
  pause
  exit /b 1
)

docker compose version >nul 2>&1
if errorlevel 1 (
  echo [AxTask] Docker Compose v2 plugin is missing.
  pause
  exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
  echo [AxTask] Docker engine is not running. Start Docker Desktop and try again.
  pause
  exit /b 1
)

if not exist ".env.docker" (
  copy /y ".env.docker.example" ".env.docker" >nul
  echo [AxTask] Created .env.docker from .env.docker.example
)

findstr /C:"replace-with-32-plus-char-secret" ".env.docker" >nul 2>&1
if not errorlevel 1 (
  echo [AxTask] Update SESSION_SECRET in .env.docker before startup.
  pause
  exit /b 1
)

findstr /C:"replace-me" ".env.docker" >nul 2>&1
if not errorlevel 1 (
  echo [AxTask] Replace placeholder values in .env.docker before startup.
  pause
  exit /b 1
)

echo [AxTask] Starting Docker stack...
docker compose --env-file .env.docker up -d --build
set EXIT_CODE=%ERRORLEVEL%
docker compose --env-file .env.docker ps
if not "%EXIT_CODE%"=="0" (
  echo.
  echo [AxTask] Docker startup failed. Review errors above.
  pause
)
exit /b %EXIT_CODE%
