# 폰 테스트용 로컬 스택 한 번에 띄우기 — 백엔드(8080) + 배포본 preview(4173) + cloudflared 터널(HTTPS)
# 사용: powershell -ExecutionPolicy Bypass -File .\start-phone-test.ps1 [-Dev] [-NoTunnel]
#   -Dev      : 배포본 preview 대신 개발 서버(npm run dev, 핫리로드)를 띄운다. 설치(PWA/APK) 테스트는 안 되고 화면 확인만.
#   -NoTunnel : 터널 없이 PC 에서만 본다(터미널 2개).
# 창마다 따로 열리므로 끌 때는 각 창에서 Ctrl+C. 터널 창을 끄면 외부 주소도 닫힌다.
param([switch]$Dev, [switch]$NoTunnel)

$root = $PSScriptRoot
$api  = Join-Path $root 'crm-module-api'
$web  = Join-Path $root 'crm-module-web'
$jdk17 = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot'

if (-not (Test-Path (Join-Path $api '.env.local'))) { throw "crm-module-api\.env.local 이 없습니다." }

function Open-Window($title, $workDir, $command) {
  Start-Process powershell -ArgumentList @(
    '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command',
    "`$host.UI.RawUI.WindowTitle = '$title'; Set-Location '$workDir'; $command"
  ) | Out-Null
}

# ① 백엔드 — 이미 떠 있으면 건너뛴다
if (Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue) {
  Write-Host "[api] 8080 이미 실행 중 — 건너뜀"
} else {
  Open-Window 'CRM api :8080' $api "`$env:JAVA_HOME = '$jdk17'; powershell -ExecutionPolicy Bypass -File .\run-local.ps1"
  Write-Host "[api] 백엔드 창 열림 (뜨는 데 1분쯤)"
}

# ② 웹 — 배포본(4173) 또는 개발 서버
$webPort = if ($Dev) { 5174 } else { 4173 }
if (Get-NetTCPConnection -LocalPort $webPort -State Listen -ErrorAction SilentlyContinue) {
  Write-Host "[web] $webPort 이미 실행 중 — 건너뜀"
} elseif ($Dev) {
  Open-Window 'CRM web dev :5174' $web "npm run dev -- --port 5174"
  Write-Host "[web] 개발 서버 창 열림 (5174)"
} else {
  Open-Window 'CRM web preview :4173' $web "npm run build; npx vite preview --port 4173"
  Write-Host "[web] 빌드 후 preview 창 열림 (4173) — 빌드 30초쯤"
}

# ③ 터널 — 이미 떠 있으면 절대 새로 켜지 않는다. 켤 때마다 주소가 바뀌고, APK 에는 그 주소가 박혀 있어서
#    새 터널 = 폰 앱이 서버를 못 찾음 = APK 재배포. 주소는 cloudflared 가 로컬에 여는 상태 포트에서 읽는다.
function Get-TunnelUrl {
  foreach ($mp in 20241..20245) {
    try { $t = Invoke-RestMethod "http://127.0.0.1:$mp/quicktunnel" -TimeoutSec 2; if ($t.hostname) { return "https://$($t.hostname)" } } catch {}
  }
  return $null
}
if ($NoTunnel) {
  Write-Host "`nPC: http://localhost:$webPort  (모바일 화면 /m, 설치 안내 /app)"
  return
}
$url = Get-TunnelUrl
if ($url) {
  Write-Host "[tunnel] 이미 실행 중 — 그대로 씁니다 (새로 켜면 주소가 바뀌어 폰 APK 가 못 찾음)"
} else {
  Open-Window 'cloudflared tunnel' $web "npx cloudflared tunnel --url http://localhost:$webPort"
  Write-Host "[tunnel] cloudflared 창 열림 — 주소 찾는 중..."
}
for ($i = 0; $i -lt 40 -and -not $url; $i++) { Start-Sleep 2; $url = Get-TunnelUrl }
Write-Host ""
if ($url) {
  Write-Host "================================================================"
  Write-Host "  폰에서 열 주소 (Chrome/Safari 로, 카톡 안 브라우저 X)"
  Write-Host "  설치 안내 : $url/app"
  Write-Host "  모바일 앱 : $url/m"
  Write-Host "  PC        : http://localhost:$webPort"
  Write-Host "================================================================"
  Write-Host "  * 터널을 껐다 켜면 주소가 바뀝니다. 끝나면 터널 창을 꼭 닫으세요(외부 공개)."
  if (-not $Dev) { Write-Host "  * APK 는 서버 주소가 박혀 있어 터널 주소가 바뀌면 앱이 서버를 못 찾습니다 — 테스트용." }
  try { Set-Clipboard "$url/app"; Write-Host "  (설치 안내 주소를 클립보드에 복사했습니다)" } catch {}
} else {
  Write-Host "터널 주소를 아직 못 찾았습니다. cloudflared 창의 'https://....trycloudflare.com' 줄을 보세요."
}
