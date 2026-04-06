@echo off
setlocal
cd /d "%~dp0"
echo [AxTask] Schema sync + dev server (same as npm run dev^)...
call npm run dev
set EXIT_CODE=%ERRORLEVEL%
if not "%EXIT_CODE%"=="0" (
  echo.
  echo [AxTask] Dev startup failed. Check DATABASE_URL and Postgres, or set SKIP_DB_PUSH_ON_START=true to skip schema push.
  pause
)
exit /b %EXIT_CODE%
