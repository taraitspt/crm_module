#!/bin/bash
# CRM 첫 설치 — 서버에서 1회: sudo bash /tmp/crm-upload/install.sh
# /tmp/crm-upload 에 jar·dist·crm.env·db-password.txt·crm_module.sql·nginx·systemd 파일이 있어야 한다(로컬에서 scp).
# 다시 돌려도 안전하게: DB 가 이미 차 있으면 복원을 건너뛰고, 스왑·사용자·DB 계정은 있으면 그대로 둔다.
set -euo pipefail
U=/tmp/crm-upload
DOMAIN=crm.taratps.com
[ "$(id -u)" = 0 ] || { echo "sudo 로 실행하세요"; exit 1; }
for f in crm-module-api.jar crm.env db-password.txt crm.taratps.com.conf crm-api.service; do
  [ -f "$U/$f" ] || { echo "없음: $U/$f"; exit 1; }
done
[ -d "$U/dist" ] || { echo "없음: $U/dist"; exit 1; }

echo "== 1. 패키지 (Java 17, MariaDB, rsync)"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openjdk-17-jre-headless mariadb-server rsync >/dev/null
java -version 2>&1 | head -1
mariadb --version

echo "== 2. 스왑 2GB (메모리 2GB 서버)"
if ! swapon --show | grep -q /swapfile; then
  [ -f /swapfile ] || fallocate -l 2G /swapfile
  chmod 600 /swapfile; mkswap /swapfile >/dev/null; swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
free -h | sed -n 2,3p

echo "== 3. 실행 계정·폴더"
id crm >/dev/null 2>&1 || useradd --system --home /opt/crm --shell /usr/sbin/nologin crm
mkdir -p /opt/crm /var/www/crm /etc/crm
chown crm:crm /opt/crm

echo "== 4. DB"
DBPW=$(tr -d '\r\n' < "$U/db-password.txt")
systemctl enable --now mariadb >/dev/null
mysql -e "CREATE DATABASE IF NOT EXISTS crm_module CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE USER IF NOT EXISTS 'crm'@'localhost' IDENTIFIED BY '${DBPW}'; ALTER USER 'crm'@'localhost' IDENTIFIED BY '${DBPW}'; GRANT ALL PRIVILEGES ON crm_module.* TO 'crm'@'localhost'; FLUSH PRIVILEGES;"
HAS=$(mysql -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='crm_module' AND table_name='flyway_schema_history'")
if [ "$HAS" = 0 ] && [ -f "$U/crm_module.sql" ]; then
  echo "   로컬 데이터 복원..."
  mysql crm_module < "$U/crm_module.sql"
  echo "   복원 후 마이그레이션 버전: $(mysql -N -e 'SELECT MAX(CAST(version AS UNSIGNED)) FROM crm_module.flyway_schema_history')"
else
  echo "   DB 가 이미 있어 복원 건너뜀"
fi

echo "== 5. 환경변수·백엔드"
install -o root -g root -m 600 "$U/crm.env" /etc/crm/crm.env
install -o crm -g crm -m 644 "$U/crm-module-api.jar" /opt/crm/crm-module-api.jar
install -o root -g root -m 644 "$U/crm-api.service" /etc/systemd/system/crm-api.service
systemctl daemon-reload
systemctl enable crm-api >/dev/null

echo "== 6. 화면"
rsync -a --delete "$U/dist/" /var/www/crm/
chown -R www-data:www-data /var/www/crm

echo "== 7. nginx"
LE=/etc/letsencrypt/live/$DOMAIN
[ -f "$LE/fullchain.pem" ] || { echo "인증서가 없습니다: $LE — certbot 으로 먼저 발급하세요"; exit 1; }
[ -f /etc/letsencrypt/options-ssl-nginx.conf ] || { echo "/etc/letsencrypt/options-ssl-nginx.conf 없음 (certbot --nginx 로 발급했는지 확인)"; exit 1; }
install -m 644 "$U/crm.taratps.com.conf" /etc/nginx/sites-available/$DOMAIN
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
# certbot 이 default 사이트에 넣은 같은 도메인 블록과 겹치므로 default 는 끈다(파일은 sites-available 에 남는다)
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "== 8. 백엔드 시작 (첫 기동은 Flyway 마이그레이션으로 1~2분)"
systemctl restart crm-api
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8080/actuator/health 2>/dev/null | grep -q UP; then echo "   UP (${i}0초 이내)"; break; fi
  sleep 10
  [ "$i" = 60 ] && { echo "   10분 안에 안 떴습니다 — journalctl -u crm-api -n 200 확인"; exit 1; }
done
echo "   마이그레이션 버전: $(mysql -N -e 'SELECT MAX(CAST(version AS UNSIGNED)) FROM crm_module.flyway_schema_history')"

echo "== 9. 비밀 파일 정리"
shred -u "$U/crm.env" "$U/db-password.txt" 2>/dev/null || rm -f "$U/crm.env" "$U/db-password.txt"
shred -u "$U/crm_module.sql" 2>/dev/null || rm -f "$U/crm_module.sql"

echo
echo "완료 — https://$DOMAIN/actuator/health , https://$DOMAIN/ , https://$DOMAIN/m"
echo "로그: journalctl -u crm-api -f"
