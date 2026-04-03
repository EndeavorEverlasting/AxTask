@echo off
setlocal
cd /d "%~dp0"

echo [AxTask] Configuring git hooks path...
git config core.hooksPath .githooks
if errorlevel 1 (
  echo [AxTask] Failed to configure git hooks.
  exit /b 1
)

echo [AxTask] Syncing dependencies...
call npm run deps:sync
if errorlevel 1 (
  echo [AxTask] Dependency sync failed.
  exit /b 1
)

echo [AxTask] Hook setup complete.
exit /b 0
