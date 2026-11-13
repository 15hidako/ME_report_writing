@echo off
setlocal
title ME Report Writer
cd /d "%~dp0"
if errorlevel 1 goto failed

rem Move answer JSON files from Downloads only when ME_ANSWER_DIR is set in .env.local.
findstr /b /c:"ME_ANSWER_DIR=" .env.local >nul 2>&1
if not errorlevel 1 (
    where node.exe >nul 2>&1
    if not errorlevel 1 (
        node.exe scripts\file-answers.mjs
        if errorlevel 1 (
            echo Answer files were not moved. Check the message above. The app will start anyway.
            pause
        )
    )
)

powershell.exe -NoLogo -NoProfile -Command "try { $page = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:5173/' -TimeoutSec 2; if ($page.StatusCode -eq 200 -and $page.Content -match '<title>ME Report Writer</title>') { Start-Process 'http://localhost:5173/'; exit 0 } } catch {}; exit 1"
if not errorlevel 1 exit /b 0

where node.exe >nul 2>&1
if errorlevel 1 (
    echo Node.js is required. Install the version specified in package.json.
    goto failed
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo npm was not found. Check your Node.js installation.
    goto failed
)

if not exist "node_modules\.bin\vite.cmd" (
    echo Dependencies are missing. Run npm ci in this folder, then try again.
    goto failed
)

echo Opening http://localhost:5173/
echo Keep this window open while using the app. Closing it stops the server.
echo To stop the server, press Ctrl+C or close this window.
echo.
call npm.cmd run dev -- --host localhost --port 5173 --strictPort --open
if errorlevel 1 goto failed
exit /b 0

:failed
echo.
echo ME Report Writer could not start. Check the message above.
pause
exit /b 1
