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

`common/config/PrimaryDataSourceConfig` = MySQL/MariaDB `@Primary` (`spring.datasource.*`). `common/config/OracleDataSourceConfig` = ERP Oracle, `oracle.enabled=true` 일 때만 생성되며 fail-soft(`setInitializationFailTimeout(-1)`)라 ERP가 안 붙어도 앱은 뜬다. `oracleJdbcTemplate` 은 fetch size 1000 — ERP 가 사외 원격이라 드라이버 기본 10행이면 수천 행 조회가 왕복 횟수만으로 10초를 넘긴다(생산계획 한 달 10.5s → 3.4s). Flyway 는 primary 에만 적용된다. 마이그레이션은 MySQL/MariaDB SQL 로 쓰고, 다중 `ADD COLUMN` 은 `ALTER TABLE` 을 나눈다(`.claude/skills/flyway-migration`).

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
- 매출리스트 `/stats/sales-list`: GROW 월매출리스트 쿼리 이식(`OracleSalesListRepository`, 2026-10-01). 한 줄 = 매출번호 × 수주순번 × 주문(TOR). 매출(SD_BILL) → 수주(SD_SO_DTL.PURDOC_NO) → 주문 → 주문 정산(SD_ORDSTL_INFO_X20329, TOP_ORGN_CD '99'=용지, 그 외 공임)으로 정산공임/용지를 붙이고, 부서는 영업담당자의 매출일 기준 발령부서(HR_HUAN). 원본대로 저작권 매출(TPSCOPYRIGHT001)·매출취소를 빼므로 **합계가 매출현황(SD_BILL 전체)과 다르다**. 정산 금액은 주문 전체 값이라 분할매출이면 줄마다 반복 — 합산해서 쓰지 말 것. 데이터 범위(SALES_STATS)는 `salesEmpNo`(영업담당 사번)·`ccCd` 로 판정.
- 생산현황(TPS, ERP 조회 전용): `/production/plan` 생산계획현황 — 인쇄·제판·후가공·접지·제본 다섯 탭, `GET /api/production/plan/{tab}`(print|plate|process|fold|bind, 계획일 최대 31일). 행 DTO 는 다섯 탭 컬럼의 합집합 `ProductionPlanDto.Row` 하나이고 탭별 컬럼은 `ProductionPlanPage.tsx` 의 `COLS` 가 정한다. `/production/dashboard` 는 같은 API 를 화면에서 집계한 대시보드. **설비별 작업실적** `/production/equipment-perf`(`GET /api/production/equipment-perf?startDate&endDate&workCenter`, ERP "설비별 작업실적조회" 쿼리 이식, 2026-10-02)는 컬럼 90여 개라 DTO 없이 `Map<String,Object>`(camelCase 키)로 내려주고 라벨·순서는 `types/equipmentPerf.ts` 의 `EQUIP_PERF_COLS`. 작업장 그룹 `TOP_ORGN_CD` = WC10 제판 / WC20 인쇄 / WC30 후가공 / WC40 제본. 컨트롤러는 쿼리가 있는 **WC20 인쇄·WC40 제본**만 허용(컬럼이 달라 `EQUIP_PERF_COLS`/`EQUIP_PERF_COLS_BIND` 두 벌, `colsFor(wc)`). 제본은 접지(OP406) 제외 — 무선·중철·풀입(재단)만(사용자 결정 2026-10-02). ERP 정본 제본 쿼리는 바인딩이 한 칸 밀려 있었고(`LANG_CD='1000'`), 설비 상세 `PM_EQ_DTL` 을 `VLID_TO_DT='99991231'` INNER JOIN 해 유효 행 없는 무선기 2대(9월 353행)가 빠졌다 → 두 작업장 모두 설비별 최신 행 LEFT JOIN(`EQ_DTL_JOIN`)으로 바꿈. 제본 폐기수량(DIS_QT = 접지 여분 합(전 기간) − 제본 여분 합(기간))은 정본 그대로이나 대부분 음수·단위(매 vs 부) 불일치 — 정의 확인 대기. **작업시작시간은 있고 종료시간이 없는 행 = 지금 가동 중** — `/production/equipment-board`(설비 가동 현황)가 어제~오늘 실적으로 설비마다 가동중/대기를 보여준다(60초 자동 갱신, 24시간 넘게 미종료면 경고색). "대기(매엽)·외부입고·외주" 이름의 설비는 자리표시라 실적 있을 때만 카드. 안 쓰는 설비 4대(매엽2호기·디지털인쇄·명지북(무선)·재단기)는 `OracleEquipmentPerfRepository.UNUSED_EQUIPMENTS` 로 설비 목록에서 뺀다(실적이 생기면 보드에 다시 올라옴). **주문진행현황** `/production/order-progress`(`GET /api/production/order-progress?startDate&endDate`, GROW 주문별진행현황 이식 2026-10-02, 주문일 최대 92일, 9월 1,200건 3.9s) — 주문×순번마다 작업처별 단계 CASE 로 진행상태(PROG_NM)·처리일자(PROG_DT)를 뽑는다(매출등록 > 수주입력 > 정산입력 > 출고처리 > 생산/구매/외주/POD 단계 > 주문처리 > 주문입력). 단계 색 묶음·컬럼은 `types/orderProgress.ts`(접수→진행 중→출고→완료). 모바일 앱 "주문" 탭(`/m/orders`)이 같은 API 를 카드로 보여주고 기본은 내 담당(`bizrsptEmpnoCd` = 로그인 사번). SQL 은 ERP 생산계획현황 화면 쿼리에서 SELECT 에 안 쓰이는 조인만 뺀 것(`OracleProductionPlanRepository` 주석에 대조 결과). **생산계획조회** `/production/plan-register`(ERP "생산계획등록(타라)" 화면의 조회 전용 이식 2026-10-02, `OraclePlanRegisterRepository`, `GET /api/production/plan-register/orders?startDate&endDate`(주문일 최대 31일, 한 주 168건 2.1s) · `/orders/{orderNo}/detail?planNo` · `/plans/{planNo}/{tab}` · `/work-order/{orderNo}`) — 주문리스트(계획상태 미작성/작성중/작성 완료 = 다섯 탭 모두 확정) → 주문상세(계획 있으면 계획값 NVL2) + 공정별특이사항(`SD_ORDER_DTL.RMK_TXT`)·생산 전달사항(`PP_PLAN_MST.RMK_TXT`) → 계획번호 1건의 인쇄·제판·후가공·접지·제본 탭. 인쇄·제판·후가공·접지 행은 `KEY_VAL_NM`(계획번호/차수/순번/하위순번)으로 인쇄 행에 매달리고 **제본 행은 KEY_VAL_NM 이 없다**(완성품 행, 하위순번 500). 확정 `CNFM_YN` → 진행 `ISSUE_YN` → 대수마감 `PRPCNT_CLOSE_YN` 순으로 켜진다. 정본의 후가공 탭 쿼리는 "저장 전 초기행 생성"(주문 사양 → 인쇄 계획)이라 쓰지 않고 저장본 `PP_PLANPROCS_INFO` 를 읽는다. 계획 차수는 전부 1(2026년 6,749건). 컬럼 라벨은 `types/planRegister.ts`. **두 방향**: 주문적용(`mode=order`, `SD_ORDER_*` TOR…)과 의뢰적용(`mode=request`, `PP_PREORD_*` PQE…) — ERP 화면의 라디오. 계획 테이블은 `ORDDOC_NO` 자리에 주문번호든 의뢰번호든 들어가서 **공정 탭 쿼리는 둘이 같고**(ERP 의뢰 쪽 인쇄·제판·접지·제본 탭 쿼리 전부 대조 — 계획번호 값만 다름. 의뢰 후가공도 주문처럼 "저장 전 초기행 생성" 쿼리라 저장본 `PP_PLANPROCS_INFO` 로 대신한다) 주문리스트·상세·작업지시서 머리만 테이블이 갈린다(`listSql(request)`/`detailSql(request)`, 의뢰 사양은 `PP_PREORD_INFO`/`PP_PREPROCS_INFO`/`PP_PREBBND_DTL`, 키 `PLAN_ORD_NO/PLAN_ORD_SQ/PLAN_SQ_SQ/PLAN_LINE_SQ`). mode 가 없으면 서버가 PQE 접두어로 의뢰 판정. 2026년 계획: TOR 5,503 / PQE 1,249. **작업지시서** `/production/work-order/:orderNo/:sq?mode=`(`WorkOrderPage`, 인쇄용 단독 화면, 메뉴 키는 plan-register)는 **주문상세 순번(라인) 하나당 한 장**(사용자 결정 2026-10-02; 상세 행 선택 → 버튼/더블클릭, 서버 `sq` 로 라인·인쇄 행을 거른다). GROW 양식 그대로 — 머리(거래처·영업담당 전화 `HR_EMPINFO_DTL.TEL_NO`) · 사이즈/제작부수/제본형태/포장방법(`PACK_MTHD_CD`→Z006)/포장수량/납기 · 영업주의사항=**그 라인의 특이사항**(`SD_ORDER_DTL.RMK_TXT`, 화면의 공정별특이사항)·생산주의사항=계획 비고 · 세부품목 인쇄 계획 행 · 용지현황(용지별 정미/여분 매수 합, 합계연수 = `FULL_QT` 합 — 매↔연 환산은 하지 않음; TOR2026100100037 로 142,000/5,800/147.8 일치 확인).
- 주석처리(코드는 남김, 메뉴·라우트·lazy import 만 주석): 사업자관리·고객관리·영업담당자관리·목표입력, 파트별 부대비용 실적, GRP생산내역, POD 작업사양, GRP수익비용대응. 되살릴 땐 `menuItems.tsx` 와 `routes/index.tsx` 양쪽 주석을 함께 푼다.
- 월매출계획 화면(`pages/info/SalesPlanPage.tsx`): 담당자 선택 → 거래처 추가(ERP `/lookup/partners` 검색) → 1~12월 공임/용지 입력 → 저장. 저장은 "요청에 포함된 담당자의 해당 연도 계획을 통째로 교체"라 행 삭제도 저장으로 반영된다. 매출현황(`pages/stats/SalesStatusPage.tsx`)은 거래처 행마다 계획/실적 2줄 + 달성률. 실적은 거래처 단위 ERP 합산이며 공임/용지 실적 분리는 미구현(별도 테이블 확인 후 붙일 것).
- **모바일 앱(PWA, `/m`)** — `vite-plugin-pwa`(manifest `start_url: /m`, 앱 껍데기만 프리캐시, `/api` 는 캐시 안 함), 아이콘은 `public/pwa-*.png`(로고의 올빼미 마크). `pages/mobile/MobileLayout`(상단바 + 하단 탭 4개 + 설치 안내) 아래 활동(`/m/activity` 월 달력·당일 목록·등록 FAB)·거래처(`/m/partner?cd=`)·관리필요(`/m/attention`)·매출(`/m/sales`). **PC 메뉴 전체를 옮기지 않는다** — 표 화면은 폰 폭에 안 맞아 이 네 개만 담기로 함(2026-10-01). 탭 노출은 PC 메뉴 키(`menuKey`) 권한을 따르고, 데이터는 기존 API·타입을 그대로 쓴다(`ActivityFormModal` 재사용, `defaultSalesEmpId` 로 로그인 사용자 기본). 홈 화면 앱(standalone)으로 `/` 를 열면 `/m` 으로 보낸다. **생산 탭**(`/m/production`, 2026-10-02) = 설비 가동 현황(`/m/production/equipment`, PC 보드와 공용 훅 `pages/production/useEquipmentBoard.ts`) · 작업지시서(`/m/production/plan`, 생산계획조회 축소판: 주문/의뢰·최근 7/14/30일·검색 → 주문 펼쳐 라인 고르면 `/production/work-order/:no/:sq` 로) · 주문진행현황 입구. 탭 노출은 `menuKeys` 중 하나라도 허용되면. 작업지시서 화면은 폰 폭이면 760px 양식을 `zoom` 으로 축소(인쇄 시 해제). **활동 알림**(2026-10-02): APK 에서 활동일 아침 8시에 활동 제목 알림 — `@capacitor/local-notifications` 로컬 알림(`pages/mobile/activityReminders.ts`, 앱 열 때·활동 저장 때 내 활동 30일치 예약, id = activityId). 네이티브 앱만 동작. **아이폰(홈 화면 웹앱)·브라우저는 웹 푸시**: `push/`(`push_subscription` V150, `/api/push/*`, `WebPushService` VAPID = `nl.martijndwars:web-push`, `ActivityReminderScheduler` 매일 08:00 Asia/Seoul 그날 활동을 담당자 구독으로), 키는 env `WEBPUSH_*`(한 번 만든 키 유지 — 바꾸면 전원 재허용, 구독은 도메인에 묶임), 서비스워커 `public/push-sw.js`(`workbox.importScripts`), 화면 `pages/mobile/webPush.ts`. APK 에선 웹 푸시 메뉴를 숨겨 로컬 알림과 겹치지 않게 한다. **안드로이드 뒤로가기**는 `@capacitor/app` backButton 으로 직접 처리(탭 아래 화면 → 이전, 다른 탭 → 활동 탭, 활동 탭 → 종료 확인) — WebView 가 탭 이동을 기록으로 안 쳐서 바로 꺼지던 문제. 사용자 메뉴에서 켜고 끔. 플러그인 추가라 APK 재빌드 필요(`MOBILE_APP.md`). 폰에서 사외 접속하려면 CRM 서버가 HTTPS 로 떠 있어야 한다.
  **네이티브 포장(Capacitor)**: `capacitor.config.ts` 의 `server.url` 로 서버의 `/m` 을 WebView 에 불러오는 껍데기 앱. 안드로이드 APK 는 `npm run app:android`(SDK `C:\Android\Sdk`, JDK 17) → `public/downloads/tara-crm.apk`, 설치 안내 페이지는 `/app`(비로그인). iOS 는 `ios/` Xcode 프로젝트까지만 — 빌드는 Mac·Apple 계정 필요. 절차는 `crm-module-web/MOBILE_APP.md`. `android/`·`ios/` 는 커밋, APK 는 커밋하지 않는다. `tsc -b` 가 루트에 `vite.config.js` 를 떨구던 문제는 `tsconfig.node.json` outDir 로 막았다(그 파일이 남아 있으면 Vite 가 `.ts` 대신 그걸 읽는다).
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

### ERP 매출·채권 데이터 소스 (2026-09-28 ERP 직접 확인)

회계단위(`PC_CD`): 1000 타라티피에스 / 9000 그래픽스 / 8000 PM. 공장(`PLANT_CD`)은 별개: 1000 / 2000 / 3000.

- **매출모듈 `SD_BILL_MST/DTL`** (매출현황 `getCustomerYearlySales` 가 보는 곳): **2026-07 까지는 TPS·GRP·PM 모두 정본.** **2026-08 부터는 TPS 만 ERP 매출모듈을 쓰고 GRP·PM 은 쓰지 않는다**(8월 GRP·PM 0원). 그래서 8월 이후 ERP 로 확실한 매출은 TPS 뿐이고, GRP·PM 의 8월 이후 매출은 **GROW 쪽에서 따로 조회한 값**과 비교·검증해야 한다(사용자 확인 2026-09-28). 매출현황(홈)은 TPS(공장 1000)가 기본이라(서버 `plantCd` 기본값·화면 기본 선택 모두 1000) 이 영향이 없다 — 사업부문 선택에서 GRP·PM 을 고를 때만 8월 이후가 0 으로 나온다.
- **회계전표 `FI_DOCU_MST/DTL`**: 조건 `GAAP_CD=2`, `DOCU_ST_CD=1`(승인), `FI_REDOCU`(역분개) 제외, 대변(`DRCRFG_CD=2`). 매출계정은 GRP **41400 그래픽스제품매출 + 40200 그래픽스상품매출**, PM **41302 PM사업매출 + 40300(40301) PM사업상품매출**. 45xxx·46xxx(매출원가, `46820 생산완료정산_제품` 포함)는 매출이 아니다. 2026-07 대조: GRP 매출모듈 37.82억 vs 전표 25.82억(12억 차이, 원인 미확인), PM 10.77억 vs 9.84억. **7월까지는 두 소스가 맞아야 하므로 이 차이는 전표 쪽 조회 조건이 덜 된 것**으로 본다 — "원래 안 맞는다"로 결론 내지 말 것.
- **채권원장 `FI_BAN_MST`**: 사업부는 회계단위가 아니라 계정으로 가른다 — TPS 10801 / GRP 10805 / PM 10804 (전부 10800 외상매출금의 형제). `OracleReceivableAgingRepository.DIVISION_ACCOUNTS`. 채권잔액은 구조상 부가세 포함(외상매출금 차변 = 공급가+부가세예수금). **채권율·회수기한 분모는 산식 미확정** — 분모를 매출액/외상매출금 발생액 중 뭘로 할지, 선매출차감(발행 때만 외상 생김·차감은 선수금↔매출) 처리를 회계팀과 정한 뒤 붙인다. **채권율·회수기한은 TPS 포함 전부 "산식 미정"으로 비워 둔다 — 사용자가 산식을 정하기 전엔 임의로 분모를 골라 채우지 않는다**(2026-09-28 사용자 지시). 분모 후보 조사 결과는 `OracleReceivableAgingRepository` 주석에 있다(TPS 매출모듈 합계 = 국내외상매출금 + 신판재고이관 미수금 + 해외예수금 + 선매출 선수금 으로 원 단위 분해됨).
- **TPS 수익비용대응(주문별 매출 vs 원가) — 보류(2026-09-28).** 연결 고리 조사 결과: 매출 `SD_BILL_DTL.SODOC_NO` 는 수주(TSO/SO)라 주문(TOR)과 직접 안 이어지고(`SD_SO_DTL.ORD_NO`·`RFR_DOC_NO` 비어 있음), **`SD_BILL_DTL.BATCH_NO` = "TOR주문번호-순번"** 으로 이어진다(`SD_SO_DTL.PURDOC_NO`·`SD_ORDDLV_MST_X20329` 도 같은 값). 단 배치를 안 쓰는 매출이 있어 TOR 배치가 붙은 매출은 일부뿐이다(2026-06 TPS 공급가 약 64%, 나머지는 배치 없음·재고 로트형 "26-…"·GOR 등). 원가는 원가모듈 `CO_ORDER_SUM`(생산오더 MES…별 월 실제원가, 차변=집계 원가) → `PP_PROD_MST.SODOC_NO`(계획 PPN) → 생산계획 → TOR 로 모인다. 조정영업이익 산식·배치 없는 매출 처리는 사용자 결정 대기.
  **다시 할 땐 원가모듈 수익성분석(CO-PA)을 쓴다** — 직접 잇지 않아도 된다. `CO_PAA_SUM`(월 `ACPE_YM` 집계, 전표 단위는 `CO_PADOC_MST/DTL`)에 기준값 `PAC12_VR` 사업장(1000 TPS/9000 GRP/8000 PM) · `PAC3_VR` 비용센터 · `PAC18_VR` 영업담당사번 · `PAC13_VR` 판매거래처 · `PAC31_VR` 품목계정그룹 · `PAC5_VR` 품목 · `PAC4_VR` 주문번호(배치)와 금액 `PAV_CD`/`PAV_VN` 이 있다. 값 코드·산식은 ERP 수익성분석현황 보고서 정의를 따른다(V0101 매출액, V0211~V0216 제조원가, V0230·V0240 기타·부산물원가, V0300·V0310·V0320 판관비, V0510 고정경비조정, V0530 부산물 → V0520 조정영업이익). 2026-07 검증: GRP 매출액 25.82억·PM 9.84억이 회계전표 매출계정 합과 일치, TPS 222.23억 중 TOR 배치 172.07억(77%). 원가 결산 끝난 달만 유효(2026-08 TPS 원가 > 매출, 09 원가 0).
- ERP 를 앱 없이 읽기 전용으로 확인하려면 gradle 캐시의 ojdbc + `java` 단일파일 러너로 SELECT 만 날린다(값·비밀번호 출력 금지).

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
