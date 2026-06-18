@echo off
echo Starting Local Inspect Server...
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "run.ps1"
pause
