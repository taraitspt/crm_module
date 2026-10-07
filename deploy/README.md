# CRM 운영 배포 (crm.taratps.com · 52.78.211.240 · Ubuntu + nginx 1.24)

서버 준비 상태(2026-10-07 확인): AWS **Lightsail** Ubuntu 24.04, 메모리 2GB·디스크 58GB, 접속 `ssh -i C:\Users\HP\al_sm.pem ubuntu@52.78.211.240`. DNS `crm.taratps.com → 52.78.211.240`, 포트 22·80·443 열림, Let's Encrypt 인증서(자동 갱신), nginx 기본 페이지만 떠 있음. Java·MariaDB 미설치. Lightsail 은 **고정 IP(Static IP)를 붙여야** 재시작해도 주소가 안 바뀐다.
루트의 `deploy.sh` 는 옛 SM 운영용이라 쓰지 않는다.

구성: nginx(443) → 정적 화면 `/var/www/crm` + `/api/` 를 `127.0.0.1:8080` Spring Boot(prod) 로. DB 는 같은 서버 MariaDB.

## 0. 로컬에서 빌드

```powershell
cd crm-module-api; .\gradlew.bat build -x test        # build/libs/crm-module-api-0.0.1-SNAPSHOT.jar
cd ..\crm-module-web; npm run build                    # dist/
```

## 1. 서버 1회 설치

```bash
sudo apt update
sudo apt install -y openjdk-17-jre-headless mariadb-server

# 메모리 2GB 서버라 스왑 2GB 를 둔다(ERP 큰 조회 때 메모리 부족으로 죽지 않게)
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo useradd --system --home /opt/crm --shell /usr/sbin/nologin crm
sudo mkdir -p /opt/crm /var/www/crm /etc/crm
sudo chown crm:crm /opt/crm

# DB — 비밀번호는 crm.env 의 DB_PASSWORD 와 같게
sudo mysql -e "CREATE DATABASE crm_module CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'crm'@'localhost' IDENTIFIED BY '여기에_비밀번호';
GRANT ALL PRIVILEGES ON crm_module.* TO 'crm'@'localhost'; FLUSH PRIVILEGES;"

# 환경변수 — deploy/crm.env.example 를 채워서
sudo cp crm.env /etc/crm/crm.env && sudo chmod 600 /etc/crm/crm.env && sudo chown root:root /etc/crm/crm.env

# 서비스·사이트
sudo cp crm-api.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable crm-api
sudo cp crm.taratps.com.conf /etc/nginx/sites-available/crm.taratps.com
sudo ln -sf /etc/nginx/sites-available/crm.taratps.com /etc/nginx/sites-enabled/crm.taratps.com
# certbot 이 default 사이트에 넣은 crm.taratps.com 블록이 있으면 지운다(또는 default 링크 제거)
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## 1-1. 로컬 데이터 옮기기 (첫 배포 1회, 백엔드를 처음 켜기 **전에**)

`deploy/secret/`(커밋 안 됨)에 준비돼 있다(2026-10-07):
- `crm.env` — 위 `/etc/crm/crm.env` 로 그대로 쓴다. DB 비밀번호·JWT·웹 푸시 키는 운영용으로 새로 만들었고 ERP·Teams 값은 로컬에서 옮겼다.
- `db-password.txt` — `crm.env` 의 `DB_PASSWORD` 와 같은 값. 위 `CREATE USER ... IDENTIFIED BY` 에 넣는다.
- `crm_module.sql` — 로컬 DB 전체 덤프(V144 시점). MariaDB 11.5+ 전용 정렬 `utf8mb4_uca1400_ai_ci` 는 `utf8mb4_unicode_ci` 로 바꿔 두었다(서버 10.11 호환).

```bash
scp deploy/secret/crm_module.sql ubuntu@52.78.211.240:/tmp/
# 서버 — DB·사용자 만든 직후, crm-api 를 켜기 전에
sudo mysql crm_module < /tmp/crm_module.sql && rm /tmp/crm_module.sql
sudo mysql -e "SELECT MAX(version) FROM crm_module.flyway_schema_history"   # 144
```

그 다음 `crm-api` 를 켜면 Flyway 가 V145~ 를 이어서 적용한다(시드 admin 은 이미 있는 계정이라 새로 안 생긴다).
덤프에는 사용자 비밀번호 해시·거래처 정보가 들어 있다 — 옮긴 뒤 서버 `/tmp` 와 로컬 사본을 지운다.

## 2. 매 배포

```bash
# 로컬 → 서버 복사 (예: scp)
scp crm-module-api/build/libs/crm-module-api-0.0.1-SNAPSHOT.jar ubuntu@52.78.211.240:/tmp/crm-module-api.jar
scp -r crm-module-web/dist/* ubuntu@52.78.211.240:/tmp/crm-dist/

# 서버
sudo install -o crm -g crm -m 644 /tmp/crm-module-api.jar /opt/crm/crm-module-api.jar
sudo systemctl restart crm-api && journalctl -u crm-api -f      # "Started CrmModuleApplication" 확인
sudo rsync -a --delete /tmp/crm-dist/ /var/www/crm/
```

첫 기동 때 Flyway 가 빈 `crm_module` 에 마이그레이션 전체를 적용한다.

## 3. 확인

- `https://crm.taratps.com/actuator/health` → `{"status":"UP"}`
- `https://crm.taratps.com/` 로그인 화면, `https://crm.taratps.com/m` 모바일 화면
- 관리자 > ERP 동기화가 성공하는지(= 이 서버에서 ERP 로 접속되는지)

## 꼭 챙길 것

1. **ERP 방화벽** — ERP(39.125.168.136:15253)가 이 서버 IP 52.78.211.240 의 접속을 받아야 한다. 막혀 있으면 앱은 뜨지만 매출·생산·채권 화면이 전부 비고 사용자 동기화도 안 된다.
2. **시드 관리자 비밀번호** — 빈 DB 로 시작하면 `admin / admin123` 이 생긴다. 첫 로그인 직후 바꾼다.
3. **첫 로그인 경로** — ERP 동기화로 생기는 계정은 1회용 비밀번호(Teams DM)로만 첫 로그인할 수 있다. `MS_*` 를 비우면 아무도 첫 로그인을 못 한다.
4. **로컬 데이터** — 1-1 절차로 옮긴다. 안 옮기고 빈 DB 로 시작하면 월매출계획·영업활동·권한 설정이 없다.
5. **웹 푸시 키** — 로컬엔 키가 없어 운영용으로 새로 만들었다(`deploy/secret/crm.env`). 구독은 도메인에 묶이므로 어차피 폰마다 알림을 한 번 다시 허용한다. **한 번 넣은 키는 바꾸지 않는다.**
6. **메일(SMTP_PASSWORD)** — 로컬에도 비어 있어 비워 뒀다. 2차인증(MFA)을 켠 사용자는 코드 메일을 못 받아 로그인이 막힌다(2026-10-07 로컬 기준 MFA 사용자 0명). 켜게 되면 Gmail 앱 비밀번호를 넣는다.
7. **APK** — 서버가 뜬 뒤 `npm run app:android`(기본 주소가 이미 `https://crm.taratps.com`)로 한 번 빌드해 `/var/www/crm/downloads/tara-crm.apk` 에 둔다. 이후 화면 변경은 서버 배포만으로 반영된다.
