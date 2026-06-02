@echo off
title Miso Gas Station Automation

cd /d "%~dp0"

echo.
echo  ========================================
echo   Miso Gas Station Automation v2.0.0
echo   http://localhost:3000
echo  ========================================
echo.

:: Kill existing server on port 3000
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000"') do (
    if not "%%a"=="PID" taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul

:: Install packages on first run
if not exist node_modules (
    echo Installing packages...
    call npm install
    echo.
)

:: Open browser after 3 seconds
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

echo  Server running. Press Ctrl+C to stop.
echo.

node server.js

echo.
echo  Server stopped.
pause
