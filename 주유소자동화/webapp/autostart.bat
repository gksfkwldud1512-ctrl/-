@echo off
rem Miso gas station web app auto start (Task Scheduler "MisoWebApp" runs this at Windows logon, minimized)
rem Tailscale Funnel proxies the public URL to http://127.0.0.1:3000, so restart the server 5s after it stops
cd /d "%~dp0"
title Miso Gas Station server (auto)

:loop
netstat -aon | findstr ":3000 " | findstr LISTENING >nul
if not errorlevel 1 (
    echo [%date% %time%] port 3000 already in use - check again in 60s
    timeout /t 60 /nobreak >nul
    goto loop
)
echo [%date% %time%] server start
node server.js
echo [%date% %time%] server stopped - restart in 5s
timeout /t 5 /nobreak >nul
goto loop
