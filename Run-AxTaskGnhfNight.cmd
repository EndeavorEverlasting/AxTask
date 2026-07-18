@echo off
setlocal
cd /d "%~dp0" || exit /b 1
pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File ".\scripts\ops\Start-AxTaskGnhfNight.ps1" -RepairControlPlane
set "_code=%ERRORLEVEL%"
if not "%_code%"=="0" pause
endlocal & exit /b %_code%
