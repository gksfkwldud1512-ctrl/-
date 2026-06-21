@echo off
title 미소주유소 자동화
chcp 65001 >nul

cd /d "%~dp0"

echo.
echo  ========================================
echo   Miso Gas Station Automation v2.38.0
echo   http://localhost:3000
echo  ========================================
echo.

:: 방화벽 규칙 추가 (관리자 권한 없으면 조용히 실패해도 무방)
netsh advfirewall firewall show rule name="Miso Gas Station 3000" >nul 2>&1
if %errorLevel% neq 0 (
    netsh advfirewall firewall add rule name="Miso Gas Station 3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
    if %errorLevel% equ 0 (
        echo  [방화벽] 포트 3000 허용 완료
    ) else (
        echo  [안내] 모바일 공유 기능을 처음 사용할 때는
        echo         이 파일을 우클릭 - 관리자 권한으로 실행 하세요 (1회만)
    )
) else (
    echo  [방화벽] 정상
)

:: 기존 서버 종료
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 "') do (
    if not "%%a"=="PID" taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul

:: 최초 실행 시 패키지 설치
if not exist node_modules (
    echo  패키지 설치 중...
    call npm install
    echo.
)

:: 브라우저 자동 열기 (3초 후)
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

echo  서버 실행 중. 종료하려면 Ctrl+C 를 누르세요.
echo.

node server.js

echo.
echo  서버가 종료되었습니다.
pause
