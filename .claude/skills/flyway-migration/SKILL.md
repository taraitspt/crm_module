---
name: flyway-migration
description: 새 Flyway DB 마이그레이션을 추가할 때. 버전 넘버링(숫자 max+1), MySQL/MariaDB SQL 작성, 다중 ADD COLUMN 분리 규칙. crm-module-api DB 스키마 변경 시 사용.
---

# Flyway 마이그레이션 추가 규칙

## 위치 & 대상 DB
- 경로: `crm-module-api/src/main/resources/db/migration/V<n>__<설명>.sql`
- **MySQL/MariaDB SQL 로만 작성** (primary datasource). Oracle(더존 ERP)은 절대 마이그레이션 대상 아님 — ERP는 `integration/erp/` 서비스로 읽기/쓰기만.
- `bin/main/db/migration` 은 빌드 산출물 복사본 — 직접 건드리지 말 것.

## 버전 넘버링 (제일 중요 — 틀리면 Flyway 부팅 실패 → 502)
- 새 버전 = **기존 파일 버전을 숫자로 정렬한 최댓값 + 1**.
- ❌ prefix glob(`V1*`)이나 파일명 문자열 정렬로 max 찾지 말 것 (문자열정렬은 V9 > V10 으로 틀림).
- 버전이 **겹치거나 건너뛰면 부팅 실패**. 항상 폴더를 숫자정렬해 현재 max 확인 후 +1.
- `.claude/hooks/check-flyway.cjs` 훅이 새 V*.sql 버전을 자동 검증(max+1 아니면 차단)한다 — 훅에 걸리면 파일명 버전을 고칠 것.

## 다중 컬럼 추가는 문장 분리
- 여러 컬럼 추가 시 **`ALTER TABLE` 을 컬럼마다 분리**한다.
- 이유: `local` 프로파일 H2(MySQL 모드)가 콤마로 이어붙인 다중 `ADD COLUMN` 을 파싱 못 함 (V10/V12/V13/V15/V17 이 그래서 H2에서 깨짐).
- 예:
  ```sql
  ALTER TABLE order_mst ADD COLUMN foo VARCHAR(20) NULL;
  ALTER TABLE order_mst ADD COLUMN bar BIGINT NULL;   -- 각각 별도 문장
  ```
- 재실행 안전이 필요하면 `ADD COLUMN IF NOT EXISTS`(MariaDB 지원) / `CREATE INDEX IF NOT EXISTS` 사용.

## 체크리스트
1. 폴더 숫자정렬 → max 확인 → 새 파일 `V(max+1)__...`
2. MySQL SQL, 다중 ADD COLUMN 분리
3. `cd crm-module-api && ./gradlew.bat compileJava` 로 검증 (배포는 사용자가 직접)
