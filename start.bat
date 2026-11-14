@echo off
setlocal
title ME Report Writer
cd /d "%~dp0"
if errorlevel 1 goto failed
powershell.exe -NoLogo -NoProfile -File "%~dp0scripts\start-local.ps1"
if errorlevel 1 goto failed
exit /b 0

:failed
echo ME Report Writer could not start. Check the message above.
pause
exit /b 1
