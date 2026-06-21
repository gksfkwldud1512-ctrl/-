@echo off
title Miso Gas Station Automation

:: 방화벽 규칙 확인 (관리자 없이도 확인 가능)
netsh advfirewall firewall show rule name="Miso Gas Station 3000" >nul 2>&1
if %errorLevel% neq 0 (
    :: 규칙 없음 → 관리자 권한 필요 (최초 1회)
    net session >nul 2>&1
    if %errorLevel% neq 0 (
        echo  [방화벽] 최초 설정을 위해 관리자 권한이 필요합니다...
        powershell -Command "Start-Process '%~f0' -Verb RunAs -WorkingDirectory '%~dp0'"
        exit /b
    )
    :: 관리자 권한 있음 → 규칙 추가
    netsh advfirewall firewall add rule name="Miso Gas Station 3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
    echo  [방화벽] 포트 3000 허용 설정 완료 ^(이후 더블클릭만으로 실행됩니다^)
) else (
    echo  [방화벽] 설정 확인됨 ^(정상^)
)

cd /d "%~dp0"

echo.
echo  ========================================
echo   미소주유소 자동화 v2.38.0
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
