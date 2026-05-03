@echo off
setlocal
cd /d "%~dp0"
echo [AxTask] Starting one-click offline mode...
npm run offline:start
set EXIT_CODE=%ERRORLEVEL%
if not "%EXIT_CODE%"=="0" (
  echo.
  echo [AxTask] Offline startup failed. Review errors above.
  pause
)
exit /b %EXIT_CODE%
