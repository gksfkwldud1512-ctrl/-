@echo off
chcp 65001 >nul
title 미소주유소 자동화

echo.
echo  ========================================
echo   미소주유소 자동화 웹앱 시작
echo  ========================================
echo.

cd /d "%~dp0"

:: 이미 실행 중인 서버가 있으면 종료
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 "') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: 최초 실행 시 패키지 설치
if not exist node_modules (
    echo  패키지 설치 중... (최초 1회만 실행됩니다)
    npm install
    echo.
)

echo  웹앱을 시작합니다...
echo  브라우저에서 http://localhost:3000 을 열어주세요
echo.
echo  종료하려면 이 창을 닫거나 Ctrl+C 를 누르세요.
echo.

:: 서버 먼저 시작, 2초 후 브라우저 열기 (별도 창에서 비동기 실행)
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

node server.js

pause
