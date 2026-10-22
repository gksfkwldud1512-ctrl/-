@echo off
title EHS AI Control Center
pushd "%~dp0webapp" || (echo Cannot find webapp folder & pause & exit /b 1)

if not exist node_modules (
  echo First run: installing packages...
  call npm install --no-audit --no-fund
)

REM Create login settings on first run (does nothing if they already exist)
call node scripts\setup-local.mjs

REM If the server is already running, just open the browser
netstat -ano | findstr ":3917" | findstr "LISTENING" >NUL
if %errorlevel%==0 (
  echo Server is already running. Opening the browser...
  start http://localhost:3917
  timeout /t 3 >NUL
  exit /b 0
)

echo.
echo Starting EHS AI Control Center  -  http://localhost:3917
echo Login accounts: see the credentials .txt file in the AI folder.
echo Close this window to stop.
echo.
start "" cmd /c "ping -n 9 127.0.0.1 >NUL & start http://localhost:3917"
call npx next dev -p 3917
echo.
echo Server stopped or failed. See messages above.
pause
