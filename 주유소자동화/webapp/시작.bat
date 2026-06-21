@echo off
cd /d "%~dp0"

echo.
echo  ===========================
echo   Miso Gas Station v2.38
echo   http://localhost:3000
echo  ===========================
echo.

for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 "') do (
    if not "%%a"=="PID" taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

if not exist node_modules (
    echo Installing packages...
    call npm install
)

start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

echo Server running. Press Ctrl+C to stop.
echo.

node server.js

pause
