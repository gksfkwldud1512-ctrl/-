@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo [저장] 변경사항 확인 중...
git status --short

echo.
echo [저장] GitHub에 저장합니다...

git add webapp/server.js webapp/package.json webapp/public/index.html webapp/public/main.js webapp/public/style.css webapp/lib/ CLAUDE.md 2>nul
git add -A -- webapp/lib/ 2>nul

for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set TODAY=%%a-%%b-%%c
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set NOW=%%a:%%b

git diff --cached --quiet
if %errorlevel%==0 (
    echo [저장] 변경사항이 없습니다.
    pause
    exit /b
)

git commit -m "저장 %TODAY% %NOW%"

git pull --rebase origin main
git push origin main

echo.
echo [완료] GitHub 저장 완료!
pause
