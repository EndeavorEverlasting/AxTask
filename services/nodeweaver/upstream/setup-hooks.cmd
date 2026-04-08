@echo off
setlocal
cd /d "%~dp0"

echo [NodeWeaver] Configuring git hooks path...
git config core.hooksPath .githooks
if errorlevel 1 (
  echo [NodeWeaver] Failed to configure git hooks.
  exit /b 1
)

echo [NodeWeaver] Syncing dependencies...
if exist scripts\sync_dependencies.py (
  where py >nul 2>nul
  if %errorlevel%==0 (
    py -3 scripts\sync_dependencies.py --with-dev
  ) else (
    python scripts\sync_dependencies.py --with-dev
  )
)
if errorlevel 1 (
  echo [NodeWeaver] Dependency sync failed.
  exit /b 1
)

echo [NodeWeaver] Hook setup complete.
exit /b 0
