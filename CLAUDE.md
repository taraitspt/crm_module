# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

**CRM Module** — 타라티피에스 CRM 신규 프로젝트. GROW(구 SM Module, 영업관리 시스템)에서 2026-09-18 포크한 뒤 **정보관리·관리자·데이터분석·수익성분석만 남기고 주문/매입마감/매출/세금계산서/비대면결제/공지/프로토타입 기능은 모두 제거**한 상태가 출발점이다. 새 CRM 기능은 이 뼈대 위에 추가한다.

- 자체 DB: MySQL/MariaDB (Flyway 관리). 로컬은 MariaDB 12.2 `localhost:3306/crm_module`.
- ERP: 더존 iCUBE Oracle 19c (`COMET` 스키마) — **조회 전용**. 거래처·사원·부서·공통코드 마스터 동기화와 통계 조회에만 쓴다. ERP에 쓰기(전표/주문/거래처 생성)는 포크 시점에 전부 제거됐다.
- Java 패키지 `com.tara.crm`, Gradle 아티팩트 `crm-module-api`, 메인 클래스 `CrmModuleApplication`.
- `SM-Module_기획문서/`, `docs/superpowers/` 는 원본(SM) 시절 문서다. ERP 연동 범위·코드 의미를 찾을 때만 참고하고, 거기 적힌 주문/매출/발주 요구사항은 이 프로젝트 범위가 아니다.

## Common commands

Java 17, Node 18+ 필요. Gradle wrapper jar 는 `.gitignore`(`*.jar`) 때문에 커밋되지 않으므로 클론 직후 한 번 `gradle wrapper --gradle-version 8.7` 로 생성한다.

### Backend (`crm-module-api/`)

```bash
# 로컬 실행 — 반드시 이 스크립트로. .env.local(gitignore) 의 DB_HOST/DB_PASSWORD/JWT_SECRET 등을 환경변수로 올린 뒤 dev 프로파일로 bootRun.
# JWT_SECRET 이 비면 거부한다 — jwt.secret 은 yml 에 기본값이 없다(예전엔 prod yml 에 폴백 키가 박혀 있어 토큰 위조가 가능했다).
# DB_HOST 가 localhost 가 아니면 실행을 거부한다(dev 프로파일 기본 DB_HOST 가 옛 SM 운영 서버라서).
./run-local.sh                      # Git Bash
powershell -ExecutionPolicy Bypass -File .\run-local.ps1   # PowerShell / VS Code 터미널

./gradlew.bat build -x test         # jar 빌드 (컴파일 검증)
./gradlew.bat compileTestJava       # 테스트 컴파일
./gradlew.bat test                  # 전체 테스트
./gradlew.bat test --tests '*ClosingPeriodServiceTest'
```

Flyway 는 모든 프로파일에서 켜져 있다. 첫 기동 시 `crm_module` 빈 DB에 마이그레이션 전체(V1~)가 적용된다. **원본 SM 시절 마이그레이션은 삭제하지 않았다** — 주문/매출/발주 테이블이 만들어지지만 엔티티는 없으므로 앱은 쓰지 않는다. 새 스키마는 새 V파일로 추가한다.

### Frontend (`crm-module-web/`)

```bash
npm install
npm run dev       # Vite :5173. .env.local 의 VITE_API_TARGET=http://localhost:8080 으로 /api 프록시 (파일이 없으면 vite.config.ts 기본값인 옛 운영 도메인으로 감 — 로컬에선 항상 .env.local 을 둔다)
npm run build     # tsc -b && vite build — 배포 전 반드시 통과
npm run lint      # eslint --max-warnings 0 (.eslintrc.cjs — no-explicit-any / exhaustive-deps / only-export-components 는 baseline 으로 off)
npm run test:e2e  # e2e/00-full-server-test.spec.ts 스모크
```

### 시드 계정

`V2__insert_seed_data.sql` — `admin` / `admin123` (ADMIN). 부서 1000~1400.

## Architecture

### Dual datasource

`common/config/PrimaryDataSourceConfig` = MySQL/MariaDB `@Primary` (`spring.datasource.*`). `common/config/OracleDataSourceConfig` = ERP Oracle, `oracle.enabled=true` 일 때만 생성되며 fail-soft(`setInitializationFailTimeout(-1)`)라 ERP가 안 붙어도 앱은 뜬다. Flyway 는 primary 에만 적용된다. 마이그레이션은 MySQL/MariaDB SQL 로 쓰고, 다중 `ADD COLUMN` 은 `ALTER TABLE` 을 나눈다(`.claude/skills/flyway-migration`).

### Profiles

| Profile | DB | ERP | Use |
|---|---|---|---|
| `dev` (기본) | `DB_HOST/DB_PORT/DB_NAME/DB_USERNAME/DB_PASSWORD` env, 기본값이 옛 SM 운영 서버 → **로컬은 run-local 스크립트로만** | Oracle `ORACLE_*` env, 비밀번호 없으면 연결 실패하지만 기동은 됨 | 로컬 개발 |
| `prod` | env 주입 | env 주입 | 향후 CRM 운영 |
| `local` | H2 in-memory (MySQL mode) | 비활성 | Flyway V10+ 가 H2 에서 깨져 사실상 미사용 |

### Domain packages (backend, `com.tara.crm`)

| Package | Responsibility |
|---|---|
| `auth` | 로그인/JWT/MFA, 비밀번호 변경·분실(Teams DM 으로 임시 비밀번호 — `integration/teams/TeamsGraphClient`, `msgraph.*` env), 부서 |
| `common` | DataSource/Security/CORS/Swagger/QueryDSL 설정, `BaseEntity`+JPA Auditing, 공통코드(`code/`), 실시간 접속 모니터(`monitor/`), 월마감(`ClosingPeriod`), 파일 업로드, 컬럼필터 프리셋, `ExcelService`, 예외/에러코드 |
| `info` | **월매출계획(SalesPlan)** — 담당자(users.id)·거래처(ERP 코드)·월별 공임/용지 계획, `sales_plan` 테이블(V135). `/api/info/sales-plan` (조회/저장/담당자옵션/`status`=계획 대비 ERP 실적). 그 외 사업자(BizOwner)·고객담당자·영업담당자·구 목표(GoalMst)는 코드만 남고 화면은 주석처리 |
| `stats` | 데이터분석·수익성분석. **주의: `StatsService` 대부분은 로컬 `sales_mst`/`order_mst` 를 읽는데, 그 테이블을 채우던 ERP 매출/주문 동기화는 포크 시 제거됐으므로 CRM 에서는 비어 있다.** ERP 를 직접 읽는 건 `OracleStatsRepository.getCustomerYearlySales`(거래처별 월매출) 뿐이고, 매출현황(`SalesPlanService.getStatus`)도 이걸 쓴다 |
| `integration/erp` | 마스터 동기화(`ErpMasterSyncService`/Scheduler — 거래처·사원·부서·공통코드), Oracle 조회 repo, 관리자용 `/api/erp/sync*` 엔드포인트 |
| `integration/teams` | MS Graph 로 Teams DM 발송 (`TeamsGraphClient` 만 남음) |

레이어링은 `controller/ service/ repository/ entity/ dto/`. `@EnableJpaAuditing`, `@EnableScheduling` 은 `CrmModuleApplication` 에 있다.

### Frontend

- 라우트는 `src/routes/index.tsx` 하나, 메뉴는 `src/components/layout/menuItems.tsx` 하나(사이드바·상단 공유). 화면 추가 시 둘 다 등록한다.
- 현재 메뉴: 대시보드 `/` · 정보관리(`/info/sales-plan` 월매출계획) · 데이터 분석(`/stats/sales-status` 매출현황(계획 대비), team-forecast, am-goal-yoy, item-perf, customer-yearly-sales(+detail), customer-sales-growth, design-sales) · 수익성 분석(`/stats/order-margin`, `/stats/vendor-margin`) · 관리자[ADMIN,FINANCE](`/admin/active-users`, `/admin/erp-sync`, `/admin/closing`, `/admin/common-codes`).
- 주석처리(코드는 남김, 메뉴·라우트·lazy import 만 주석): 사업자관리·고객관리·영업담당자관리·목표입력, 파트별 부대비용 실적, GRP생산내역, POD 작업사양, GRP수익비용대응. 되살릴 땐 `menuItems.tsx` 와 `routes/index.tsx` 양쪽 주석을 함께 푼다.
- 월매출계획 화면(`pages/info/SalesPlanPage.tsx`): 담당자 선택 → 거래처 추가(ERP `/lookup/partners` 검색) → 1~12월 공임/용지 입력 → 저장. 저장은 "요청에 포함된 담당자의 해당 연도 계획을 통째로 교체"라 행 삭제도 저장으로 반영된다. 매출현황(`pages/stats/SalesStatusPage.tsx`)은 거래처 행마다 계획/실적 2줄 + 달성률. 실적은 거래처 단위 ERP 합산이며 공임/용지 실적 분리는 미구현(별도 테이블 확인 후 붙일 것).
- `src/api/client.ts` 가 단일 Axios 인스턴스(`baseURL: '/api'`, JWT 자동 첨부, 401 → 로그아웃). 새 API 모듈은 여기서 import 한다.
- 상태: Zustand(`store/`) + TanStack Query. 테이블: TanStack Table + antd `DataTable`, 컬럼필터는 `components/table/columnFilterKit`. react-hook-form/zod 는 제거됨 — 폼은 antd Form 을 쓴다.

### Security boundary

`SecurityConfig` 가 인증 없이 허용: `/api/auth/login`·MFA, `/api/public/**`(비밀번호 분실·사업자번호 조회), Swagger, `/actuator/health`. 나머지는 JWT 필수, `@PreAuthorize` 사용 가능.

### 권한 모델 — 두 축

권한은 **메뉴 접근**과 **데이터 범위** 두 축이고 둘 다 `/admin/menu-permissions`(관리자 > 권한 관리) 탭에서 바꾼다. DB 를 직접 고치지 않는다.

| 축 | 테이블 | 키 | 값 |
|---|---|---|---|
| 메뉴 접근 | `menu_permission` (V141) | menu_key × role | 보인다/안 보인다 |
| 데이터 범위 | `resource_scope` (V142) | resource × role | NONE / SELF / DEPT / ALL |

- 메뉴 목록은 `common/menu/MenuCatalog`, 리소스 목록은 `common/menu/CrmResource`(ACTIVITY·DEAL·SALES_PLAN·SALES_STATS). **메뉴나 리소스를 늘리면 여기 enum/카탈로그에 먼저 추가한다.**
- 범위를 메뉴가 아니라 **리소스(데이터 종류)** 에 건 이유: 같은 API 를 여러 화면이 공유한다(영업활동 = 캘린더·일자별 현황·활동 이력·거래처 카드). 메뉴 단위면 서버가 "지금 어느 화면에서 부른 건지"를 프론트 말만 믿고 판단해야 하고, 그 값을 조작하면 범위가 넓어진다. 리소스 단위면 서비스가 자기 리소스를 스스로 넘기므로 클라이언트가 개입할 수 없다.
- 서비스는 반드시 `ScopeService` 를 거친다: `allowedEmpIds(resource)`(null = 전체) / `resolveFilter(resource, 화면이_고른_담당자)` / `assertCanWrite(resource, 담당자)` / `requireUser(resource, userId)`. 목록 루프 안에서 호출하지 말고 밖에서 한 번 구한 뒤 `narrow(allowed, empId)` 로 좁힌다.
- 관리자(ADMIN)의 범위는 저장 시점에 항상 ALL 로 고정된다 — 스스로 잠그면 되돌릴 사람이 없다.
- `resource_scope` 는 `ResourceScopeService` 가 메모리에 캐시하고 저장할 때만 비운다. 다른 경로로 테이블을 직접 바꾸면 재기동 전까지 반영되지 않는다.
- 사용자 관리(`/admin/users`)는 **역할·부서·상태만** 바꾼다. 범위는 역할에 붙어 있어 거기선 읽기 전용으로 보여주기만 한다. 특정 인원만 다르게 줘야 하면 사용자별 예외를 만들지 말고 역할을 하나 추가한다.

### 남아 있는 옛 인프라 값 (아직 CRM 용으로 안 바뀜)

- `deploy.sh`: EC2 인스턴스 ID·도메인이 SM 운영 값이다. S3 버킷/서비스명은 `crm-module` 로 바뀌어 실행해도 SM 운영을 덮어쓰진 않지만(존재하지 않는 리소스라 실패) **CRM 인프라가 생길 때까지 실행하지 않는다.**
- `vite.config.ts` 기본 프록시, `application-dev.yml` 의 DB/Oracle 기본 호스트도 SM 값이다. 로컬은 `.env.local` 로 덮어쓴다.

## AI 작업 규칙

- **ERP(Oracle)는 읽기만.** INSERT/UPDATE 코드를 새로 만들지 않는다.
- **배포는 사용자가 직접.** Claude 는 `deploy.sh` 를 실행하지 않는다. 검증은 `crm-module-api` 에서 `./gradlew.bat build -x test`, `crm-module-web` 에서 `npm run build` 까지.
- **ERP 코드값은 추측 금지** — `.claude/skills/erp-code-map` 확인.
- 삭제된 도메인(주문/매출/발주/정산/세금계산서/비대면)을 되살리지 않는다. 필요하면 원본 `github.com/taraitspt/sm_module` 을 참고해 CRM 기준으로 새로 설계한다.

### `.claude/` 구성
- 스킬: `flyway-migration`(마이그레이션 규칙), `erp-code-map`(ERP 코드·상태 매핑 — 발주/정산 부분은 이 프로젝트에 없음).
- 서브에이전트: `pdf-excel-export`(엑셀 다운로드 패턴 — PDF 라이브러리는 제거됨), `security-review`(OWASP 읽기 전용 감사).
- 훅 `hooks/check-flyway.cjs`(PreToolUse:Write): 새 마이그레이션 버전이 max+1 이 아니면 차단.
