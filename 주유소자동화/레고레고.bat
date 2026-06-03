@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo [레고레고] 최신 코드를 가져옵니다...
git pull origin main

echo.
echo [완료] 업데이트 완료! 시작.bat으로 서버를 재시작하세요.
pause
