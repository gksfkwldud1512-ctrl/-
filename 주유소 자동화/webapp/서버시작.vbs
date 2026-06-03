Dim sh, scriptDir, nodePath
Set sh = CreateObject("WScript.Shell")
scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
nodePath = "C:\Program Files\nodejs\node.exe"

' 기존 서버 종료 (포트 3000)
sh.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -aon 2^>nul ^| findstr "":3000 ""') do taskkill /F /PID %a >nul 2>&1", 0, True

' 서버 백그라운드 실행 (창 없음)
sh.Run """" & nodePath & """ """ & scriptDir & "server.js""", 0, False

' 3초 대기 후 브라우저 오픈
WScript.Sleep 3000
sh.Run "http://localhost:3000"
