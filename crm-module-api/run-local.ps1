# 로컬 백엔드 실행: .env.local 의 KEY=VALUE 를 환경변수로 올린 뒤 bootRun (dev 프로파일)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path .env.local)) { throw ".env.local 이 없습니다." }
Get-Content .env.local -Encoding utf8 | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq '' -or $line.StartsWith('#')) { return }
  $i = $line.IndexOf('=')
  if ($i -lt 1) { return }
  $k = $line.Substring(0, $i).Trim(); $v = $line.Substring($i + 1).Trim()
  Set-Item -Path "env:$k" -Value $v
}
if ([string]::IsNullOrWhiteSpace($env:JWT_SECRET)) {
  throw '.env.local 에 JWT_SECRET 이 없습니다. 64바이트 무작위 키를 넣으세요. 생성: node -e "console.log(require(''crypto'').randomBytes(64).toString(''base64''))"'
}
if ($env:DB_HOST -ne 'localhost' -and $env:DB_HOST -ne '127.0.0.1') {
  throw "DB_HOST 가 '$($env:DB_HOST)' 입니다. 로컬 실행은 localhost 만 허용합니다 (운영 DB 보호)."
}
Write-Host "[run-local] DB=$($env:DB_USERNAME)@$($env:DB_HOST):$($env:DB_PORT)/$($env:DB_NAME)  profile=dev"
& .\gradlew.bat bootRun --args='--spring.profiles.active=dev'
