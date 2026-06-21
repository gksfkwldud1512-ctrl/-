@echo off
title Miso Gas Station Automation

cd /d "%~dp0"

echo.
echo  ========================================
echo   Miso Gas Station Automation v2.1.0
echo   http://localhost:3000
echo  ========================================
echo.

:: 방화벽 규칙 추가 (모바일 공유용 포트 3000 허용)
netsh advfirewall firewall delete rule name="Miso Gas Station 3000" >nul 2>&1
netsh advfirewall firewall add rule name="Miso Gas Station 3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1

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
