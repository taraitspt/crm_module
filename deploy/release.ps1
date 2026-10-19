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
if ($doApi) {
  # 빌드 폴더의 jar 를 그대로 올리면, 복사 도중 다른 빌드(로컬 gradle 등)가 같은 파일을 다시 써서
  # 깨진 jar 가 올라갈 수 있다(2026-10-19 실제 발생 — 1.1MB jar 로 API 가 안 떴다). 먼저 TEMP 로 떼어 낸 사본을
  # 검사(크기·zip 끝)하고 체크섬을 구해 올린 뒤, 서버에서 체크섬이 같을 때만 교체한다.
  $jarCopy = Join-Path $env:TEMP 'crm-module-api-release.jar'
  Copy-Item $jar $jarCopy -Force
  $jarSize = (Get-Item $jarCopy).Length
  if ($jarSize -lt 50MB) { throw "jar 크기가 이상합니다($jarSize 바이트) — 빌드가 끝났는지 확인하세요" }
  $jarHash = (Get-FileHash $jarCopy -Algorithm SHA256).Hash.ToLower()
  & scp @sshOpt $jarCopy "${Server}:/tmp/crm-release/crm-module-api.jar"; if ($LASTEXITCODE -ne 0) { throw 'jar 복사 실패' }
}
if ($doWeb) {
  # dist 를 tar 로 묶어 한 번에 (파일이 수백 개라 scp -r 보다 빠르다)
  $tar = Join-Path $env:TEMP 'crm-dist.tgz'
  # downloads/ 는 빼고 묶는다 — 로컬 public/downloads 의 APK 는 테스트용(옛 터널 주소)이라 운영 APK 를 덮어쓰면 안 된다
  Push-Location $dist; try { & tar --exclude=./downloads -czf $tar . } finally { Pop-Location }
  & scp @sshOpt $tar "${Server}:/tmp/crm-release/dist.tgz"; if ($LASTEXITCODE -ne 0) { throw 'dist 복사 실패' }
  Remove-Item $tar -ErrorAction SilentlyContinue
}

# 2. 서버에서 교체
$remote = @()
if ($doWeb) {
  $remote += 'tar -xzf /tmp/crm-release/dist.tgz -C /tmp/crm-release/dist'
  # downloads/(운영 APK)는 지우지 않는다. 설명은 서버 명령 안이 아니라 여기처럼 PowerShell 주석으로 단다.
  $remote += 'sudo rsync -a --delete --exclude downloads/ /tmp/crm-release/dist/ /var/www/crm/'
  $remote += 'sudo chown -R www-data:www-data /var/www/crm'
  $remote += 'echo "[web] 교체 완료"'
}
if ($doApi) {
  $remote += "echo '$jarHash  /tmp/crm-release/crm-module-api.jar' | sha256sum -c --quiet || { echo '[api] 올라간 jar 체크섬이 다릅니다 — 교체하지 않습니다'; exit 1; }"
  $remote += 'sudo install -o crm -g crm -m 644 /tmp/crm-release/crm-module-api.jar /opt/crm/crm-module-api.jar'
  $remote += 'sudo systemctl restart crm-api'
  $remote += 'for i in $(seq 1 36); do if curl -fsS http://127.0.0.1:8080/actuator/health 2>/dev/null | grep -q UP; then echo "[api] UP (약 $((i*5))초)"; break; fi; sleep 5; if [ "$i" = 36 ]; then echo "[api] 3분 안에 안 떴습니다 — sudo journalctl -u crm-api -n 200"; exit 1; fi; done'
  $remote += 'echo "[api] 마이그레이션 버전: $(sudo mysql -N -e ''SELECT MAX(CAST(version AS UNSIGNED)) FROM crm_module.flyway_schema_history'')"'
}
$remote += 'rm -rf /tmp/crm-release'
Step '서버에서 교체'
# 서버 명령은 스크립트 파일로 올려 bash 로 돌린다 — ssh 인자로 한 줄을 넘기면 Windows PowerShell 5.1 이 큰따옴표를 벗겨 버리고
# ("[api] UP (약 ..초)" 의 괄호에서 bash 문법 오류, 2026-10-16), ' && ' 로 이으면 줄 안의 # 가 뒤를 전부 주석으로 만든다.
# set -e 로 한 줄이라도 실패하면 거기서 멈춘다. 줄바꿈은 LF, BOM 없는 UTF-8 로 쓴다.
$sh = Join-Path $env:TEMP 'crm-remote.sh'
$body = (@('set -e') + $remote) -join "`n"
[System.IO.File]::WriteAllText($sh, $body + "`n", (New-Object System.Text.UTF8Encoding($false)))
& scp @sshOpt $sh "${Server}:/tmp/crm-release/remote.sh"; if ($LASTEXITCODE -ne 0) { throw '서버 스크립트 복사 실패' }
Remove-Item $sh -ErrorAction SilentlyContinue
& ssh @sshOpt $Server 'bash /tmp/crm-release/remote.sh'
if ($LASTEXITCODE -ne 0) { throw '서버 교체 단계 실패' }

Step '확인'
try { Write-Host ('health: ' + (Invoke-RestMethod 'https://crm.taratps.com/actuator/health' -TimeoutSec 15 | ConvertTo-Json -Compress)) } catch { Write-Warning "health 확인 실패: $_" }
Write-Host "완료 — https://crm.taratps.com (PC) · https://crm.taratps.com/m (모바일). 앱은 완전히 닫았다 열면 새 화면." -ForegroundColor Green
