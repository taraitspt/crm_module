#!/bin/bash
# 로컬 백엔드 실행 (Git Bash 용). .env.local 을 읽어 환경변수로 올린 뒤 bootRun (dev 프로파일)
set -e
cd "$(dirname "$0")"
[ -f .env.local ] || { echo ".env.local 이 없습니다."; exit 1; }
set -a; . ./.env.local; set +a
[ -n "$JWT_SECRET" ] || { echo ".env.local 에 JWT_SECRET 이 없습니다. 64바이트 무작위 키를 넣으세요."; exit 1; }
case "$DB_HOST" in localhost|127.0.0.1) ;; *) echo "DB_HOST='$DB_HOST' — 로컬 실행은 localhost 만 허용 (운영 DB 보호)"; exit 1;; esac
echo "[run-local] DB=$DB_USERNAME@$DB_HOST:$DB_PORT/$DB_NAME  profile=dev"
./gradlew.bat bootRun --args='--spring.profiles.active=dev'
