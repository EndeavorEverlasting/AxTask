@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
  echo [AxTask] npm is required for start-docker.cmd ^(install Node.js^).
  echo [AxTask] Or run: docker compose --env-file .env.docker up -d --build
  pause
  exit /b 1
)

echo [AxTask] Smart Docker startup ^(npm run docker:up^)...
call npm run docker:up
set EXIT_CODE=%ERRORLEVEL%
if not "%EXIT_CODE%"=="0" (
  echo.
  echo [AxTask] Docker startup failed. Review errors above.
  pause
)
exit /b %EXIT_CODE%
