@echo off
cd /d "%~dp0"
echo Starting the Nukhab database...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-database.ps1"
if errorlevel 1 (
  pause
  exit /b 1
)
echo Starting Nukhab on http://localhost:3000 ...
call npm.cmd run dev:full
pause
