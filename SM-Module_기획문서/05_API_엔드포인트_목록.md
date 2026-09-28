# SM Module API 엔드포인트 전체 목록

> 작성일: 2026-03-24
> 작성: HM소프트

---

## 1. 인증 API

| 메서드 | 엔드포인트 | 기능 | 비고 |
|--------|-----------|------|------|
| POST | `/auth/login` | 로그인 | JWT 토큰 발급 |
| POST | `/auth/verify-2fa` | 2FA 인증 | 이메일 인증코드 |
| POST | `/auth/resend-2fa` | 2FA 재발송 | |
| GET | `/auth/me` | 사용자 정보 조회 | 토큰 기반 |

---

## 2. 주문 API

| 메서드 | 엔드포인트 | 기능 | ERP 연동 |
|--------|-----------|------|---------|
| GET | `/orders` | 주문 목록 (검색/필터/페이징) | R: 조회 |
| GET | `/orders/:id` | 주문 상세 | R: 조회 |
| POST | `/orders` | 주문 생성 | **W: ERP 주문 INSERT** |
| PUT | `/orders/:id` | 주문 수정 | **W: ERP 주문 UPDATE** |
| PATCH | `/orders/:id/status` | 상태 변경 | **W: ERP 상태 UPDATE** |
| GET | `/orders/export` | 엑셀 다운로드 | - |

---

## 3. 매출 API

| 메서드 | 엔드포인트 | 기능 | ERP 연동 |
|--------|-----------|------|---------|
| GET | `/sales` | 매출 목록 | R: 조회 |
| PATCH | `/sales/:id/confirm` | 매출 확정 | **W: ERP 매출 UPDATE** |
| GET | `/sales/:id/audit-logs` | 변경 이력 | - |
| GET | `/sales/card` | 카드매출 조회 | R: FI_CARD_TRADE |
| GET | `/sales/pre` | 선매출 목록 | - |
| POST | `/sales/pre` | 선매출 등록 | - |

---

## 4. 비대면주문 API

| 메서드 | 엔드포인트 | 기능 | ERP 연동 |
|--------|-----------|------|---------|
| GET | `/sales/untact` | 비대면주문 목록 | - |
| POST | `/sales/untact` | 비대면주문 생성 | - |
| POST | `/sales/untact/payment` | 비대면결제 | - |
| GET | `/sales/untact/settlement` | 비대면정산 | - |

---

## 5. 세금계산서 API

| 메서드 | 엔드포인트 | 기능 | 외부 연동 |
|--------|-----------|------|---------|
| GET | `/tax/candidates` | 발행 대상 조회 | - |
| POST | `/tax/issue` | 세금계산서 발행 | 더존 API |
| GET | `/tax/invoices` | 세금계산서 목록 | - |

---

## 6. 구매/외주 API

| 메서드 | 엔드포인트 | 기능 | ERP 연동 |
|--------|-----------|------|---------|
| GET | `/purchase/outsourcing-po` | 외주발주 목록 | R: 조회 |
| PATCH | `/purchase/outsourcing-po/:id/settlement-status` | 정산상태 변경 | - |
| GET | `/purchase/outsourcing-po/:id/document` | PDF 다운로드 | - |
| GET | `/purchase/outsourcing-settlement` | 외주정산 목록 | - |
| POST | `/purchase/outsourcing-settlement` | 일괄 정산 생성 | **W: ERP 발주 INSERT** |
| POST | `/purchase/outsourcing-settlement/import` | 엑셀 업로드 | - |
| POST | `/purchase/outsourcing-settlement/sync-gitgo` | 깃고 연동 | 깃고 API |

---

## 7. 정보관리 API

| 메서드 | 엔드포인트 | 기능 | ERP 연동 |
|--------|-----------|------|---------|
| GET | `/info/biz-owners` | 사업자 목록 | R: CI_PARTNER_MST |
| POST | `/info/biz-owners` | 사업자 등록 | - |
| PUT | `/info/biz-owners/:id` | 사업자 수정 | - |
| GET | `/info/customers` | 고객 목록 | - |
| POST | `/info/customers` | 고객 등록 | - |
| PUT | `/info/customers/:id` | 고객 수정 | - |
| GET | `/info/part-goals` | 파트목표 조회 | R: SD_MMBLPL_MST_X20329 |
| PUT | `/info/part-goals` | 파트목표 저장 | - |
| GET | `/info/am-goals` | AM목표 조회 | R: SD_MMBLPL_MST_X20329 |
| PUT | `/info/am-goals` | AM목표 저장 | - |

---

## 8. 통계 API

| 메서드 | 엔드포인트 | 기능 | ERP 연동 |
|--------|-----------|------|---------|
| GET | `/stats/team-forecast` | 팀 예상매출 | R: 매출/수주 데이터 |
| GET | `/stats/team-goal-actual` | 팀 목표/실적 | R: 매출계획+매출 |
| GET | `/stats/part-goal-actual-yoy` | 파트 전년대비 | R: 매출계획+매출 |
| GET | `/stats/am-goal-actual-yoy` | AM 전년대비 | R: 매출계획+매출 |
| GET | `/stats/item-performance` | 품목별 실적 | R: 주문상세 |
| GET | `/stats/vendor-margin` | 거래처별 마진 | R: 주문/매출 |
| GET | `/stats/order-margin` | 주문별 마진 | R: 주문/매출 |

---

## 9. 대시보드 API

| 메서드 | 엔드포인트 | 기능 | ERP 연동 |
|--------|-----------|------|---------|
| GET | `/dashboard/summary` | 요약 정보 | R: 매출/주문/거래처 집계 |
| GET | `/dashboard/sales-trend` | 매출 추이 차트 | R: 월별 매출 |
| GET | `/dashboard/recent-orders` | 최근 주문 | R: 주문 데이터 |

---

## 10. ERP 연동 API (신규)

| 메서드 | 엔드포인트 | 기능 | 비고 |
|--------|-----------|------|------|
| GET | `/api/erp/health` | Oracle 연결 상태 확인 | Phase 1 |
| POST | `/api/erp/sync/master` | 마스터 데이터 수동 동기화 | Phase 2 |
| POST | `/api/erp/sync/transaction` | 트랜잭션 데이터 수동 동기화 | Phase 3 |
| GET | `/api/erp/sync/status` | 동기화 현황 조회 | 관리용 |
| GET | `/api/erp/sync/logs` | 동기화 이력 조회 | 관리용 |

---

## 요약

| 구분 | API 수 |
|------|--------|
| 인증 | 4 |
| 주문 | 6 |
| 매출 | 6 |
| 비대면주문 | 4 |
| 세금계산서 | 3 |
| 구매/외주 | 7 |
| 정보관리 | 10 |
| 통계 | 7 |
| 대시보드 | 3 |
| ERP 연동 (신규) | 5 |
| **합계** | **55** |

> R = ERP에서 읽기, W = ERP에 쓰기

---

## 11. 외부 제공 API (2026-09-17 신규) — 사내 타 시스템용 매출 조회

**목적**: 다른 팀/시스템이 GROW 매출 데이터를 가져다 쓰도록 여는 API. 내부 화면 API(`/api/sales`)와 경로를 분리(`/api/ext/v1/**`)하고, 소비자별로 권한을 관리한다.

**인증·권한**
- 기존 사용자 JWT 재사용: 소비자 = GROW **서비스 계정(users 행) + 장기 토큰(기본 365일)**. 관리자 화면 「API 클라이언트 관리」에서 클라이언트 등록 → 토큰 발급(응답에서 1회만 노출). 재발급 시 `token_version` 증가로 이전 토큰 즉시 무효.
- 권한은 role 이 아니라 `api_client` 행이 결정: **스코프**(`SALES_READ` 목록·상세 / `SALES_SUMMARY` 합계), **부서 범위**(`dept_cds`, 비우면 전체), **사업장**(`plant_cd` GRP 2000 / PM 3000), **분당·일 호출 한도**, 만료일, 상태(ACTIVE/SUSPENDED).
- 클라이언트 토큰은 `/api/ext/**` 에서만 유효(내부 API 호출 시 403).
- **직원 개인 호출**: GROW 계정이 있으면 등록 없이 자기 로그인 토큰(`/api/auth/login`)으로 `/api/ext/**` 호출 가능(`ext-api.allow-user-token`, 기본 true). 이때 부서 범위는 **본인 role 권한**(매출목록과 같은 `RoleFilterHelper.getOrderAccessibleDepartmentCds`: ADMIN·임원·팀장·FINANCE·SALES_SPT·센터장 = 전체 / 파트장·매니저·사원 = 본인 부서), 조회 스코프 전부, 한도는 개인 기본값(분 60 / 일 3,000). 호출 로그는 `client_id=0` 으로 기록.
- 데이터 기준 = **매출목록 화면과 동일**(매출확정 + 사내실적 포함, 선매출/선매출취소 제외, 세금계산서는 발행분만).
- 호출 로그 `api_call_log`(관리 화면 로그 드로어), 킬스위치 env `EXT_API_ENABLED=false` → 503.

| 메서드 | 엔드포인트 | 기능 | 스코프 | 주요 파라미터 |
|--------|-----------|------|--------|---------------|
| GET | `/api/ext/v1/sales` | 매출 목록(페이지) | SALES_READ | startDate*, endDate*(최대 366일), deptCd, partnerCd, salesType, keyword, page, size(≤500) |
| GET | `/api/ext/v1/sales/{salesNo}` | 매출 상세(순번 lines 포함) | SALES_READ | - |
| GET | `/api/ext/v1/sales/summary` | 매출 합계(건수·공급가·세액·총액) | SALES_SUMMARY | startDate*, endDate*, deptCd, partnerCd, salesType, keyword |
| GET | `/api/ext/v1/me` | 내 클라이언트 정보(스코프·범위·한도·잔여·만료) | - | - |

**응답 필드(Item)**: salesNo, salesTitle, orderNo, partnerCd/partnerNm, orderPartnerNm, salesType/salesTypeNm, payType, taxTypeCd, salesDt, issueDt, supplyAmt, taxAmt, totalAmt, confirmed/confirmedAt, statusCd, deptCd/deptNm, salesEmpNo/salesEmpNm, division, note, firstItemNm, lines[orderNo, orderSq, itemNm, itemCategory, workPlaceCd, workType, supplyAmt, taxAmt]. 카드번호·승인번호·사업자번호·위하고/ERP 전송 상태·등록자 등 내부 필드는 노출하지 않는다.

**에러 코드**: 401 `EXT_TOKEN_REVOKED` / `EXT_CLIENT_SUSPENDED` / `EXT_CLIENT_EXPIRED` / `EXT_TOKEN_INVALID`, 403 `EXT_SCOPE_DENIED`(BusinessException ACCESS_DENIED) / `EXT_PATH_DENIED` / `EXT_CLIENT_REQUIRED`, 429 `EXT_RATE_LIMITED`(헤더 `X-RateLimit-Remaining-Minute/-Day`), 503 `EXT_API_DISABLED`.

**관리 API (ADMIN)**: `GET/POST /api/admin/api-clients`, `PUT /{id}`, `PATCH /{id}/status?active=`, `POST /{id}/token`, `GET /{id}/logs?from&to`, `GET /catalog`(엔드포인트 카탈로그 — 관리자 「외부 API 목록」 화면). Swagger 그룹 `external-sales`: `/swagger-ui/index.html?urls.primaryName=external-sales`.

**소비자 전달물**: 토큰(1회), Swagger 그룹 링크, 위 표·에러 코드·한도(기본 분당 60 / 일 5,000).
