# 미소 단가표 바탕화면 위젯
# - 웹앱 서버(localhost:3000)가 꺼져 있으면 최소화 창으로 켬
# - Edge(없으면 Chrome) 앱 창으로 board.html?compact=1 을 화면 오른쪽 위에 띄우고 항상 위로 고정
# 사용: powershell -ExecutionPolicy Bypass -File board-widget.ps1 [-Port 3000] [-Width 440] [-Height 560] [-NoTopmost]
param(
  [int]$Port = 3000,
  [int]$Width = 440,
  [int]$Height = 560,
  [switch]$NoTopmost
)

$ErrorActionPreference = 'Stop'
$webapp = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$url = "http://localhost:$Port/board.html?compact=1"
$title = '미소 단가표'

function Test-Server {
  try { Invoke-WebRequest -UseBasicParsing "http://localhost:$Port/api/version" -TimeoutSec 2 | Out-Null; return $true } catch { return $false }
}

if (-not (Test-Server)) {
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'node server.js' -WorkingDirectory $webapp -WindowStyle Minimized
  for ($i = 0; $i -lt 30 -and -not (Test-Server); $i++) { Start-Sleep -Seconds 1 }
}

$browser = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $browser) { throw 'Edge 또는 Chrome을 찾지 못했습니다.' }

Add-Type -AssemblyName System.Windows.Forms
$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$x = $area.Right - $Width

# 별도 프로필 → 평소 브라우저 창과 섞이지 않고 위치·크기 지정이 항상 적용됨
$profileDir = Join-Path $env:LOCALAPPDATA 'MisoPriceBoard'
Start-Process -FilePath $browser -ArgumentList @(
  "--app=$url", "--user-data-dir=`"$profileDir`"", "--window-size=$Width,$Height",
  "--window-position=$x,$($area.Top)", '--no-first-run', '--no-default-browser-check',
  # 새 프로필에 Windows 계정 자동 로그인·동기화 안내창이 뜨는 것 방지
  '--disable-sync', '--disable-features=msImplicitSignin,msEdgeSyncConsent,EdgeSigninPromo'
)

if ($NoTopmost) { return }

Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class MisoWin {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  public static IntPtr Find(string title) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, p) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(256); GetWindowText(h, sb, 256);
      if (sb.ToString().StartsWith(title)) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
'@

# 페이지 제목이 뜰 때까지 대기 후 항상 위(HWND_TOPMOST = -1), 이동·크기 유지
for ($i = 0; $i -lt 30; $i++) {
  $h = [MisoWin]::Find($title)
  if ($h -ne [IntPtr]::Zero) {
    [MisoWin]::SetWindowPos($h, [IntPtr](-1), 0, 0, 0, 0, 0x0001 -bor 0x0002 -bor 0x0040) | Out-Null
    break
  }
  Start-Sleep -Milliseconds 500
}
