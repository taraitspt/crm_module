# SM Module 상세 기획서

> **Updated:** 2026-04-07 — 실제 구현 상태 및 신규 요구사항(2026-04-06 엑셀) 반영
>
> **주요 변경 이력 (2026-03-26 ~ 2026-04-06):**
> - **DB 아키텍처**: 단일PK(BIGINT AUTO_INCREMENT) → 복합PK(company_cd + plant_cd + seq) 전면 전환
> - **테이블명 변경**: orders→order_mst, order_works→order_dtl, order_items→order_info, sales→sales_mst, outsourcing_pos→po_mst 등
> - **FK 비정규화**: customer_id/business_owner_id FK 삭제 → partner_cd/partner_nm/customer_nm 문자열 직접 저장
> - **ERP 연동**: Oracle DB 직접 조회 방식 (ErpLookupController, ErpPartnerRepository, ErpEmployeeRepository)
> - **신규 테이블**: sales_dtl, order_dlv, po_settle_mst, po_settle_dtl
> - **삭제 테이블**: card_sales (→ sales_mst 통합), customers MySQL (→ ERP 직접 조회)
> - **주문번호 규칙**: O{YYMMDD}-{부서4}-{seq5} → GSM{YYYY}{MMDD}{seq5}
> - **주문상태 확장**: 6단계 (PENDING/CONFIRMED/PO_COMPLETE/SHIP_COMPLETE/SALES_WAIT/SALES_CONFIRMED)
> - **미구현 화면**: 고객관리, 카드매출, 선매출, 비대면주문/정산, 세금계산서, 외주정산현황, 통계 7개

## 1. 프로젝트 개요

### 1.1 시스템 목적
SM Module은 인쇄/출판 업종의 **영업관리 ERP 시스템**으로, 주문 접수부터 외주 발주, 매출 관리, 세금계산서 발행까지의 전체 영업 프로세스를 통합 관리한다.

### 1.2 기술 스택
| 영역 | 기술 |
|------|------|
| **Frontend** | React 18+ / TypeScript / Vite |
| **Backend** | Spring Boot 3.x / Java 17 |
| **Database** | MySQL (애플리케이션) + Oracle (ERP 연동) |
| **인증** | Spring Security + JWT |
| **ORM** | Spring Data JPA + QueryDSL |
| **상태관리** | Zustand |
| **UI 프레임워크** | Ant Design |
| **차트** | Recharts |
| **테이블** | TanStack Table |
| **HTTP 클라이언트** | Axios + React Query |
| **라우팅** | React Router v6 |
| **폼 관리** | React Hook Form + Zod |
| **엑셀 처리** | SheetJS |
| **DB 마이그레이션** | Flyway |
| **DTO 변환** | MapStruct |
| **API 문서** | Swagger / OpenAPI 3.0 |

### 1.3 배포 환경
- **하이브리드**: 사내 서버에 배포하되 외부 접속도 허용
- 외부 IP 접속 시 SMS 인증 (선택적)
- HTTPS 필수

### 1.4 사용자 역할 및 권한
| 역할 | 설명 | 권한 범위 |
|------|------|-----------|
| ADMIN | 시스템 관리자 | 전체 데이터 접근, 사용자/부서 관리 |
| MANAGER | 파트 관리자 | 본인 파트 + 하위 파트 데이터 접근 |
| STAFF | 일반 영업직원 | 본인 파트 데이터 조회, 본인 주문/매출 등록 |

**부서 계층 구조**: 사업본부(그래픽스/PM/국내/해외) > 파트(시청/역삼1/대치/을지로 등)

---

## 2. 시스템 아키텍처

### 2.1 전체 구조
```
[Client Layer]
  React SPA (Vite + TypeScript)
  ├─ 반응형 디자인 (Desktop / Tablet / Mobile)
  └─ Axios → REST API 호출

[API Layer]
  Spring Boot 3.x (Java 17+)
  ├─ Spring Security + JWT 인증
  ├─ REST Controller (도메인별)
  └─ Spring AOP (로깅/감사)

[Service Layer]
  도메인 서비스 (트랜잭션 경계)
  ├─ 주문 도메인
  ├─ 매출 도메인
  ├─ 매입 도메인
  ├─ 정보관리 도메인
  └─ 통계 도메인

[Data Layer]
  Spring Data JPA + QueryDSL
  └─ MariaDB 10.11+

[External Integration Layer]
  ├─ 더존 API (세금계산서)
  ├─ 깃고 API (전자결재)
  └─ ERP 데이터 연동
```

### 2.2 아키텍처 패턴
- **모놀리식 아키텍처**: 단일 Spring Boot 서버 + React SPA
- 도메인별 패키지 분리로 관심사 분리
- 트랜잭션 관리 용이 (주문→발주→정산→매출 연쇄 프로세스)

---

## 3. 프로젝트 구조

### 3.1 Backend 패키지 구조
```
sm-module-api/
├── src/main/java/com/tara/sm/
│   ├── SmModuleApplication.java
│   ├── common/
│   │   ├── config/          # Security, CORS, Swagger, JPA 설정
│   │   ├── dto/             # 공통 응답(ApiResponse), 페이징 DTO
│   │   ├── exception/       # 글로벌 예외 처리 (GlobalExceptionHandler)
│   │   ├── util/            # 유틸리티 (엑셀, 날짜, 번호 생성 등)
│   │   └── audit/           # 감사 로그 (BaseEntity, AuditorAware)
│   ├── auth/
│   │   ├── controller/      # AuthController (로그인, 토큰 재발급)
│   │   ├── service/         # AuthService (인증 처리)
│   │   ├── dto/             # LoginRequest, TokenResponse
│   │   ├── entity/          # User, Role, Department
│   │   ├── repository/      # UserRepository, DepartmentRepository
│   │   └── jwt/             # JwtTokenProvider, JwtAuthenticationFilter
│   ├── info/                # 정보관리 도메인
│   │   ├── controller/      # BizOwnerController, CustomerController
│   │   ├── service/         # BizOwnerService, CustomerService
│   │   ├── dto/             # BizOwnerDto, CustomerDto, GoalDto
│   │   ├── entity/          # BusinessOwner, Customer, PartGoal, AmGoal
│   │   └── repository/
│   ├── order/               # 주문관리 도메인
│   │   ├── controller/      # OrderController
│   │   ├── service/         # OrderService
│   │   ├── dto/             # OrderCreateDto, OrderListDto, OrderDetailDto
│   │   ├── entity/          # Order, OrderWork, OrderItem
│   │   └── repository/
│   ├── sales/               # 매출관리 도메인
│   │   ├── controller/      # SalesController, PreSalesController, UntactController
│   │   ├── service/         # SalesService, PreSalesService, UntactService
│   │   ├── dto/
│   │   ├── entity/          # Sales, CardSales, PreSales, UntactOrder, UntactSettlement
│   │   └── repository/
│   ├── purchase/            # 매입마감 도메인
│   │   ├── controller/      # OutsourcingPoController, OutsourcingSettlementController
│   │   ├── service/
│   │   ├── dto/
│   │   ├── entity/          # OutsourcingPo, OutsourcingSettlement
│   │   └── repository/
│   ├── tax/                 # 세금계산서 도메인
│   │   ├── controller/      # TaxInvoiceController
│   │   ├── service/         # TaxInvoiceService
│   │   ├── dto/
│   │   ├── entity/          # TaxInvoice
│   │   └── repository/
│   ├── stats/               # 통계 도메인
│   │   ├── controller/      # StatsController
│   │   ├── service/         # StatsService (QueryDSL 기반 집계 쿼리)
│   │   └── dto/
│   └── integration/         # 외부 연동
│       ├── douzone/         # 더존 세금계산서 API 클라이언트
│       ├── gitgo/           # 깃고 전자결재 API 클라이언트
│       └── erp/             # ERP 데이터 연동 클라이언트
├── src/main/resources/
│   ├── application.yml
│   ├── application-dev.yml
│   ├── application-prod.yml
│   └── db/migration/        # Flyway 마이그레이션 스크립트
└── build.gradle
```

### 3.2 Frontend 폴더 구조
```
sm-module-web/
├── public/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── api/                 # API 계층
│   │   ├── client.ts        # Axios 인스턴스 + JWT 인터셉터
│   │   ├── auth.api.ts
│   │   ├── order.api.ts
│   │   ├── sales.api.ts
│   │   ├── purchase.api.ts
│   │   ├── info.api.ts
│   │   ├── tax.api.ts
│   │   └── stats.api.ts
│   ├── components/          # 공용 컴포넌트
│   │   ├── layout/          # AppHeader, AppSidebar, PageLayout, Breadcrumb
│   │   ├── table/           # DataTable, ExcelDownloadBtn, ExcelUploadBtn
│   │   ├── form/            # SearchBar, DateRangePicker, SelectFilter, SearchPopup
│   │   └── common/          # Modal, Loading, ErrorBoundary, ProtectedRoute
│   ├── pages/               # 페이지 컴포넌트 (총 28개 화면)
│   │   ├── home/            # DashboardPage
│   │   ├── auth/            # LoginPage
│   │   ├── process/         # ProcessFlowPage
│   │   ├── info/            # BizOwnerPage, CustomerPage, PartGoalPage, AmGoalPage
│   │   ├── order/           # OrderListPage, OrderCreatePage
│   │   ├── sales/           # SalesListPage, CardSalesPage, PreSalesListPage,
│   │   │                    # PreSalesInputPage, UntactOrderCreatePage,
│   │   │                    # UntactOrderListPage, UntactSettlementPage,
│   │   │                    # TaxIssuePage, TaxIssueListPage
│   │   ├── purchase/        # OutsourcingPoPage, OutsourcingSettlementPage,
│   │   │                    # OutsourcingStatusPage
│   │   └── stats/           # TeamForecastPage, TeamGoalActualPage,
│   │                        # PartGoalActualYoyPage, AmGoalActualYoyPage,
│   │                        # ItemPerfPage, VendorMarginPage, OrderMarginPage
│   ├── hooks/               # useAuth, useTable, useExcelExport, useSearchParams
│   ├── store/               # authStore, uiStore
│   ├── types/               # 공통 타입, 도메인별 타입
│   ├── routes/              # 라우트 설정, ProtectedRoute
│   └── utils/               # 날짜 포맷, 금액 포맷, 검증 헬퍼
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 4. 데이터베이스 설계

> **아키텍처 변경 (2026-03-26):** 모든 도메인 테이블이 복합PK(company_cd + plant_cd + 업무키) 체계로 전환됨.
> FK 관계 삭제, ERP 코드 기반 비정규화. Audit 컬럼: created_at, updated_at, created_id(VARCHAR(20)), updated_id(VARCHAR(20)).

### 4.1 인증/권한 테이블

#### users (사용자) — 단일PK 유지
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT | PK, AUTO_INCREMENT | 사용자 ID |
| employee_no | VARCHAR(20) | UNIQUE, NOT NULL | 사원번호 |
| password | VARCHAR(255) | NOT NULL | BCrypt 암호화 비밀번호 |
| name | VARCHAR(50) | NOT NULL | 이름 |
| phone | VARCHAR(20) | | 휴대폰번호 |
| email | VARCHAR(100) | | 이메일 |
| department_id | BIGINT | FK → departments | 소속 부서 |
| role | ENUM('ADMIN','MANAGER','STAFF') | NOT NULL | 역할 |
| status | ENUM('ACTIVE','INACTIVE') | DEFAULT 'ACTIVE' | 계정 상태 |
| created_at | DATETIME | NOT NULL | 생성일시 |
| updated_at | DATETIME | NOT NULL | 수정일시 |

#### departments (부서/파트) — 단일PK 유지
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT | PK, AUTO_INCREMENT | 부서 ID |
| name | VARCHAR(50) | NOT NULL | 부서명 (시청파트, 역삼1파트 등) |
| division | VARCHAR(50) | NOT NULL | 사업본부 (그래픽스/PM/국내/해외) |
| parent_id | BIGINT | FK → departments, NULLABLE | 상위 부서 |
| sort_order | INT | DEFAULT 0 | 정렬 순서 |
| created_at | DATETIME | NOT NULL | 생성일시 |

### 4.2 정보관리 테이블

#### business_owners (사업자) — 단일PK 유지, ERP 조회전용
> **변경:** douzone_code/department_id FK 삭제, company_cd/partner_cd/dept_cd 추가. biz_type/biz_item VARCHAR(500).
> **데이터 소스:** ERP Oracle 직접 조회 (ErpPartnerRepository). 공장셀렉트박스로 필터링 (1000:TPS, 2000:GRP, 3000:PM).

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT | PK, AUTO_INCREMENT | |
| company_cd | INT | | 회사코드 |
| partner_cd | VARCHAR(20) | | 거래처코드 (ERP) |
| company_name | VARCHAR(100) | NOT NULL | 회사명 |
| biz_no | VARCHAR(20) | | 사업자번호 |
| biz_type | VARCHAR(500) | | 업태 (변경: 50→500) |
| biz_item | VARCHAR(500) | | 종목 (변경: 50→500) |
| address | VARCHAR(255) | | 주소 |
| representative_name | VARCHAR(50) | | 대표자명 |
| representative_email | VARCHAR(100) | | 대표자 이메일 |
| representative_phone | VARCHAR(20) | | 대표자 연락처 |
| dept_cd | INT | | 공장코드 (1000:TPS, 2000:GRP, 3000:PM) |
| + BaseEntity | | | created_at/updated_at/created_id/updated_id |

#### ~~customers (고객)~~ — MySQL 테이블 삭제
> ERP Oracle 직접 조회로 변경됨. ErpLookupController 통해 접근. 공장별 조회 지원.
> 화면 미구현 (2026-04-07 기준).

### 4.3 주문관리 테이블

#### order_mst (주문마스터) — 복합PK
> **변경:** orders→order_mst, 단일PK→복합PK, FK 삭제→비정규화
> **신규 컬럼 (2026.03.26):** sales_dept_cd, sales_emp_no, wrk_fg, erp_no

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| company_cd | INT | PK | 회사코드 |
| plant_cd | INT | PK | 공장코드 |
| order_no | VARCHAR(30) | PK | 주문번호 (GSM2026040600001) |
| order_title | VARCHAR(200) | | 주문명 |
| partner_cd | VARCHAR(20) | | 거래처코드 (ERP 비정규화) |
| partner_nm | VARCHAR(100) | | 거래처명 (비정규화) |
| customer_nm | VARCHAR(100) | | 고객명 (비정규화) |
| sales_dept_cd | INT | | 영업담당부서 (신규 3/26) |
| sales_emp_no | VARCHAR(20) | | 영업담당자사번 (변경 3/26) |
| rcv_emp_no | VARCHAR(20) | | 접수자사번 |
| rcv_branch | VARCHAR(50) | | 접수지점 (→영업부서 명명변경) |
| tax_type_cd | VARCHAR(20) | DEFAULT 'TAXABLE' | 세무구분 (ERP 기준정보 조회) |
| status_cd | VARCHAR(30) | DEFAULT 'PENDING' | 주문상태 (6단계) |
| request_dt | DATETIME | | 완료요청일시 |
| received_dt | DATE | | 접수일자 |
| due_dt | DATE | | 납기일 |
| note | TEXT | | 특이사항 |
| total_amt | BIGINT | DEFAULT 0 | 총금액 |
| erp_order_no | VARCHAR(30) | | ERP 주문번호 |
| erp_sync_status | VARCHAR(20) | DEFAULT 'NONE' | ERP 연동상태 |
| wrk_fg | VARCHAR(20) | DEFAULT '202' | 주문구분 (202:국내/400:품질/401:샘플) (신규 3/26) |
| erp_no | VARCHAR(30) | | ERP주문번호 (신규 3/26) |
| + BaseEntity | | | audit 4컬럼 |

**주문번호 생성 규칙 (변경)**: `GSM{YYYY}{MMDD}{시퀀스5자리}` (예: GSM2026040600001)

**주문상태 전이 (변경):**
주문접수(PENDING) → 주문확정(CONFIRMED) → 발주완료(PO_COMPLETE) → 발송완료(SHIP_COMPLETE) → 매출대기(SALES_WAIT) → 매출확정(SALES_CONFIRMED)

#### order_dtl (주문디테일/작업) — 복합PK
> **변경:** order_works→order_dtl, work_name→세부품목명 (명명변경 4/6)

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| company_cd | INT | PK | |
| plant_cd | INT | PK | |
| order_no | VARCHAR(30) | PK | |
| order_sq | INT | PK | 순번 |
| work_type | VARCHAR(20) | | 작업처 (OUTSOURCE/PACKAGE/PND/PURCHASE/POD) |
| work_name | VARCHAR(200) | | **세부품목명** (명명변경 4/6, 기존 작업명) |
| quantity | INT | DEFAULT 1 | 제작부수 |
| note | TEXT | | 기타사항 |
| status_cd | VARCHAR(30) | DEFAULT 'PENDING' | 작업상태 |
| work_amt | BIGINT | DEFAULT 0 | 작업금액 |
| delivery_fee | BIGINT | DEFAULT 0 | 배송비 |
| design_fee | BIGINT | DEFAULT 0 | 디자인비 |
| discount | BIGINT | DEFAULT 0 | 할인 |
| payment_amt | BIGINT | DEFAULT 0 | 결제금액 |
| + BaseEntity | | | audit 4컬럼 |

#### order_info (주문품목정보) — 복합PK, BaseEntity 미적용
> **변경:** order_items→order_info. **신규 (3/27):** ord_partner_cd

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| company_cd | INT | PK | |
| plant_cd | INT | PK | |
| order_no | VARCHAR(30) | PK | |
| order_sq | INT | PK | |
| info_sq | INT | PK | 품목순번 |
| category | VARCHAR(20) | | 구분 (PAPER/PRINT/FINISHING/BINDING) |
| composition | VARCHAR(50) | | 구성 (표지/본문 등) |
| item_name | VARCHAR(100) | | 품목명 |
| note | VARCHAR(200) | | 비고 |
| quantity | INT | DEFAULT 1 | 수량 |
| unit_price | BIGINT | DEFAULT 0 | 단가 |
| subtotal | BIGINT | DEFAULT 0 | 소계 |
| ord_partner_cd | VARCHAR(20) | | 구매거래처코드 (신규 3/27) |

#### order_dlv (배송정보) — 복합PK, 신규 테이블
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| company_cd | INT | PK | |
| plant_cd | INT | PK | |
| order_no | VARCHAR(30) | PK | |
| order_sq | INT | PK | |
| dlv_sq | INT | PK | 배송순번 |
| dlv_dt | DATE | | 배송일 |
| dlv_qty | INT | DEFAULT 0 | 배송수량 |
| dlv_addr | VARCHAR(200) | | 배송주소 |
| note | VARCHAR(500) | | 비고 |
| status_cd | VARCHAR(20) | DEFAULT 'PENDING' | 배송상태 |
| + BaseEntity | | | audit 4컬럼 |

### 4.4 매출관리 테이블

#### sales_mst (매출마스터) — 복합PK
> **변경:** sales→sales_mst, 복합PK, 카드정보 통합(card_sales 삭제)
> **신규 (3/30~31):** sales_dept_cd/nm, 카드5컬럼, pg_txn_id, tax_no

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| company_cd | INT | PK | 회사코드 |
| plant_cd | INT | PK | 공장코드 |
| sales_no | VARCHAR(30) | PK | 매출번호 |
| sales_title | VARCHAR(200) | | 매출명 |
| order_no | VARCHAR(30) | | 주문번호 (비정규화) |
| partner_cd | VARCHAR(20) | | 거래처코드 |
| partner_nm | VARCHAR(100) | | 거래처명 |
| tax_type_cd | VARCHAR(20) | | 세무구분 |
| sales_type | VARCHAR(20) | | 매출타입 |
| pay_type | VARCHAR(20) | | 결제수단 (CARD/CASH 등) |
| sales_dt | DATE | | 매출일자 |
| total_amt | BIGINT | DEFAULT 0 | 총금액 |
| dept_cd | INT | | 부서코드 |
| sales_emp_no | VARCHAR(20) | | 영업담당자사번 |
| status_cd | VARCHAR(20) | DEFAULT 'DRAFT' | 상태 |
| confirmed | BOOLEAN | DEFAULT FALSE | 확정여부 |
| confirmed_at | DATETIME | | 확정일시 |
| confirmed_id | VARCHAR(20) | | 확정자ID |
| slip_no | VARCHAR(30) | | 매출전표번호 |
| pay_email | VARCHAR(100) | | 결제알림 이메일 |
| erp_bill_no | VARCHAR(30) | | ERP 청구번호 |
| erp_sync_status | VARCHAR(20) | DEFAULT 'NONE' | ERP 연동상태 |
| note | TEXT | | 비고 |
| sales_dept_cd | VARCHAR(20) | | 부서코드 (신규 3/30) |
| sales_dept_nm | VARCHAR(100) | | 부서명-히스토리관리 (신규 3/30) |
| card_company_cd | VARCHAR(20) | | 카드사 (신규 3/30, card_sales 통합) |
| card_no | VARCHAR(50) | | 카드번호 (신규 3/30) |
| card_approve_no | VARCHAR(50) | | 카드승인번호 (신규 3/30) |
| card_approve_dt | DATETIME | | 카드승인일시 (신규 3/30) |
| devide_month | INT | | 할부개월 (신규 3/30) |
| pg_txn_id | VARCHAR(50) | | PG사 거래ID (신규 3/30) |
| tax_no | VARCHAR(50) | | 전자세금계산서번호 (신규 3/31) |
| + BaseEntity | | | audit 4컬럼 |

#### sales_dtl (매출디테일) — 복합PK, 신규 테이블
> **신규:** 기존 기획서에 없던 테이블. 매출 1:N 상세 라인.
> **신규 (3/30):** ref_sales_no, ref_sales_sq (선매출 참조)

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| company_cd | INT | PK | |
| plant_cd | INT | PK | |
| sales_no | VARCHAR(30) | PK | |
| sales_sq | INT | PK | 매출순번 |
| item_nm | VARCHAR(200) | | 품목명 |
| quantity | INT | DEFAULT 0 | 수량 |
| unit_price | BIGINT | DEFAULT 0 | 단가 |
| supply_amt | BIGINT | DEFAULT 0 | 공급가액 |
| tax_amt | BIGINT | DEFAULT 0 | 세액 |
| total_amt | BIGINT | DEFAULT 0 | 합계 |
| note | VARCHAR(500) | | 비고 |
| ref_sales_no | VARCHAR(30) | | 참조선매출번호 (신규 3/30) |
| ref_sales_sq | VARCHAR(10) | | 참조선매출순번 (신규 3/30) |
| + BaseEntity | | | audit 4컬럼 |

#### ~~card_sales~~ — 삭제됨
> sales_mst.pay_type='CARD' 필터로 대체. 카드정보는 sales_mst에 통합.

#### pre_sales (선매출) -- 미구현, 추후 개발 예정
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT | PK, AUTO_INCREMENT | |
| pre_sales_no | VARCHAR(30) | UNIQUE, NOT NULL | 선매출번호 |
| department_id | BIGINT | FK → departments | 영업부서 |
| manager_id | BIGINT | FK → users | 부서담당자 |
| business_owner_id | BIGINT | FK → business_owners | 거래처 |
| customer_id | BIGINT | FK → customers | 거래처 담당자 |
| amount | BIGINT | NOT NULL | 금액 |
| deduct_order_id | BIGINT | FK → orders, NULLABLE | 차감주문번호 |
| payment_type | VARCHAR(30) | | 결제구분 |
| tax_type | ENUM('TAXABLE','ZERO_RATE','EXEMPT') | DEFAULT 'TAXABLE' | 과세구분 |
| note | TEXT | | 비고 |
| registered_by | BIGINT | FK → users | 등록자 |
| created_at | DATETIME | NOT NULL | |

**선매출-차감주문 관계**: 1:1 또는 1:N 매핑 가능. 선매출 금액과 주문 금액이 다를 수 있으므로 별도 차감 이력 테이블 추가 검토 필요.

#### untact_orders (비대면주문) -- 미구현, 추후 개발 예정
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT | PK, AUTO_INCREMENT | |
| untact_no | VARCHAR(30) | UNIQUE, NOT NULL | 비대면결제번호 (Un260304-0042-00001) |
| order_id | BIGINT | FK → orders | 원본 주문 |
| department_id | BIGINT | FK → departments | 영업담당부서 |
| manager_id | BIGINT | FK → users | 영업담당자 |
| business_owner_id | BIGINT | FK → business_owners | 거래처 |
| customer_id | BIGINT | FK → customers | 고객 |
| amount | BIGINT | NOT NULL | 금액 |
| work_name | VARCHAR(200) | | 작업명 |
| payment_status | ENUM('PENDING','COMPLETED') | DEFAULT 'PENDING' | 결제여부 |
| payment_code | VARCHAR(30) | | 결제코드 |
| created_at | DATETIME | NOT NULL | |

#### untact_settlements (비대면정산) -- 미구현, 추후 개발 예정
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT | PK, AUTO_INCREMENT | |
| merchant_id | VARCHAR(30) | | 가맹점ID |
| branch | VARCHAR(50) | | 지점/파트 |
| untact_order_id | BIGINT | FK → untact_orders | 비대면주문 |
| approval_datetime | DATETIME | | 승인날짜시간 |
| approval_no | VARCHAR(30) | | 승인번호 |
| payment_method | VARCHAR(20) | | 결제수단 |
| payment_amount | BIGINT | DEFAULT 0 | 결제금액 |
| supply_price | BIGINT | DEFAULT 0 | 공급가 |
| vat | BIGINT | DEFAULT 0 | 부가세 |
| payment_fee | BIGINT | DEFAULT 0 | 결제수수료 |
| refund_fee | BIGINT | DEFAULT 0 | 환불수수료 |
| payout_amount | BIGINT | DEFAULT 0 | 지급금액 |
| payout_date | DATE | | 지급일자 |

### 4.5 세금계산서 테이블 -- 미구현, 추후 개발 예정

#### tax_invoices (세금계산서)
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT | PK, AUTO_INCREMENT | |
| department_id | BIGINT | FK → departments | 영업부서 |
| issue_datetime | DATETIME | NOT NULL | 발행일시 |
| issue_no | VARCHAR(30) | UNIQUE | 발행번호 |
| biz_no | VARCHAR(20) | NOT NULL | 사업자번호 |
| company_name | VARCHAR(100) | NOT NULL | 회사명 |
| manager_name | VARCHAR(50) | | 담당자 |
| total_amount | BIGINT | NOT NULL | 합계액 |
| supply_price | BIGINT | NOT NULL | 공급가액 |
| vat | BIGINT | NOT NULL | 세액 |
| status | ENUM('ISSUED','CANCELLED') | DEFAULT 'ISSUED' | 상태 |
| douzone_sync_status | ENUM('PENDING','SYNCED','FAILED') | DEFAULT 'PENDING' | 더존 연동 상태 |
| order_id | BIGINT | FK → orders | 관련 주문 |
| created_at | DATETIME | NOT NULL | |

### 4.6 매입마감 테이블

#### po_mst (외주발주마스터) — 복합PK
> **변경:** outsourcing_pos→po_mst, FK 삭제→비정규화
> **신규 (4/1):** in_delivery_dt (입고요청일)
> **상태값 변경:** 접수대기(PENDING)/미정산/정산/매입완료

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| company_cd | INT | PK | 회사코드 |
| plant_cd | INT | PK | 공장코드 |
| po_no | VARCHAR(30) | PK | 발주번호 |
| order_no | VARCHAR(30) | | 주문번호 (비정규화) |
| dept_cd | INT | | 영업부서코드 |
| work_title | VARCHAR(200) | | 작업제목 |
| partner_cd | VARCHAR(20) | | 거래처코드 (비정규화) |
| partner_nm | VARCHAR(100) | | 거래처명 |
| order_amt | BIGINT | DEFAULT 0 | 수주금액 |
| po_amt | BIGINT | DEFAULT 0 | 발주금액 |
| sales_emp_no | VARCHAR(20) | | 영업담당자사번 |
| po_emp_no | VARCHAR(20) | | 외주담당자사번 |
| status_cd | VARCHAR(30) | DEFAULT 'PENDING' | 접수대기/미정산/정산/매입완료 |
| settle_status_cd | VARCHAR(20) | DEFAULT 'UNSETTLED' | 정산상태 |
| delivery_dt | DATE | | 납품일 |
| in_delivery_dt | DATETIME | | 입고요청일 (신규 4/1) |
| received_dt | DATE | | 접수일 |
| erp_po_no | VARCHAR(30) | | ERP 발주번호 |
| erp_sync_status | VARCHAR(20) | DEFAULT 'NONE' | ERP 연동상태 |
| + BaseEntity | | | audit 4컬럼 |

#### po_dtl (외주발주디테일) — 복합PK
> **변경:** outsourcing_settlements→po_dtl (발주디테일로 역할 변경)
> **신규 (3/27):** 인쇄업 전용 6개 컬럼

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| company_cd | INT | PK | |
| plant_cd | INT | PK | |
| po_no | VARCHAR(30) | PK | |
| po_sq | INT | PK | 발주순번 |
| work_name | VARCHAR(200) | | 작업명 |
| quantity | INT | DEFAULT 0 | 수량 |
| unit_price | BIGINT | DEFAULT 0 | 단가 |
| amt | BIGINT | DEFAULT 0 | 금액 |
| note | VARCHAR(500) | | 비고 |
| po_item_type | VARCHAR(30) | | 구분: 용지/원자재 등 (신규 3/27) |
| po_config_cd | VARCHAR(30) | | 구성 (신규 3/27) |
| po_work_cd | VARCHAR(30) | | 작업코드 (신규 3/27) |
| po_page_cnt | INT | | 페이지수 (신규 3/27) |
| po_print_front | INT | | 인쇄도수-전 (신규 3/27) |
| po_print_back | INT | | 인쇄도수-후 (신규 3/27) |
| + BaseEntity | | | audit 4컬럼 |

#### po_settle_mst (외주정산마스터) — 복합PK, 신규 테이블
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| company_cd | INT | PK | |
| plant_cd | INT | PK | |
| pos_no | VARCHAR(30) | PK | 정산번호 |
| po_no | VARCHAR(30) | | 발주번호 |
| order_no | VARCHAR(30) | | 주문번호 |
| partner_cd | VARCHAR(20) | | 거래처코드 |
| partner_nm | VARCHAR(100) | | 거래처명 |
| total_amt | BIGINT | DEFAULT 0 | 총금액 |
| status_cd | VARCHAR(20) | DEFAULT 'UNSETTLED' | 정산상태 |
| + BaseEntity | | | audit 4컬럼 |

#### po_settle_dtl (외주정산디테일) — 복합PK, 신규 테이블
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| company_cd | INT | PK | |
| plant_cd | INT | PK | |
| pos_no | VARCHAR(30) | PK | |
| pos_sq | INT | PK | 정산순번 |
| work_name | VARCHAR(200) | | 작업명(세부품목명) |
| vendor_name | VARCHAR(100) | | 업체명 |
| quantity | INT | DEFAULT 0 | 수량 |
| unit_price | BIGINT | DEFAULT 0 | 단가 |
| amt | BIGINT | DEFAULT 0 | 금액 |
| settle_status_cd | VARCHAR(20) | DEFAULT 'UNSETTLED' | 정산상태 |
| + BaseEntity | | | audit 4컬럼 |

### 4.7 목표관리 테이블

#### goal_mst (목표관리) — 복합PK (7컬럼)
> **변경:** part_goals + am_goals → goal_mst 단일 테이블로 통합

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| company_cd | INT | PK | 회사코드 |
| plant_cd | INT | PK | 공장코드 |
| plan_yy | VARCHAR(4) | PK | 계획연도 |
| plan_mm | VARCHAR(2) | PK | 계획월 |
| dept_cd | VARCHAR(10) | PK | 부서코드 |
| sales_emp_id | VARCHAR(20) | PK | 영업담당자ID |
| field_cd | VARCHAR(10) | PK | 필드구분코드 |
| goal_amt | BIGINT | | 목표금액 |
| actual_amt | BIGINT | | 실적금액 |
| note | VARCHAR(500) | | 비고 |
| + BaseEntity | | | audit 4컬럼 |

#### ~~part_goals, am_goals~~ — 삭제됨
> goal_mst 단일 테이블로 통합. field_cd로 구분.

---

## 5. API 설계

### 5.1 공통 응답 형식
```json
{
  "success": true,
  "data": { ... },
  "message": null,
  "timestamp": "2026-03-18T14:30:00"
}
```

**페이징 응답:**
```json
{
  "success": true,
  "data": {
    "content": [ ... ],
    "totalElements": 150,
    "totalPages": 15,
    "page": 0,
    "size": 10
  }
}
```

**에러 응답:**
```json
{
  "success": false,
  "data": null,
  "message": "주문을 찾을 수 없습니다.",
  "errorCode": "ORDER_NOT_FOUND",
  "timestamp": "2026-03-18T14:30:00"
}
```

### 5.2 인증 API

| Method | Endpoint | 설명 | 인증 |
|--------|----------|------|------|
| POST | `/api/auth/login` | 로그인 (사원번호 + 비밀번호 → JWT) | 불필요 |
| POST | `/api/auth/refresh` | Access Token 갱신 (Refresh Token 필요) | 불필요 |
| POST | `/api/auth/logout` | 로그아웃 (Refresh Token 무효화) | 필요 |
| GET | `/api/auth/me` | 현재 사용자 정보 조회 | 필요 |

### 5.3 정보관리 API

| Method | Endpoint | 설명 | 파라미터 |
|--------|----------|------|----------|
| GET | `/api/info/biz-owners` | 사업자 목록 | departmentId, keyword, page, size |
| GET | `/api/info/biz-owners/{id}` | 사업자 상세 | |
| POST | `/api/info/biz-owners` | 사업자 등록 | Body: BizOwnerCreateDto |
| PUT | `/api/info/biz-owners/{id}` | 사업자 수정 | Body: BizOwnerUpdateDto |
| GET | `/api/info/customers` | 고객 목록 | departmentId, keyword, page, size |
| GET | `/api/info/customers/{id}` | 고객 상세 | |
| POST | `/api/info/customers` | 고객 등록 | Body: CustomerCreateDto |
| PUT | `/api/info/customers/{id}` | 고객 수정 | |
| GET | `/api/info/customers/search` | 고객 검색 (자동완성) | keyword (최소 2자) |
| GET | `/api/info/part-goals` | 파트 목표 조회 | year, month |
| PUT | `/api/info/part-goals` | 파트 목표 입력/수정 | Body: List<PartGoalDto> |
| GET | `/api/info/am-goals` | AM 목표 조회 | year, month |
| PUT | `/api/info/am-goals` | AM 목표 입력/수정 | Body: List<AmGoalDto> |

### 5.4 주문관리 API

| Method | Endpoint | 설명 | 파라미터 |
|--------|----------|------|----------|
| GET | `/api/orders` | 주문목록 | startDate, endDate, status, workType, keyword, page, size |
| GET | `/api/orders/{id}` | 주문 상세 (주문정보 + 작업정보 + 품목) | |
| POST | `/api/orders` | 주문 등록 | Body: OrderCreateDto (주문+작업+품목 일괄) |
| PUT | `/api/orders/{id}` | 주문 수정 | Body: OrderUpdateDto |
| PATCH | `/api/orders/{id}/status` | 주문 상태 변경 | Body: { status } |
| GET | `/api/orders/export` | 주문목록 엑셀 다운로드 | 동일 필터 파라미터 |

### 5.5 매출관리 API

| Method | Endpoint | 설명 | 파라미터 |
|--------|----------|------|----------|
| GET | `/api/sales` | 매출목록 | startDate, endDate, departmentId, keyword, page, size |
| POST | `/api/sales` | 매출 등록 | Body: SalesCreateDto |
| PATCH | `/api/sales/{id}/confirm` | 매출 확정 | |
| GET | `/api/sales/export` | 매출 엑셀 | |
| GET | `/api/sales/card` | 카드매출 목록 | startDate, endDate, departmentId, keyword |
| GET | `/api/sales/card/export` | 카드매출 엑셀 | |
| GET | `/api/sales/pre` | 선매출 목록 | startDate, endDate, departmentId, keyword |
| POST | `/api/sales/pre` | 선매출 등록 | Body: PreSalesCreateDto |
| GET | `/api/sales/pre/export` | 선매출 엑셀 | |
| GET | `/api/sales/untact` | 비대면주문 목록 | departmentId, startDate, endDate, keyword |
| POST | `/api/sales/untact` | 비대면주문 등록 | Body: UntactOrderCreateDto |
| POST | `/api/sales/untact/payment` | 비대면결제 등록 | Body: { orderIds[] } |
| GET | `/api/sales/untact/settlement` | 비대면정산 목록 | branch, startDate, endDate, keyword |
| GET | `/api/sales/untact/settlement/export` | 비대면정산 엑셀 | |
| GET | `/api/sales/untact/export` | 비대면주문 엑셀 | |

### 5.6 세금계산서 API

| Method | Endpoint | 설명 | 파라미터 |
|--------|----------|------|----------|
| GET | `/api/tax/candidates` | 발행 대상 주문 목록 | |
| POST | `/api/tax/issue` | 세금계산서 발행 (더존 연동) | Body: { orderIds[] } |
| GET | `/api/tax/invoices` | 발행 목록 | departmentId, startDate, endDate, keyword |
| GET | `/api/tax/invoices/export` | 발행 목록 엑셀 | |

### 5.7 매입마감 API

| Method | Endpoint | 설명 | 파라미터 |
|--------|----------|------|----------|
| GET | `/api/purchase/outsourcing-po` | 외주발주 목록 | departmentId, status, startDate, endDate, keyword |
| POST | `/api/purchase/outsourcing-po` | 외주발주 등록 | Body: OutsourcingPoCreateDto |
| PATCH | `/api/purchase/outsourcing-po/{id}/confirm` | 발주 확정 | |
| PATCH | `/api/purchase/outsourcing-po/{id}/settlement-status` | 정산여부 변경 | Body: { status } |
| GET | `/api/purchase/outsourcing-po/{id}/document` | 발주서 PDF 출력 | |
| GET | `/api/purchase/outsourcing-settlement` | 외주정산 목록 | vendor, settlementStatus, keyword |
| POST | `/api/purchase/outsourcing-settlement` | 외주정산 생성 | Body: { settlementIds[] } |
| POST | `/api/purchase/outsourcing-settlement/import` | 엑셀 업로드 | Multipart file |
| GET | `/api/purchase/outsourcing-settlement/export` | 엑셀 다운로드 | |
| POST | `/api/purchase/outsourcing-settlement/sync-gitgo` | 깃고 전자결재 연동 | Body: { settlementIds[] } |
| GET | `/api/purchase/outsourcing-settlement/status` | 외주정산 현황 | |

### 5.8 통계 API

| Method | Endpoint | 설명 | 파라미터 |
|--------|----------|------|----------|
| GET | `/api/stats/team-forecast` | 본부/팀 예상매출 | year, month |
| GET | `/api/stats/team-goal-actual` | 본부/팀 매출목표 및 실적 | year |
| GET | `/api/stats/part-goal-actual-yoy` | 파트별 전년대비 | year |
| GET | `/api/stats/am-goal-actual-yoy` | AM 전년대비 | year |
| GET | `/api/stats/item-performance` | 품목별 실적 | startDate, endDate |
| GET | `/api/stats/vendor-margin` | 거래처별 외주 마진율 | startDate, endDate |
| GET | `/api/stats/order-margin` | 주문건별 외주 마진율 | startDate, endDate |

### 5.9 대시보드 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/dashboard/sales-trend` | 최근 12개월 매출 추이 |

---

## 6. 화면별 상세 기획

### 6.1 공통 레이아웃

#### Header (GNB)
- **Desktop**: 가로 네비게이션 바 (로고 | 정보관리 | 주문관리 | 매출관리 | 매입마감 | 통계 | 사용자정보)
- **Mobile**: 햄버거 메뉴 → 슬라이드 드로어
- 각 메뉴 호버 시 드롭다운 서브메뉴 표시
- 우측에 "부서 / 사용자명" 표시 + 로그아웃 버튼

#### Breadcrumb
- 상단 파란색 바에 현재 위치 표시 (예: "매출관리 > 매출목록")

#### 반응형 기준
- Desktop: 1200px 이상 (전체 레이아웃)
- Tablet: 768px~1199px (테이블 가로 스크롤)
- Mobile: 767px 이하 (카드형 레이아웃 전환)

### 6.2 로그인 페이지 (LoginPage)
- 사원번호 입력
- 비밀번호 입력
- 로그인 버튼
- 사원번호 기억하기 (체크박스)
- 비밀번호 분실 링크

### 6.3 홈 대시보드 (DashboardPage)
- **매출 추이 차트**: 최근 12개월 매출 라인 차트 + 추세선(점선)
- **프로세스 보기 버튼**: 클릭 시 업무 흐름도 페이지 이동
- Y축: 금액(만원 단위), X축: 월(MM)

### 6.4 정보관리

#### 사업자관리 (BizOwnerPage)
- **조회전용** (ERP Oracle에서 직접 조회, 신규등록 버튼 없음)
- **검색 영역**: 공장 셀렉트박스(1000:TPS / 2000:GRP / 3000:PM) + 키워드 입력(회사명, 사업자번호, 업태, 종목) + 조회 버튼
  - 공장 선택 시 ERP 거래처정보의 `DISCH_CD` 값으로 필터링
- **결과 테이블**: #, 회사명, 사업자번호, 업태, 종목, 주소, 더존코드
- **행 클릭**: 사업자 상세 모달 (읽기전용)
- **변경사항 (2026-04-06)**: 파트 셀렉트박스 → 공장 셀렉트박스로 변경, 신규등록 버튼 삭제, ERP Oracle 직접 조회로 전환

#### 고객관리 (CustomerPage) -- 미구현
- **조회전용** (ERP Oracle에서 직접 조회)
- 사업자관리와 동일하게 공장별로 조회
- **검색 영역**: 공장 셀렉트박스 + 키워드 입력(고객명, 회사명) + 조회 버튼
- **결과 테이블**: #, 구분, 사업자, 회사명, 고객명, 거래지점, 연락처, 등록자, 등록일
- **행 클릭**: 고객 상세 모달 (읽기전용)
- **구현 상태**: 미구현 (화면 개발 예정)

#### 목표입력 (GoalPage)
- 샘플사이트 참조: https://anhyunmo31-maker.github.io/sm_module_sample/info/p_am_goal.html
- 연도/월 선택
- 파트별 / AM별 목표 금액 입력 그리드
- 저장 버튼

#### 파트 목표 입력 (PartGoalPage)
- 연도/월 선택
- 파트별 목표 금액 입력 그리드
- 저장 버튼

#### 어카운트매니저 목표 입력 (AmGoalPage)
- 연도/월 선택
- AM별 목표 금액 입력 그리드
- 저장 버튼

### 6.5 주문관리

#### 주문목록 (OrderListPage)
- **검색 영역**:
  - 기간 선택 (DateRangePicker)
  - 키워드 검색 (주문번호, 고객명, 회사명, 접수자, 담당지점)
  - 주문상태 필터 (전체/주문접수/주문확정/발주완료/발송완료/매출대기/매출확정)
  - 작업처 필터 (전체/외주/패키지/P&D/구매/POD)
  - 엑셀다운로드 버튼
- **결과 테이블**: 체크박스, #, 주문번호/세부품목명, 회사명, 고객명, 영업부서, 접수자, 작업처, 금액, 상태
  - 주문번호의 제목은 세부품목명 (주문명이 아닌 세부품목명으로 표시)
- **SM모듈 작성 주문 + ERP 주문 모두 표시**
- **체크박스로 N건 선택 → 매출등록 기능**: 주문번호-시퀀스 N개를 하나의 매출로 묶음
- **매출등록 모달**: 결제명, 거래처, 총주문금액, 선매출차감, 최종결제금액, 결제수단(카드/현금)
- **행 클릭**: 주문 상세 페이지 이동
- **변경사항 (2026-04-06)**: 상태필터 세분화, 체크박스 매출등록 기능 추가, 세부품목명 표시로 변경

#### 주문등록 (OrderCreatePage)
**Step 1 - 주문정보 탭**:
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| 주문명 | 텍스트 | * | 주문 제목 |
| 접수자 | 텍스트 (비활성) | * | 로그인 사용자 자동 설정 |
| 완료요청일시 | DateTimePicker | * | |
| 접수일자 | DatePicker | * | 오늘 날짜 기본값 |
| 고객명 | 검색 팝업 | * | 고객 검색 후 선택 |
| 회사명 | 검색 팝업 | * | 회사 검색 후 선택 |
| 별도 사업본부 매출 | 셀렉트 | | 그래픽스/PM/국내/해외 |
| 영업담당자 | 검색 팝업 | * | 사원 검색 후 선택, 기본값: 로그인 사용자 |
| 영업부서 | 텍스트 (비활성) | * | 영업담당자 선택 시 부서 자동반영 (구 접수지점) |
| 세무구분 | 셀렉트 | | ERP 기준정보 쿼리로 조회 |
| 특이사항 | 텍스트에어리어 | | |

- **주문번호 자동생성**: `GSM{YYYY}{MMDD}{시퀀스5자리}` (예: GSM2026040600001)
- **주문확정/취소 버튼**: 주문확정 후 확정취소 가능
- **주문확정 후에도 매출완료 이전까지 수정 가능 필드**: 회사명, 고객명, 별도사업, 세무구분, 영업담당자
- **외주발주서 팝업**: 주문등록 화면에서 외주발주서 팝업으로 조회 가능 (현재 미구현)
- **외주발주처리 주의**: 이 메뉴에서 외주발주처리를 직접 수행하면 안 됨 (외주발주목록에서 처리)
- **알려진 버그 (2026-04-06)**: 주문수정 시 success 응답이 떨어지지만 실제 데이터가 수정되지 않는 버그 존재 (수정 필요)
- **변경사항 (2026-04-06)**: 접수지점 → 영업부서로 명명변경, 영업담당자 기본값 설정, 세무구분 ERP 연동, 주문번호 형식 변경

**Step 2 - 작업정보 탭**:
- **작업 탭**: 상단에 "+ 작업 추가" 버튼, 작업 탭 목록(클릭으로 전환, X로 삭제)
- **작업사양복사 / 작업복사 기능** 추가
- **작업 상세**:
  - 작업처 선택 (외주/패키지/P&D팀/직접구매)
  - 제작부수(B) 입력
  - 작업명 입력
  - 파일첨부 (파일 선택 버튼)
  - 기타사항 (텍스트에어리어)
- **품목 그리드**:
  - 품목행 추가 / 품목 초기화 / 외주발주서 / P&D발주서 버튼
  - 테이블: 구분(셀렉트: 용지/인쇄/후가공/제본/구매), 구성(ERP 쿼리조회/셀렉트박스), 세부품목명(작업명만 조회, 작업처와 제작부수 사이 위치), 비고, 수량(a), 단가(b), 소계(a×b 자동계산), 삭제
  - **변경사항 (2026-04-06)**: 구분에 "구매" 추가, 구성을 ERP 셀렉트박스로 변경, DTL의 작업명 → 세부품목명으로 명명변경 (위치: 작업처와 제작부수 사이), 작업명은 작업명만 조회되도록 수정 (현재 용지/품목 등 다 조회됨 - PPT 참조)
- **금액 요약**:
  - 작업금액(C=A×B)
  - 배송비(E)
  - 디자인비(F)
  - 할인(H)
  - **결제금액(G-H)** (빨간색 강조)
- 하단: 이전 / 등록 버튼

### 6.6 매출관리

#### 매출목록 (SalesListPage)
- **조회전용 화면**
- **검색 영역**: 기간(기간 라벨 + DateRangePicker) + 영업담당자 + 거래처 + 매출번호 + 주문번호 + 세부품목명 검색 + 검색 버튼
- **우측 상단**: 엑셀다운로드 버튼
- **테이블**: #, 매출번호, 주문번호/세부품목명, 회사명, 고객명, 거래처명, 거래처담당자, 총금액(합산), 금액, 매출타입, 매출확정(상태표시), 이력(보기 버튼)
  - 매출번호 1:주문번호 N 관계 → 금액과 상태 사이에 총금액 컬럼 배치
- **변경사항 (2026-04-06)**: 조회전용으로 변경, 조회조건 대폭 추가, 거래처명/거래처담당자/매출타입/총금액 컬럼 추가

#### 카드매출목록 (CardSalesListPage) -- 미구현
- sales_mst에서 pay_type이 카드인 것만 필터링하여 표시
- **검색 영역**: 기간 + 부서 필터 + 키워드 + 검색
- **우측 상단**: 엑셀다운로드
- **테이블**: #, 지점명, 주문번호/제목, 매출일자, 카드사, 카드번호, 승인번호, 금액, 매출시간
- **구현 상태**: 미구현 (화면 개발 예정)

#### 선매출목록 (PreSalesListPage) -- 미구현
- **검색 영역**: 기간 + 부서 필터 + 키워드 + 검색
- **우측 상단**: 선매출 등록 버튼 + 엑셀다운로드
- **테이블**: #, 선매출번호, 등록일자, 부서명, 부서담당자, 거래처명, 사업자번호, 거래처담당자, 금액, 차감주문번호, 비고, 결제구분
- **구현 상태**: 미구현 (화면 개발 예정)

#### 선매출입력 (PreSalesInputPage) -- 미구현
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| 영업부서 | 셀렉트 | * | 그래픽스사업본부/PM/국내 |
| 등록자명 | 텍스트 (비활성) | * | 로그인 사용자 |
| 영업거래처 | 검색 팝업 | * | |
| 영업담당자 | 검색 팝업 | * | |
| 선매출액 | 숫자 입력 | * | |
| 과세구분 | 셀렉트 | * | 과세/영세/면세 |
| 주문검색 | 버튼 | | "주문가지고오기" 버튼 |
| 비고 | 텍스트에어리어 | | |
- 상단 저장 버튼
- **확인 필요 사항**: 계산서 기반 선매출등록인지, 게시판처럼 운영하는 방식인지 체크 필요
- **선매출 프로세스 상세 확인 필요**
- **구현 상태**: 미구현 (화면 개발 예정)

#### 비대면주문 등록 (UntactOrderCreatePage) -- 미구현
- 주문에서 N개를 선택 → 비대면결제등록
- 비대면결제번호 생성 → 비대면주문목록에 표출
- 이메일 결제기능 지원
- **테이블**: #, 지점명, 주문번호/제목, 회사명, 고객명, 주문금액, 미결제금액, 체크박스
- **우측 상단**: "비대면결제 등록" 버튼 (체크된 주문 일괄 등록)
- **구현 상태**: 미구현 (화면 개발 예정)

#### 비대면주문 목록 (UntactOrderListPage) -- 미구현
- **검색 영역**: 영업담당부서 셀렉트 + 기간 + 키워드 + 검색
- **우측 상단**: 엑셀다운로드
- **테이블**: 비대면결제번호, 주문번호, 등록일자, 영업담당부서, 영업담당자, 거래처명, 고객명, 금액, 작업명, 결제여부, 결제코드, 보기(버튼)
- **구현 상태**: 미구현 (화면 개발 예정)

#### 비대면 정산 (UntactSettlementPage) -- 미구현
- 비대면주문 결제 중 실제 결제 완료 건만 조회
- **검색 영역**: 거래지점 셀렉트 + 기간 + 키워드 + 검색
- **우측 상단**: 엑셀다운로드
- **테이블**: 가맹점ID, 지점/파트, 주문ID, 승인날짜시간, 승인번호, 결제수단, 결제금액, 공급가, 부가세, 결제수수료, 환불수수료, 지급금액, 지급일자
- **하단 합계행**: 총합계 (N건), 각 금액 컬럼 합계 표시
- **구현 상태**: 미구현 (화면 개발 예정)

#### 세금계산서발행 (TaxIssuePage) -- 미구현
- 주문 N개 선택 → 세금계산서 발행
- ERP로 전표 전달 기능 필요
- **테이블**: #, 지점명, 주문번호/제목, 회사명, 고객명, 주문금액, 미결제금액, 체크박스
- **우측 상단**: "세금계산서발행" 버튼 (체크된 주문 → 더존 연동 발행)
- **구현 상태**: 미구현 (화면 개발 예정)

#### 세금계산서 발행목록 (TaxIssueListPage) -- 미구현
- **검색 영역**: 부서 셀렉트(전체보기/강남파트/여의도파트/서소문파트) + 기간 + 키워드(회사명, 공급가액, 세액, 담당자명) + 검색
- **우측 상단**: 엑셀다운로드
- **테이블**: 영업부서, 발행일시, 발행번호, 사업자번호, 회사명, 담당자, 합계액, 공급가액, 세액, 상태, 상태보기
- **하단 합계행**: 총합계 (N건), 합계액/공급가액/세액 합계
- **구현 상태**: 미구현 (화면 개발 예정)

### 6.7 매입마감

#### 외주발주목록 (OutsourcingPoPage)
- **검색 영역**: 영업부서 셀렉트(DB조회) + 상태 셀렉트(접수대기/미정산/정산/매입완료) + 외주담당 + 기간 + 키워드(회사명, 작업제목, 주문번호) + 검색
- **외주발주등록 버튼 삭제** → 로우 클릭 시 발주상세(PDF형태) 보기
  - 주문등록에서 작성한 외주발주서 창이 그대로 표시
- **주문번호-시퀀스 하나당 발주번호 하나**
- **테이블**: #, 접수일, 영업부서, 세부품목명(클릭→발주상세PDF), 회사명, 수주금액, 영업담당자, 외주금액, 외주담당, 상태(접수대기/미정산/정산/매입완료 데이터 표시), 납품일, 출력/파일(발주서 버튼)
  - 정산여부 컬럼 삭제 (상태 컬럼으로 통합)
  - 상태는 셀렉트박스가 아닌 데이터 표시로 변경
- **리스트에서 외주발주 확정/취소 가능**
- **발주 및 실적입력 동시 가능하도록 설계**
- **변경사항 (2026-04-06)**: 외주발주등록 버튼 삭제, 정산여부 컬럼 삭제, 상태 데이터 표시로 변경, 확정/취소 기능 추가

#### 외주정산등록 (OutsourcingSettlementPage)
- **검색 영역**: 기간 + 거래처명 셀렉트 + 정산여부 셀렉트(전체/미정산/정산완료) + 키워드(주문번호/발주번호/거래처명) + 조회 + 엑셀업로드 + 엑셀다운로드
- **선택삭제 기능 삭제**
- **테이블**: 전체선택 체크박스, 주문번호, 발주번호, 주문명, 세부품목명(구 작업명), 업체명, 수량, 단가, 금액, 정산여부
  - 주문명 → 세부품목명으로 변경, 주문번호 표시 추가, 업체명 컬럼 추가
- **발주번호 1:N 정산번호** 관계
- **하단 요약**: 선택 건수 / 합계 금액
- **N개 체크 → 외주정산생성 버튼 → 팝업** (Gitgo API 전달내용 확인)
- **정산확정/취소 버튼 필요**: 확정 대상만 정산생성 가능
- **비즈니스 룰**: 모든 품목에 금액이 기입되면 정산여부가 자동으로 "정산완료"로 변경. 미기입 건이 있으면 "미정산" 유지.
- **변경사항 (2026-04-06)**: 선택삭제 삭제, 정산확정/취소 기능 추가, 리스트 컬럼 변경, Gitgo 연동 팝업

#### 외주정산현황 (OutsourcingStatusPage) -- 미구현
- 기획 확정 후 구현 예정
- **구현 상태**: 미구현 (화면 개발 예정)

### 6.8 통계 (화면 추후 프로토타입 생성 예정)

모든 통계 화면은 프로토타입 생성 후 구현하며, 아래 화면 목록과 기본 방향만 정의한다. 각 통계에 엑셀다운로드 기능이 필요할 수 있다.

| # | 화면명 | 기본 방향 | 구현 상태 |
|---|--------|-----------|-----------|
| 1 | 본부 및 팀 예상매출 | 접수중/진행중 주문 기반 예상 매출 집계 | 미구현 (프로토타입 예정) |
| 2 | 본부 및 팀 매출목표 및 실적 | 목표 금액 vs 실제 매출 비교 (연간) | 미구현 (프로토타입 예정) |
| 3 | 팀/파트별 매출목표 및 실적(전년대비) | 전년 동기 대비 목표 달성율 | 미구현 (프로토타입 예정) |
| 4 | AM 매출목표 및 실적(전년대비) | 어카운트매니저별 전년 비교 | 미구현 (프로토타입 예정) |
| 5 | 품목별 실적조회 | 용지/인쇄/후가공/제본별 매출 실적 | 미구현 (프로토타입 예정) |
| 6 | 거래처별 외주 마진율 | (수주금액-외주금액)/수주금액 x 100 | 미구현 (프로토타입 예정) |
| 7 | 주문건별 외주 마진율 | 개별 주문의 마진율 분석 | 미구현 (프로토타입 예정) |

---

## 7. 비즈니스 프로세스 흐름

### 7.1 외주/패키지/P&D파트 프로세스
```
주문등록 → 외주발주등록 → 발주서 작성 후 확정처리 → 발주확정
    → 외주정산등록 → 외주정산생성 → 매입정산(전자결재, 깃고 연동)
    → 매출등록 → 세금계산서발행(더존 연동)
```

### 7.2 구매 프로세스
```
주문등록 → 발주서 작성 후 확정처리 (외주발주서와 동일 양식)
    → 구매정산등록 (외주정산등록과 프로세스/화면 동일)
    → 매입정산(전자결재, 깃고 연동)
    → 매출등록 → 세금계산서발행(더존 연동)
```

### 7.3 내부생산(POD, 센터) 프로세스
```
주문목록 → 발송완료(제품생산완료)건만 매출등록 가능
    → 매출등록 → 세금계산서발행(더존 연동)
```

### 7.4 ERP 부분외주건 처리
- ERP에서 작성된 외주건이 SM Module로 연동
- ERP 부분외주 후 취소 케이스 처리 로직 필요
- SM Module DB 별도 관리 여부 확정 필요

### 7.5 주문 상태 전이 (변경)
```
주문접수(PENDING) → 주문확정(CONFIRMED) → 발주완료(PO_COMPLETE) → 발송완료(SHIP_COMPLETE) → 매출대기(SALES_WAIT) → 매출확정(SALES_CONFIRMED)
```

**상태 설명:**
| 상태 | 코드 | 설명 |
|------|------|------|
| 주문접수 | PENDING | 주문을 작성한 상태 |
| 주문확정 | CONFIRMED | 주문을 미정→확정으로 상태값 돌린 상태 |
| 발주완료 | PO_COMPLETE | 외주발주입력이 된 상태 (주문등록에서 작업사양 수정 불가) |
| 발송완료 | SHIP_COMPLETE | ERP에서 제품생성된 상태, SM모듈에서 구매확정시 →자동 발송완료 |
| 매출대기 | SALES_WAIT | 비대면결제등록시 →이메일만 발송한 상태 (결제승인 전) |
| 매출확정 | SALES_CONFIRMED | 비대면결제 승인 외에 모든 매출등록 상태 |

---

## 8. 외부 시스템 연동

> **Updated:** 2026-04-07 — Oracle DB 직접 조회 방식으로 구현 확정. REST API 방식이 아닌 JDBC 직접 연결.

### 8.0 Oracle ERP 연동 아키텍처 (확정)

**접속 정보:**
- Oracle DB: `jdbc:oracle:thin:@{HOST}:{PORT}/{SID}` (COMET 계정)
- 조건부 로딩: `oracle.enabled=true` 설정 시에만 활성화, 미설정 시 MySQL Fallback
- Connection Pool: HikariCP (max 5, min idle 2, timeout 30s)

**구현 구조:**
```
[SM Module]
  ├── OracleDataSourceConfig (@ConditionalOnProperty "oracle.enabled")
  │   ├── oracleDataSource (HikariDataSource)
  │   └── oracleJdbcTemplate (JdbcTemplate)
  ├── ErpLookupController (/api/lookup/*) — 마스터 데이터 조회 API
  ├── Repositories (Oracle 직접 쿼리)
  │   ├── ErpPartnerRepository   — CI_PARTNER_MST
  │   ├── ErpEmployeeRepository  — HR_EMP_MST
  │   ├── ErpItemRepository      — CI_ITEM
  │   ├── ErpDepartmentRepository — VW_MA_DEPT_MST
  │   ├── ErpOrderRepository     — SD_ORDER_MST/DTL_X20329
  │   ├── ErpBillingRepository   — SD_BILL_MST/DTL
  │   └── ErpDeliveryRepository  — SD_DLV_MST/DTL
  ├── Services (동기화/쓰기)
  │   ├── ErpMasterSyncService   — Oracle→MySQL 마스터 동기화
  │   ├── ErpTransactionSyncService — 배송상태 동기화
  │   └── ErpOrderWriteService   — MySQL→Oracle 주문/발주 등록
  └── Schedulers
      ├── ErpMasterSyncScheduler   — 매일 02:00 (사원/부서)
      └── ErpTransactionSyncScheduler — 1시간 주기 (배송상태)
```

### 8.1 Oracle 테이블 매핑 (확정)

#### 마스터 데이터 (조회전용, Read)
| Oracle 테이블 | 용도 | 주요 컬럼 | SM 모듈 연동 | 구현 상태 |
|--------------|------|----------|-------------|----------|
| `CI_PARTNER_MST` | 거래처/사업자 | PARTNER_CD, PARTNER_NM, BIZR_NO, CEO_NM, BIZTP_NM, BIZC_NM, BASE_ADDR | 사업자관리, 주문등록 거래처 조회 | **구현됨** |
| `HR_EMP_MST` | 사원 | EMP_NO, KOR_NM, DEPT_CD | 영업담당자/접수자 조회 | **구현됨** |
| `CI_ITEM` | 품목 | ITEM_CD, ITEM_NM, ITEM_SPEC_DC, STD_UNIT_CD | 작업정보 품목 조회 | **구현됨** |
| `VW_MA_DEPT_MST` | 부서(뷰) | DEPT_CD, DEPT_NM, UP_DEPT_NM | 영업부서 조회 | **구현됨** |

**공통 필터:** COMPANY_CD = '1000', USE_YN = 'Y' (마스터), HLOF_FG_CD = '1' (사원)

#### 트랜잭션 데이터 (조회+쓰기, Read+Write)
| Oracle 테이블 | 용도 | 방향 | SM 모듈 연동 | 구현 상태 |
|--------------|------|------|-------------|----------|
| `SD_ORDER_MST_X20329` | 주문 마스터 | R+W | 주문목록 조회, SM→ERP 주문등록 | **구현됨** |
| `SD_ORDER_DTL_X20329` | 주문 디테일 | R+W | 주문상세 조회, SM→ERP 주문등록 | **구현됨** |
| `SD_BILL_MST` | 매출(청구) 마스터 | R | 매출목록 조회 | **구현됨** |
| `SD_BILL_DTL` | 매출 디테일 | R | 매출상세 | **구현됨** |
| `SD_DLV_MST` / `SD_DLV_DTL` | 출고/배송 | R | 발송완료 상태 동기화 (1시간 주기) | **구현됨** |
| `PP_PURORDER_MST_X20329` | 구매발주 | W | SM→ERP 외주발주 등록 | **구현됨** |

#### ERP 번호 생성 규칙
| 번호 | 형식 | 예시 | 대상 테이블 |
|------|------|------|-----------|
| ERP 주문번호 | `GOR{YYYYMMDD}{seq4}` | GOR202604060001 | SD_ORDER_MST_X20329 |
| ERP 발주번호 | `GPO{YYYYMMDD}{seq4}` | GPO202604060001 | PP_PURORDER_MST_X20329 |

#### WRK_FG (작업구분) 코드 매핑
| ERP WRK_FG | SM 주문구분 | 설명 |
|-----------|-----------|------|
| 100 | PENDING | 접수대기 |
| 200 / 202 | CONFIRMED | 확정 (202=국내영업, 디폴트) |
| 300 | SHIPPED | 발송완료 |
| 400 | COMPLETED / 품질관리(사고분) | 완료 |
| 401 | 샘플/가제본 | |
| 900 | CANCELLED | 취소 |

### 8.2 기능별 Oracle 연동 방식 (확정)

#### 사업자관리 — CI_PARTNER_MST + MA_PARTNERSA_INFO 조회 (확정)
| 항목 | 확정 내용 |
|------|----------|
| **Repository** | ErpPartnerRepository (oracleJdbcTemplate) |
| **조회 API** | GET /api/lookup/partners?keyword=&plantCd= |
| **필터** | USE_YN='Y', 키워드(PARTNER_CD/PARTNER_NM LIKE) |
| **공장필터 (확정)** | `MA_PARTNERSA_INFO` 테이블의 `DISCH_CD` 컬럼으로 필터링 |
| | CI_PARTNER_MST에는 DISCH_CD 없음 → MA_PARTNERSA_INFO JOIN 필요 |
| | `MA_PARTNERSA_INFO.DISCH_CD` 값: 00(공통 9개), 1000(TPS 14개), 2000(GRP 23개), 3000(PM 12개) |
| | JOIN 조건: `MA_PARTNERSA_INFO a JOIN CI_PARTNER_MST p ON a.PARTNER_CD = p.PARTNER_CD WHERE a.COMPANY_CD='1000' AND a.DISCH_CD = ?` |
| **공장코드 마스터** | `MA_DISTC_MST` 테이블 (DISCH_CD, DISCH_NM) — 현재 데이터 비어있음, 코드만 사용 |
| **동기화** | Oracle→MySQL BusinessOwner 캐시 (ErpMasterSyncService, 현재 비활성) |

#### 고객관리 — CI_PARTNER_MST 동일 테이블 (확정)
| 항목 | 확정 내용 |
|------|----------|
| **데이터소스** | `CI_PARTNER_MST` (거래처=고객 동일 테이블, 별도 고객 테이블 없음) |
| **구현 방안** | ErpPartnerRepository 재사용, CEO_NM을 고객명/대표자명으로 활용 |
| **공장필터** | 사업자관리와 동일하게 MA_PARTNERSA_INFO.DISCH_CD JOIN |
| **확정** | 고객과 거래처는 동일 테이블 (CI_PARTNER_MST), PARTNER_FG_CD로 구분 가능 (1:일반 28882건, 2:436건, 5:435건 등) |

#### 주문관리 — SD_ORDER_MST/DTL_X20329 양방향
| 항목 | 확정 내용 |
|------|----------|
| **조회** | ErpOrderRepository.searchOrders() — 복합 JOIN 쿼리 (CI_PARTNER_MST, VW_MA_DEPT_MST, HR_EMP_MST) |
| **SM→ERP 등록** | ErpOrderWriteService.createOrderInErp() → GOR 번호 생성 |
| **상태 변경** | ErpOrderWriteService.changeStatusInOracle() → WRK_FG 업데이트 |
| **동기화** | 비활성 (직접 조회 전환으로 syncOrders 스케줄러 OFF) |

#### 매출관리 — SD_BILL_MST 직접 조회 (확정)
| 항목 | 확정 내용 |
|------|----------|
| **조회** | ErpBillingRepository.searchBillings() — 파트너명 JOIN, 주문번호 JOIN |
| **매핑** | BILLDOC_NO→salesNo, BILL_DT→salesDt, SPLY_AMT→공급가, TAX_AMT→세액, TRAN_AMT→총액 |
| **카드매출 (확정)** | SD_BILL_MST에 카드 구분 전용 컬럼 **없음**. BILL_TP(청구유형: IV100/IVR10/0), BILL_FG_CD(1:202건, 2:74건)로 분류 가능하나 카드 여부 직접 구분 불가 → **sales_mst.pay_type='CARD' 필터 방식 확정** |
| **세금계산서 (확정)** | SD_BILL_MST.TAX_BILL_ISSUE_FG (세금계산서발행구분: 대부분 NULL, 3:16건). 전자세금계산서는 `FI_ETAX_MST` 테이블 별도 관리 |
| **선매출/비대면** | ERP 매핑 없음 → **SM 자체 MySQL 관리 확정** |
| **SD_BILL_DTL** | DISCH_CD 컬럼 존재 (사업장별 매출 필터 가능), SALESORGN_CD(영업조직), SODOC_NO(주문번호) |

#### 매입마감 — PP_PURORDER + PP_INVOICE (확정)
| 항목 | 확정 내용 |
|------|----------|
| **SM→ERP 발주** | `PP_PURORDER_MST_X20329`에 쓰기 → GPO 번호 생성 (구현됨) |
| **발주 디테일** | `PP_PURORDER_DTL_X20329` — ORDDOC_NO/ORDDOC_SQ로 주문 참조, CONFIG_CD(구성), WRK_CD(작업코드) 컬럼 존재 |
| **외주정산→ERP (확정)** | `PP_INVOICE_MST` (구매송장) + `PP_INVOICE_DTL` 테이블 사용 |
| | PP_INVOICE_MST: INVC_NO(송장번호), PARTNER_CD, PUR_TRAN_AMT(매입액), PO_AMT, VAT_AMT, ATHZ_ST_CD(결재상태) |
| | PP_INVOICE_DTL: PURDOC_NO(발주번호), ITEM_CD/NM, PUR_TRAN_AMT, PO_AMT — 발주→송장 연결 |
| | 현재 PP_INVOICE_MST 데이터 **0건** (아직 SM 모듈에서 송장 생성 안 함) |
| **전자결재** | PP_INVOICE_MST.ATHZ_ST_CD (결재상태 코드) → Gitgo 연동 시 이 필드 업데이트 |

#### 배송상태 — SD_DLV_MST 스케줄 동기화
| 항목 | 확정 내용 |
|------|----------|
| **동기화** | ErpTransactionSyncScheduler — 1시간 주기 |
| **조건** | ISS_ST='C' (출고완료) AND UPDATE_DTS >= 마지막 동기화 시점 |
| **처리** | OrderMst.statusCd → SHIP_COMPLETE 자동 변경 |

### 8.3 더존 연동 (세금계산서 발행) — 미구현
| 항목 | 내용 |
|------|------|
| **연동 방향** | SM Module → 더존 API (방식 미확정: REST API / DB 직접 / 파일 연동) |
| **트리거** | 세금계산서발행 화면에서 주문 N건 선택 → 발행 버튼 |
| **전송 데이터** | 사업자번호, 회사명, 담당자, 공급가액, 세액, 합계액, 발행일시 |
| **ERP 테이블 (확정)** | `FI_ETAX_MST` (전자세금계산서), `FI_ETAX_LIST` (발행목록), `FI_SC_TAXBILL_LIST` (세금계산서 목록) |
| | FI_ETAX_MST 컬럼: COMPANY_CD, DATA_FG, PARTNER_CD, PARTNER_BIZR_NO, JRNZ_TP_CD, DEPT_CD |
| | SD_BILL_MST.TAX_BILL_ISSUE_FG로 세금계산서 발행 여부 추적 |
| **참고** | sales_mst.tax_no 컬럼에 전자세금계산서번호 저장 예정 |
| **상태** | **미구현, 연동 방식 미확정** |

### 8.4 깃고 연동 (전자결재) — 미구현
| 항목 | 내용 |
|------|------|
| **연동 방향** | SM Module → 깃고 API |
| **트리거** | 외주정산등록에서 N건 체크 → 정산생성 버튼 → 팝업 → Gitgo 전달 |
| **전송 데이터** | 정산 내역(업체명, 금액, 주문번호, 발주번호 등) |
| **상태** | **미구현, API 상세 사양 미정** |

### 8.5 동기화 스케줄러 현황

| 스케줄러 | 주기 | 대상 | 상태 |
|---------|------|------|------|
| ErpMasterSyncScheduler | 매일 02:00 | 사원(HR_EMP_MST), 부서(VW_MA_DEPT_MST) → MySQL | **활성** |
| ErpMasterSyncScheduler | 매일 02:00 | 거래처(CI_PARTNER_MST), 품목(CI_ITEM) → MySQL | **비활성** (직접 조회 전환) |
| ErpTransactionSyncScheduler | 1시간 | 배송(SD_DLV_MST) → OrderMst 상태 변경 | **활성** |
| ErpTransactionSyncScheduler | 1시간 | 주문(SD_ORDER_MST), 매출(SD_BILL_MST) → MySQL | **비활성** (직접 조회 전환) |

---

## 9. 인증 및 보안

### 9.1 JWT 인증 흐름
```
1. 로그인: POST /api/auth/login (사원번호 + 비밀번호)
   → Access Token (30분) + Refresh Token (7일) 발급

2. API 호출: Authorization: Bearer {accessToken}
   → JwtAuthenticationFilter에서 토큰 검증

3. 토큰 만료: 401 응답
   → 프론트에서 POST /api/auth/refresh (refreshToken)
   → 새 Access Token 발급

4. Refresh Token 만료: 재로그인 필요
```

### 9.2 보안 정책
| 항목 | 정책 |
|------|------|
| 비밀번호 | BCrypt 해시, 최소 8자, 영문+숫자+특수문자 |
| 외부 IP 접속 | SMS 인증 (선택적 설정) |
| 데이터 접근 제어 | 부서/파트 기반: 본인 파트 데이터만 조회 가능 |
| 관리자 권한 | ADMIN은 전체 데이터 접근 가능 |
| CORS | 허용 도메인 제한 (프론트엔드 도메인만 허용) |
| HTTPS | 운영 환경 필수 |
| API Rate Limiting | IP당 분당 최대 요청 수 제한 |
| XSS/CSRF | Spring Security 기본 방어 + CSP 헤더 |

---

## 10. 공통 기능

### 10.1 엑셀 다운로드
- 각 목록 화면에서 현재 검색 조건의 결과를 엑셀(.xlsx)로 다운로드
- 컬럼 헤더 = 테이블 헤더와 동일
- 날짜 포맷: YYYY-MM-DD
- 금액 포맷: 콤마 구분 (1,234,567)

### 10.2 엑셀 업로드
- 외주정산등록 화면에서 엑셀 파일 업로드 → 데이터 일괄 등록
- 업로드 전 유효성 검증 (필수 컬럼, 데이터 형식)
- 에러 행 표시 및 성공/실패 건수 알림

### 10.3 검색 팝업 (SearchPopup)
- 고객명, 회사명, 영업담당자 등 검색 → 선택하는 팝업 모달
- 키워드 입력 → 실시간 검색 결과 테이블 → 행 클릭으로 선택

### 10.4 번호 생성 규칙
| 번호 | 형식 | 예시 |
|------|------|------|
| 주문번호 | GSM{YYYY}{MMDD}{시퀀스5자리} | GSM2026040600001 |
| 비대면결제번호 | Un{YYMMDD}-{부서코드4자리}-{일련번호5자리} | Un260304-0042-00001 |
| 발주번호 | PO{YYMMDD}-{일련번호3자리} | PO260303-001 |
| 선매출번호 | PS{YYMMDD}-{일련번호5자리} | PS260303-00001 |

### 10.5 감사 로그 (Audit)
- 모든 엔티티는 BaseEntity 상속 (created_at, updated_at, created_id(VARCHAR(20)), updated_id(VARCHAR(20)))
- 주요 변경 사항 (상태 변경, 금액 변경 등) 이력 기록
- **변경:** created_by/updated_by (BIGINT FK) → created_id/updated_id (VARCHAR(20) 사번)

---

## 11. 화면 목록 총괄

> **Updated:** 2026-04-07 — 코드 분석 결과 반영. "미구현"으로 분류된 화면 대부분 FE 완성/BE 스텁 상태.

| # | 대메뉴 | 화면명 | URL 경로 | FE | BE | 구현 상태 | 잔여 작업 |
|---|--------|--------|----------|----|----|----------|----------|
| 1 | - | 로그인 | /login | O | O | **완료** | - |
| 2 | 홈 | 대시보드 | / | O | O | **완료** | - |
| 3 | 홈 | 프로세스 흐름도 | /process | O | O | **완료** | - |
| 4 | 정보관리 | 사업자관리 | /info/biz-owners | O | O | **완료** | DISCH_CD 공장필터 미연동 (Small) |
| 5 | 정보관리 | 고객관리 | /info/customers | O | O | **완료** | DISCH_CD 공장필터 미연동 (Small) |
| 6 | 정보관리 | 파트 목표 입력 | /info/part-goals | O | O | **완료** | - |
| 7 | 정보관리 | AM 목표 입력 | /info/am-goals | O | O | **완료** | - |
| 8 | 주문관리 | 주문목록 | /orders | O | O | **수정필요** | 체크박스 선택UI 없음, 하드코딩 통계 (Medium) |
| 9 | 주문관리 | 주문등록 | /orders/create | O | O | **완료** | 주문수정 미동작 버그 (Medium) |
| 10 | 매출관리 | 매출목록 | /sales | O | O | **수정필요** | DTO 타입 불안전(as any), 컬럼 정렬 (Small) |
| 11 | 매출관리 | 카드매출목록 | /sales/card | O | △ | **BE보완** | 카드전용필드 미반환 (Medium) |
| 12 | 매출관리 | 선매출목록 | /sales/pre | O | O | **완료** | 조회한정 |
| 13 | 매출관리 | 선매출입력 | /sales/pre/create | O | △ | **BE스텁** | update/delete 스텁, 거래처검색 빈응답 (Medium) |
| 14 | 매출관리 | 비대면주문 등록 | /sales/untact/create | O | △ | **BE스텁** | delete 스텁, 주문검색 빈응답 (Medium) |
| 15 | 매출관리 | 비대면주문 목록 | /sales/untact | O | O | **완료** | 조회한정 |
| 16 | 매출관리 | 비대면 정산 | /sales/untact/settlement | O | △ | **거의완료** | export 엔드포인트 누락 (Small) |
| 17 | 매출관리 | 세금계산서발행 | /sales/tax/issue | O | △ | **BE스텁+버그** | delete 스텁, 주문검색 빈응답, **필드명불일치** (Medium-Large) |
| 18 | 매출관리 | 세금계산서 발행목록 | /sales/tax | O | O | **완료** | 조회한정 |
| 19 | 매입마감 | 외주발주목록 | /purchase/outsourcing-po | O | O | **완료** | - |
| 20 | 매입마감 | 외주정산등록 | /purchase/outsourcing-settlement | O | O | **완료** | - |
| 21 | 매입마감 | 외주정산현황 | /purchase/outsourcing-status | O | O | **완료** | - |
| 22 | 통계 | 본부 및 팀 예상매출 | /stats/team-forecast | O | O | **완료** | - |
| 23 | 통계 | 본부 및 팀 매출목표 및 실적 | /stats/team-goal-actual | O | O | **완료** | - |
| 24 | 통계 | 팀/파트별 매출목표 및 실적(전년대비) | /stats/part-goal-yoy | O | O | **완료** | - |
| 25 | 통계 | AM 매출목표 및 실적(전년대비) | /stats/am-goal-yoy | O | O | **완료** | - |
| 26 | 통계 | 품목별 실적조회 | /stats/item-perf | O | O | **완료** | - |
| 27 | 통계 | 거래처별 외주 마진율 | /stats/vendor-margin | O | O | **완료** | - |
| 28 | 통계 | 주문건별 외주 마진율 | /stats/order-margin | O | O | **완료** | - |

**범례:** O=구현됨, △=스텁/부분구현, X=미구현

**총 28개 화면**: FE 전체 완성 | BE 완료 22개 + BE 스텁/부분 6개 | 추가 예정: 거래명세서, 견적서 (메뉴 위치 미정)

---

## 12. 보완 설계

### 12.1 감사 로그 (BaseEntity) 표준화

모든 엔티티는 아래 감사 컬럼을 포함한다. 앞선 테이블 정의에서 누락된 경우에도 동일하게 적용된다.
**변경:** created_by/updated_by (BIGINT FK→users) → created_id/updated_id (VARCHAR(20) 사번)

```
created_at  DATETIME      NOT NULL  -- 생성일시
updated_at  DATETIME  NOT NULL  -- 수정일시
created_by  BIGINT    FK → users  -- 생성자
updated_by  BIGINT    FK → users  -- 수정자
```

**적용 대상**: users, departments, business_owners, customers, orders, order_works, order_items, sales, card_sales, pre_sales, untact_orders, untact_settlements, tax_invoices, outsourcing_pos, outsourcing_settlements, part_goals, am_goals, 및 아래 추가 테이블 전체.

### 12.2 매출 이력 테이블 추가

매출 확정/취소 등 상태 변경 이력을 추적하기 위한 테이블:

#### sales_audit_logs (매출 이력)
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT | PK, AUTO_INCREMENT | |
| sales_id | BIGINT | FK → sales | 매출 |
| action | ENUM('CREATED','CONFIRMED','CANCELLED','MODIFIED') | NOT NULL | 변경 유형 |
| changed_field | VARCHAR(50) | | 변경된 필드 |
| old_value | TEXT | | 변경 전 값 |
| new_value | TEXT | | 변경 후 값 |
| changed_by | BIGINT | FK → users | 변경자 |
| changed_at | DATETIME | NOT NULL | 변경일시 |
| note | TEXT | | 비고 |

### 12.3 삭제 전략 (Soft Delete)

금융/회계 데이터의 무결성을 위해 **물리적 삭제를 금지**하고, 소프트 삭제를 사용한다.

모든 엔티티에 아래 컬럼을 추가한다:
```
deleted      BOOLEAN   DEFAULT FALSE  -- 삭제 여부
deleted_at   DATETIME  NULLABLE       -- 삭제일시
deleted_by   BIGINT    FK → users, NULLABLE  -- 삭제자
```

**엔티티별 삭제 정책**:
| 엔티티 | 삭제 가능 조건 |
|--------|---------------|
| orders | 주문상태가 PENDING인 경우에만 |
| sales | 매출확정 전에만 |
| pre_sales | 차감주문번호 미연결 상태에서만 |
| untact_orders | 결제 전(PENDING)에만 |
| outsourcing_pos | 발주확정 전에만 |
| outsourcing_settlements | 정산완료 전에만 |
| tax_invoices | 삭제 불가 (취소만 가능) |
| customers, business_owners | 연결된 주문 없을 때만 |

### 12.4 선매출 차감 이력 테이블 (1:N 관계 해결)

선매출 1건이 여러 주문에 부분 차감될 수 있도록 중간 테이블을 추가한다.

#### pre_sales_deductions (선매출 차감 이력)
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT | PK, AUTO_INCREMENT | |
| pre_sales_id | BIGINT | FK → pre_sales, NOT NULL | 선매출 |
| order_id | BIGINT | FK → orders, NOT NULL | 차감 대상 주문 |
| deducted_amount | BIGINT | NOT NULL | 차감 금액 |
| note | TEXT | | 비고 |
| created_at | DATETIME | NOT NULL | |
| created_by | BIGINT | FK → users | |

기존 `pre_sales` 테이블에서 `deduct_order_id` 컬럼을 제거하고, 아래 컬럼을 추가한다:
```
remaining_amount  BIGINT  NOT NULL  -- 잔여 금액 (amount - SUM(deductions))
```

### 12.5 파일 관리

#### file_attachments (파일 첨부)
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT | PK, AUTO_INCREMENT | |
| entity_type | VARCHAR(30) | NOT NULL | 연결 엔티티 유형 (ORDER_WORK 등) |
| entity_id | BIGINT | NOT NULL | 연결 엔티티 ID |
| original_name | VARCHAR(255) | NOT NULL | 원본 파일명 |
| stored_name | VARCHAR(255) | NOT NULL | 저장 파일명 (UUID) |
| file_path | VARCHAR(500) | NOT NULL | 저장 경로 |
| file_size | BIGINT | | 파일 크기 (bytes) |
| content_type | VARCHAR(100) | | MIME 타입 |
| created_at | DATETIME | NOT NULL | |
| created_by | BIGINT | FK → users | |

**파일 관리 정책**:
- 저장소: 로컬 파일시스템 (운영 환경에서 NAS 또는 S3 전환 가능)
- 최대 파일 크기: 50MB
- 허용 파일 유형: PDF, JPG, PNG, AI, PSD, ZIP, XLSX
- 파일명 저장: UUID 기반 (충돌 방지)

**파일 관리 API**:
| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/files/upload` | 파일 업로드 (Multipart) |
| GET | `/api/files/{id}/download` | 파일 다운로드 |
| DELETE | `/api/files/{id}` | 파일 삭제 |

기존 `order_works` 테이블에서 `file_path` 컬럼을 제거한다. 대신 `file_attachments` 테이블의 `entity_type='ORDER_WORK'`로 연결한다.

### 12.6 사용자/부서 관리 API

#### 사용자 관리 API (ADMIN 전용)
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/admin/users` | 사용자 목록 조회 |
| GET | `/api/admin/users/{id}` | 사용자 상세 |
| POST | `/api/admin/users` | 사용자 등록 |
| PUT | `/api/admin/users/{id}` | 사용자 수정 |
| PATCH | `/api/admin/users/{id}/status` | 사용자 상태 변경 (활성/비활성) |
| PATCH | `/api/admin/users/{id}/reset-password` | 비밀번호 초기화 |
| GET | `/api/admin/departments` | 부서 목록 조회 |
| POST | `/api/admin/departments` | 부서 등록 |
| PUT | `/api/admin/departments/{id}` | 부서 수정 |

비밀번호 분실 시 **관리자가 초기화** 하는 방식으로 운영한다 (자체 이메일 인프라 불필요).

### 12.7 Refresh Token 저장소

#### refresh_tokens (리프레시 토큰)
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT | PK, AUTO_INCREMENT | |
| user_id | BIGINT | FK → users, NOT NULL | 사용자 |
| token_hash | VARCHAR(255) | NOT NULL | 토큰 해시 |
| expires_at | DATETIME | NOT NULL | 만료일시 |
| revoked | BOOLEAN | DEFAULT FALSE | 무효화 여부 |
| created_at | DATETIME | NOT NULL | |

### 12.8 카드매출 데이터 입력 방식

카드매출 데이터는 **주문 등록 시 세무구분이 '카드매출'인 경우 자동 생성**된다.
- 주문의 `tax_type = 'CARD'`이고 매출등록 시 카드 결제 정보를 추가 입력
- 매출등록 화면에서 카드사/카드번호/승인번호를 입력하면 `card_sales` 레코드 자동 생성

### 12.9 사업자 테이블 보완

`business_owners` 테이블에 세금계산서 발행에 필요한 대표자 정보를 추가한다:
```
representative_name   VARCHAR(50)   -- 대표자명
representative_email  VARCHAR(100)  -- 대표자 이메일
representative_phone  VARCHAR(20)   -- 대표자 연락처
```

### 12.10 주문금액 계산 공식 명확화

```
[품목 레벨]
  item.subtotal = item.quantity × item.unit_price

[작업 레벨]
  work.work_amount = SUM(items.subtotal) × work.quantity(제작부수)
  work.subtotal_before_discount = work.work_amount + work.delivery_fee + work.design_fee
  work.payment_amount = work.subtotal_before_discount - work.discount

[주문 레벨]
  order.total_amount = SUM(works.payment_amount)
```

### 12.11 주문번호 동시성 처리

주문번호 생성 시 동시성 충돌을 방지하기 위해 **DB 시퀀스 테이블**을 사용한다.

#### sequence_numbers (번호 시퀀스)
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT | PK, AUTO_INCREMENT | |
| seq_type | VARCHAR(20) | NOT NULL | 번호 유형 (ORDER, UNTACT, PO, PRE_SALES) |
| seq_date | DATE | NOT NULL | 날짜 |
| dept_code | VARCHAR(4) | | 부서코드 (ORDER, UNTACT용) |
| last_seq | INT | DEFAULT 0 | 마지막 일련번호 |

**UNIQUE 제약**: (seq_type, seq_date, dept_code)

번호 발급 시 `SELECT ... FOR UPDATE`로 행 잠금 후 `last_seq + 1`로 증가시킨다.

### 12.12 통화 정책

현재 시스템은 **원화(KRW) 전용**이다. 모든 금액 컬럼은 원 단위 정수(BIGINT)로 저장한다. 해외사업본부 관련 외화 거래가 필요할 경우 별도 확장 설계가 필요하다.

### 12.13 주문 상세/수정 화면

주문목록에서 행 클릭 시 이동하는 **주문 상세 페이지**는 주문등록(OrderCreatePage)을 **재사용**한다.

- **URL**: `/orders/{id}` → OrderCreatePage를 view/edit 모드로 렌더링
- **모드 전환**: 상단 "수정" 버튼 클릭 시 편집 모드 활성화
- **수정 가능 조건**:

| 주문 상태 | 수정 가능 필드 |
|-----------|---------------|
| PENDING (접수대기) | 전체 필드 수정 가능 |
| OUTSOURCE_PO (외주발주) | 회사명, 고객명, 사업본부, 세무구분, 영업담당자만 수정 가능 |
| SHIPPED (발송완료) | 수정 불가 (읽기 전용) |
| SALES_REGISTERED (매출등록) | 수정 불가 (읽기 전용) |

### 12.14 프로세스 흐름도 화면 (ProcessFlowPage)

- **URL**: `/process`
- **내용**: 대모 사이트의 프로세스 보기와 동일한 업무 흐름도를 표시
- **구현 방식**: 정적 SVG/이미지 기반 다이어그램 (줌 인/아웃, 풀스크린 지원)
- **3개 프로세스 라인**: 외주/패키지/P&D파트, 구매, 내부생산(POD/센터)
- 각 단계 클릭 시 해당 화면으로 이동 (인터랙티브 링크)

### 12.15 인덱스 전략

| 테이블 | 인덱스 | 용도 |
|--------|--------|------|
| orders | (received_date, status) | 주문목록 기간+상태 조회 |
| orders | (department_id, status) | 부서별 주문 조회 |
| sales | (sales_date, department_id) | 매출목록 기간+부서 조회 |
| outsourcing_pos | (department_id, status, delivery_date) | 외주발주 목록 조회 |
| untact_orders | (department_id, created_at) | 비대면주문 조회 |
| customers | (name) | 고객 검색 |
| business_owners | (company_name) | 회사명 검색 |
| business_owners | (biz_no) | 사업자번호 검색 |

---

## 13. 미확정 사항 (체크 포인트)

| # | 항목 | 설명 | 우선순위 |
|---|------|------|----------|
| 1 | 매출등록 위치 | 비대면주문등록/주문목록 등 어디서 매출등록을 수행할지 | 높음 |
| 2 | ERP 부분외주건 취소 | ERP 부분외주 후 취소 시 SM Module 처리 방안 | 중간 |
| 3 | 발송완료건 매출등록 | ERP 데이터 매핑 vs SM Module 별도 DB 관리 | 중간 |
| 4 | 통계 화면 기획 | 7개 통계 화면의 상세 기획 (차트 유형, 필터, 집계 기준) | 낮음 |
| 5 | 외주정산현황 기획 | 화면 구성 및 데이터 항목 정의 | 낮음 |
| 6 | 구매 프로세스 화면 | 구매 전용 화면 필요 여부 (외주정산등록과 동일 화면 가능성) | 중간 |
| 7 | 거래명세서/견적서 기능 | 거래명세서, 견적서 기능 추가 필요 (메뉴 위치 미정) | 높음 |
| 8 | 선매출 프로세스 상세 | 계산서 기반 선매출등록인지, 게시판 방식 운영인지 확인 필요 | 높음 |
| 9 | 비대면 결제 로직 | 비대면 결제 메일전송/결제취소 로직 상세 확인 필요 | 중간 |
| 10 | 세금계산서 ERP 전표 | 세금계산서 발행 후 ERP 전표 처리 방식 확인 필요 | 중간 |
| 11 | Gitgo 전자결재 API | Gitgo 전자결재 API 연동 상세 사양 미정 | 중간 |
| 12 | ~~통계 프로토타입~~ | ~~통계 화면 프로토타입 미정~~ → **해결됨**: 7개 전부 구현 완료 | ~~낮음~~ |

> **Updated:** 2026-04-07 — 코드 분석 결과: 통계 7개, 외주정산현황, 고객관리는 이미 구현 완료됨. 미확정 #4, #5, #12 해소.

---

## 14. 알려진 버그 (2026-04-07 코드 분석)

| # | 위치 | 내용 | 심각도 |
|---|------|------|--------|
| 1 | 세금계산서발행 BE→FE | FE: `supplyAmt`/`taxAmt` 전송, BE: `supplyAmount`/`taxAmount` 수신 — **필드명 불일치** (런타임 에러) | **높음** |
| 2 | 주문등록 수정 | 주문수정 시 success 반환하지만 **실제 DB 수정 안됨** (ErpOrderWriteService.updateOrderInErp 또는 OrderService.update 문제) | **높음** |
| 3 | 주문목록 통계 | "검토 대기: 12건", "출고 (오늘): 28건" **하드코딩** — 실제 데이터 아님 | 중간 |
| 4 | 카드매출 빈 필드 | cardCompany, cardNo 컬럼 항상 `-` 표시 — BE가 카드전용 필드를 DTO에 미포함 | 중간 |
| 5 | 매출목록 타입 캐스팅 | partnerContact, salesType, grandTotalAmt 등 `(info.row.original as any).field` 사용 — 타입 불안전 | 낮음 |

---

## 15. 백엔드 스텁 목록 (2026-04-07 코드 분석)

> 아래 API는 엔드포인트가 존재하지만 로직 없이 빈 응답(`ApiResponse.ok()` 또는 `Collections.emptyList()`)을 반환하는 상태.

### 15.1 빈 응답 반환 (CRUD 스텁)

| API | 컨트롤러 | 현재 응답 | 필요 작업 | 난이도 |
|-----|---------|----------|----------|--------|
| `PUT /api/sales/pre/{salesNo}` | PreSalesController | `ApiResponse.ok()` 빈 | SalesService에 update 구현 | Small |
| `DELETE /api/sales/pre/{salesNo}` | PreSalesController | `ApiResponse.ok()` 빈 | SalesService에 delete 구현 | Small |
| `DELETE /api/sales/untact-order/{salesNo}` | UntactOrderController | `ApiResponse.ok()` 빈 | 삭제 로직 구현 | Small |
| `DELETE /api/sales/tax-issue/{salesNo}` | TaxIssueController | `ApiResponse.ok()` 빈 | 삭제 로직 구현 | Small |

### 15.2 빈 리스트 반환 (검색 스텁)

| API | 컨트롤러 | 현재 응답 | 필요 작업 | 난이도 |
|-----|---------|----------|----------|--------|
| `GET /api/sales/pre/partners` | PreSalesController | `Collections.emptyList()` | 거래처 검색 쿼리 (ErpPartnerRepository 재사용) | Small |
| `GET /api/sales/untact-order/orders` | UntactOrderController | `Collections.emptyList()` | 주문 검색 쿼리 (OrderService 재사용) | Medium |
| `GET /api/sales/tax-issue/orders` | TaxIssueController | `Collections.emptyList()` | 주문 검색 쿼리 (OrderService 재사용) | Medium |

### 15.3 누락 엔드포인트

| 필요 API | 호출하는 FE | 필요 작업 | 난이도 |
|---------|-----------|----------|--------|
| `GET /api/sales/untact-settlement/export` | UntactSettlementPage 엑셀다운로드 | export 엔드포인트 추가 | Small |

---

## 16. 수정 필요 항목 (2026-04-07 코드 분석)

### 16.1 즉시 수정 (버그/하드코딩)
| # | 항목 | 작업 내용 | 난이도 |
|---|------|----------|--------|
| 1 | 세금계산서 필드명 불일치 | FE `supplyAmt`↔BE `supplyAmount` 통일 | Small |
| 2 | 주문목록 하드코딩 통계 | 실제 API 데이터로 교체 또는 제거 | Small |
| 3 | 주문수정 미동작 | OrderService.update() / ErpOrderWriteService 디버깅 | Medium |

### 16.2 기능 보완
| # | 항목 | 작업 내용 | 난이도 |
|---|------|----------|--------|
| 4 | 주문목록 매출등록 | DataTable에 체크박스 컬럼 추가 + selectedOrders 연동 | Medium |
| 5 | 사업자/고객관리 DISCH_CD | ErpPartnerRepository에 MA_PARTNERSA_INFO JOIN 추가 | Small |
| 6 | 카드매출 카드필드 | SalesDto.ListItem에 cardCompanyCd/cardNo/cardApproveNo 추가, BE에서 sales_mst 카드 컬럼 반환 | Medium |
| 7 | 매출목록 DTO 정렬 | SalesDto.ListItem 타입에 partnerContact/salesType/grandTotalAmt 추가, `as any` 제거 | Small |

### 16.3 우선순위 정리

**P0 (즉시):** #1 세금계산서 필드명, #3 주문수정 버그
**P1 (높음):** #4 매출등록 체크박스, 15.1 CRUD 스텁 4개, 15.2 검색 스텁 3개
**P2 (중간):** #5 DISCH_CD 필터, #6 카드매출 필드, #2 하드코딩 제거
**P3 (낮음):** #7 DTO 정렬, 15.3 export 누락
