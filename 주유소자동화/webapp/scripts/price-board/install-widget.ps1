# 미소 단가표 위젯 바로가기 설치 — 바탕화면 + 시작프로그램(PC 켜면 자동 실행)
# 사용: powershell -ExecutionPolicy Bypass -File install-widget.ps1 [-Uninstall]
param([switch]$Uninstall)

$widget = Join-Path $PSScriptRoot 'board-widget.ps1'
$targets = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) '미소 단가표.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Startup')) '미소 단가표.lnk')
)

if ($Uninstall) {
  $targets | Where-Object { Test-Path $_ } | ForEach-Object { Remove-Item $_; "삭제: $_" }
  return
}

$shell = New-Object -ComObject WScript.Shell
foreach ($lnk in $targets) {
  $s = $shell.CreateShortcut($lnk)
  $s.TargetPath = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
  $s.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$widget`""
  $s.WorkingDirectory = $PSScriptRoot
  $s.IconLocation = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe,0"
  $s.Description = '오피넷 단가표 (미소 + 주변 주유소 + 평균가)'
  $s.Save()
  "설치: $lnk"
}
