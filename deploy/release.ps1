# CRM 운영 배포 (crm.taratps.com) — 로컬에서 빌드하고 서버에 올린 뒤 재시작까지. deploy/README.md "2. 매 배포" 를 한 번에.
#
#   powershell -ExecutionPolicy Bypass -File .\deploy\release.ps1            # 화면 + 백엔드
#   powershell -ExecutionPolicy Bypass -File .\deploy\release.ps1 -Web       # 화면만 (빠름, 백엔드 무중단)
#   powershell -ExecutionPolicy Bypass -File .\deploy\release.ps1 -Api       # 백엔드만 (재시작 1~2분, 마이그레이션 있으면 그때 적용)
#   -Key C:\path\to\server.pem   서버 SSH 키 (기본: 환경변수 CRM_SSH_KEY → 홈의 al_sm.pem)
#   -SkipBuild                   이미 빌드돼 있으면 빌드 생략
#
# 서버: Lightsail Ubuntu, ssh ubuntu@52.78.211.240, 백엔드 /opt/crm/crm-module-api.jar (systemd crm-api), 화면 /var/www/crm (nginx).
# 주의: 이 스크립트는 사람이 직접 돌린다(CLAUDE.md — 배포는 사용자가). 백엔드를 올리면 Flyway 가 새 마이그레이션을 운영 DB 에 적용한다.
param(
  [switch]$Web,
  [switch]$Api,
  [switch]$SkipBuild,
  [string]$Key = $(if ($env:CRM_SSH_KEY) { $env:CRM_SSH_KEY } else { Join-Path $HOME 'al_sm.pem' }),
  [string]$Server = 'ubuntu@52.78.211.240'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$doWeb = $Web -or -not $Api
$doApi = $Api -or -not $Web
if (-not (Test-Path $Key)) { throw "SSH 키가 없습니다: $Key  (-Key 로 지정하거나 CRM_SSH_KEY 환경변수)" }
$sshOpt = @('-i', $Key, '-o', 'StrictHostKeyChecking=accept-new')

function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }

# 0. 빌드
if (-not $SkipBuild) {
  if ($doApi) {
    Step '백엔드 빌드 (gradle build -x test)'
    Push-Location (Join-Path $root 'crm-module-api')
    try { & .\gradlew.bat build -x test -q; if ($LASTEXITCODE -ne 0) { throw 'gradle build 실패' } } finally { Pop-Location }
  }
  if ($doWeb) {
    Step '화면 빌드 (npm run build)'
    Push-Location (Join-Path $root 'crm-module-web')
    try { & npm run build; if ($LASTEXITCODE -ne 0) { throw 'npm run build 실패' } } finally { Pop-Location }
  }
}

$jar = Join-Path $root 'crm-module-api\build\libs\crm-module-api-0.0.1-SNAPSHOT.jar'
$dist = Join-Path $root 'crm-module-web\dist'
if ($doApi -and -not (Test-Path $jar)) { throw "jar 가 없습니다: $jar" }
if ($doWeb -and -not (Test-Path (Join-Path $dist 'index.html'))) { throw "dist 가 없습니다: $dist" }

# 1. 서버로 복사
Step "서버로 복사 ($Server)"
& ssh @sshOpt $Server 'rm -rf /tmp/crm-release && mkdir -p /tmp/crm-release/dist'
if ($LASTEXITCODE -ne 0) { throw 'ssh 접속 실패' }
if ($doApi) { & scp @sshOpt $jar "${Server}:/tmp/crm-release/crm-module-api.jar"; if ($LASTEXITCODE -ne 0) { throw 'jar 복사 실패' } }
if ($doWeb) {
  # dist 를 tar 로 묶어 한 번에 (파일이 수백 개라 scp -r 보다 빠르다)
  $tar = Join-Path $env:TEMP 'crm-dist.tgz'
  Push-Location $dist; try { & tar -czf $tar . } finally { Pop-Location }
  & scp @sshOpt $tar "${Server}:/tmp/crm-release/dist.tgz"; if ($LASTEXITCODE -ne 0) { throw 'dist 복사 실패' }
  Remove-Item $tar -ErrorAction SilentlyContinue
}

# 2. 서버에서 교체
$remote = @()
if ($doWeb) {
  $remote += 'tar -xzf /tmp/crm-release/dist.tgz -C /tmp/crm-release/dist'
  $remote += 'sudo rsync -a --delete /tmp/crm-release/dist/ /var/www/crm/'
  $remote += 'sudo chown -R www-data:www-data /var/www/crm'
  $remote += 'echo "[web] 교체 완료"'
}
if ($doApi) {
  $remote += 'sudo install -o crm -g crm -m 644 /tmp/crm-release/crm-module-api.jar /opt/crm/crm-module-api.jar'
  $remote += 'sudo systemctl restart crm-api'
  $remote += 'for i in $(seq 1 36); do if curl -fsS http://127.0.0.1:8080/actuator/health 2>/dev/null | grep -q UP; then echo "[api] UP (약 $((i*5))초)"; break; fi; sleep 5; if [ "$i" = 36 ]; then echo "[api] 3분 안에 안 떴습니다 — sudo journalctl -u crm-api -n 200"; exit 1; fi; done'
  $remote += 'echo "[api] 마이그레이션 버전: $(sudo mysql -N -e ''SELECT MAX(CAST(version AS UNSIGNED)) FROM crm_module.flyway_schema_history'')"'
}
$remote += 'rm -rf /tmp/crm-release'
Step '서버에서 교체'
& ssh @sshOpt $Server ($remote -join ' && ')
if ($LASTEXITCODE -ne 0) { throw '서버 교체 단계 실패' }

Step '확인'
try { Write-Host ('health: ' + (Invoke-RestMethod 'https://crm.taratps.com/actuator/health' -TimeoutSec 15 | ConvertTo-Json -Compress)) } catch { Write-Warning "health 확인 실패: $_" }
Write-Host "완료 — https://crm.taratps.com (PC) · https://crm.taratps.com/m (모바일). 앱은 완전히 닫았다 열면 새 화면." -ForegroundColor Green
