# Phase 4: 매출관리 구현 계획서

> **Updated:** 2026-04-07 — 실제 구현 상태 및 신규 요구사항 반영
>
> **주요 변경 이력 (2026-03-26 ~ 2026-04-06):**
> - 테이블명 변경: sales→sales_mst, 신규 sales_dtl 추가
> - PK 전략: 단일PK → 복합PK(company_cd + plant_cd + sales_no)
> - card_sales 별도 테이블 삭제 → sales_mst에 카드정보 통합 (pay_type='CARD' 필터)
> - sales_mst 신규 컬럼 10개: sales_dept_cd/nm, card_company_cd/no/approve_no/approve_dt, devide_month, pg_txn_id, tax_no
> - sales_dtl 신규: ref_sales_no, ref_sales_sq (선매출 참조)
> - 매출목록 조회조건 추가: 영업담당자, 거래처, 매출번호, 주문번호, 세부품목명
> - 매출목록 컬럼 추가: 총금액(합산), 거래처명, 거래처담당자, 매출타입
> - 미구현 화면: 카드매출목록, 선매출목록/입력, 비대면주문등록/목록, 비대면정산, 세금계산서발행/목록

> **Oracle 연동 확정 (2026-04-07):**
> - 매출목록 조회: `SD_BILL_MST` Oracle 직접 조회 (ErpBillingRepository)
>   - 매핑: BILLDOC_NO→salesNo, BILL_DT→salesDt, SPLY_AMT→공급가, TAX_AMT→세액, TRAN_AMT→총액
>   - JOIN: CI_PARTNER_MST(거래처명), SD_BILL_DTL(주문번호 추출)
>   - Oracle 비활성 시 MySQL sales_mst Fallback
> - 카드매출: SD_BILL_MST에 카드 구분 컬럼 **없음** → sales_mst.pay_type='CARD' 필터 확정
> - 선매출/비대면: ERP 매핑 없음 → **SM 자체 MySQL 관리 확정**
> - 세금계산서: sales_mst.tax_no 컬럼에 전자세금계산서번호 저장, 더존 연동 방식 미확정
>
> **코드 분석 결과 (2026-04-07) — FE 전체 완성, BE 스텁 다수:**
> - 매출목록: FE/BE 완성. **수정필요:** DTO 타입 불안전(as any 캐스팅), partnerContact/salesType/grandTotalAmt 타입 정렬 (Small)
> - 카드매출목록: FE 완성, BE 부분. **보완필요:** cardCompanyCd/cardNo 필드 DTO에 미포함 → 항상 `-` 표시 (Medium)
> - 선매출목록: FE/BE 완성 (조회한정)
> - 선매출입력: FE 완성, **BE 스텁:** PUT update → 빈 ok, DELETE → 빈 ok, GET partners → 빈 리스트 (Medium)
> - 비대면주문등록: FE 완성, **BE 스텁:** DELETE → 빈 ok, GET orders → 빈 리스트 (Medium)
> - 비대면주문목록: FE/BE 완성 (조회한정)
> - 비대면정산: FE 완성, BE 거의완료. **누락:** export 엔드포인트 (Small)
> - 세금계산서발행: FE 완성, **BE 스텁+버그:** DELETE → 빈 ok, GET orders → 빈 리스트, **필드명 불일치** supplyAmt↔supplyAmount (P0)
> - 세금계산서목록: FE/BE 완성 (조회한정)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans

**Goal:** 매출목록/등록/확정, 카드매출(sales_mst 필터), 선매출, 비대면주문/정산 구현
**Architecture:** sales 도메인. sales_mst→sales_dtl (1:N). 복합PK(company_cd+plant_cd+sales_no). 카드매출은 pay_type 필터. 매출조회는 Oracle SD_BILL_MST 직접 조회.
**Tech Stack:** Spring Boot 3.x, JPA, QueryDSL | React 18, Ant Design, TanStack Table
**Spec:** Section 4.4, 5.5, 6.6, 12.2, 12.4, 12.8

---

## Task 1: DB 스키마 - 매출관리 테이블

> ~~Flyway V4~~ → V1 통합 스키마로 변경됨.
> sales_mst (복합PK), sales_dtl (신규). ~~card_sales~~ → sales_mst 통합.
> pre_sales, untact_orders, untact_settlements → 미구현, 추후 개발 예정.

**Files:**
- `sm-module-api/src/main/resources/db/migration/V4__create_sales_tables.sql`

### Steps

- [ ] **1.1** Create `V4__create_sales_tables.sql`

```sql
-- =============================================================
-- 매출관리 테이블 (V1 통합 스키마)
-- 변경: sales→sales_mst(복합PK), card_sales 삭제→sales_mst 통합
-- 신규: sales_dtl (매출디테일, 1:N)
-- =============================================================

-- sales_mst (매출마스터) - 복합PK
CREATE TABLE sales_mst (
    company_cd      INT             NOT NULL        COMMENT '회사코드',
    plant_cd        INT             NOT NULL        COMMENT '공장코드',
    sales_no        VARCHAR(30)     NOT NULL        COMMENT '매출번호',
    sales_title     VARCHAR(200)    NULL            COMMENT '매출명',
    order_no        VARCHAR(30)     NULL            COMMENT '주문번호 (비정규화)',
    partner_cd      VARCHAR(20)     NULL            COMMENT '거래처코드',
    partner_nm      VARCHAR(100)    NULL            COMMENT '거래처명',
    tax_type_cd     VARCHAR(20)     NULL            COMMENT '세무구분',
    sales_type      VARCHAR(20)     NULL            COMMENT '매출타입',
    pay_type        VARCHAR(20)     NULL            COMMENT '결제수단 (CARD/CASH 등)',
    sales_dt        DATE            NULL            COMMENT '매출일자',
    total_amt       BIGINT          DEFAULT 0       COMMENT '총금액',
    dept_cd         INT             NULL            COMMENT '부서코드',
    sales_emp_no    VARCHAR(20)     NULL            COMMENT '영업담당자사번',
    status_cd       VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '상태',
    confirmed       BOOLEAN         DEFAULT FALSE   COMMENT '확정여부',
    confirmed_at    DATETIME        NULL            COMMENT '확정일시',
    confirmed_id    VARCHAR(20)     NULL            COMMENT '확정자ID',
    slip_no         VARCHAR(30)     NULL            COMMENT '매출전표번호',
    pay_email       VARCHAR(100)    NULL            COMMENT '결제알림 이메일',
    erp_bill_no     VARCHAR(30)     NULL            COMMENT 'ERP 청구번호',
    erp_sync_status VARCHAR(20)     DEFAULT 'NONE'  COMMENT 'ERP 연동상태',
    note            TEXT            NULL            COMMENT '비고',
    -- 신규 (2026.03.30)
    sales_dept_cd   VARCHAR(20)     NULL            COMMENT '영업부서코드',
    sales_dept_nm   VARCHAR(100)    NULL            COMMENT '영업부서명 (히스토리)',
    -- 카드정보 통합 (card_sales 테이블 삭제, 2026.03.30)
    card_company_cd VARCHAR(20)     NULL            COMMENT '카드사',
    card_no         VARCHAR(50)     NULL            COMMENT '카드번호',
    card_approve_no VARCHAR(50)     NULL            COMMENT '카드승인번호',
    card_approve_dt DATETIME        NULL            COMMENT '카드승인일시',
    devide_month    INT             NULL            COMMENT '할부개월',
    pg_txn_id       VARCHAR(50)     NULL            COMMENT 'PG사 거래ID',
    -- 신규 (2026.03.31)
    tax_no          VARCHAR(50)     NULL            COMMENT '전자세금계산서번호',
    -- Audit (BaseEntity)
    created_at      DATETIME        NOT NULL,
    updated_at      DATETIME        NOT NULL,
    created_id      VARCHAR(20)     NULL,
    updated_id      VARCHAR(20)     NULL,
    PRIMARY KEY (company_cd, plant_cd, sales_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_sales_mst_dt ON sales_mst (sales_dt, dept_cd);

-- sales_dtl (매출디테일) - 신규 테이블
CREATE TABLE sales_dtl (
    company_cd      INT             NOT NULL,
    plant_cd        INT             NOT NULL,
    sales_no        VARCHAR(30)     NOT NULL,
    sales_sq        INT             NOT NULL        COMMENT '매출순번',
    item_nm         VARCHAR(200)    NULL            COMMENT '품목명',
    quantity        INT             DEFAULT 0       COMMENT '수량',
    unit_price      BIGINT          DEFAULT 0       COMMENT '단가',
    supply_amt      BIGINT          DEFAULT 0       COMMENT '공급가액',
    tax_amt         BIGINT          DEFAULT 0       COMMENT '세액',
    total_amt       BIGINT          DEFAULT 0       COMMENT '합계',
    note            VARCHAR(500)    NULL            COMMENT '비고',
    -- 선매출 참조 (2026.03.30)
    ref_sales_no    VARCHAR(30)     NULL            COMMENT '참조선매출번호',
    ref_sales_sq    VARCHAR(10)     NULL            COMMENT '참조선매출순번',
    -- Audit
    created_at      DATETIME        NOT NULL,
    updated_at      DATETIME        NOT NULL,
    created_id      VARCHAR(20)     NULL,
    updated_id      VARCHAR(20)     NULL,
    PRIMARY KEY (company_cd, plant_cd, sales_no, sales_sq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ※ card_sales 테이블 삭제 → sales_mst.pay_type='CARD' 필터로 대체
-- ※ sales_audit_logs → 추후 필요시 추가

-- pre_sales (선매출 - Spec 12.4: deduct_order_id 제거, remaining_amount 추가)
CREATE TABLE pre_sales (
    id                  BIGINT          AUTO_INCREMENT PRIMARY KEY,
    pre_sales_no        VARCHAR(30)     NOT NULL UNIQUE,
    department_id       BIGINT          NULL,
    manager_id          BIGINT          NULL,
    business_owner_id   BIGINT          NULL,
    customer_id         BIGINT          NULL,
    amount              BIGINT          NOT NULL        DEFAULT 0,
    remaining_amount    BIGINT          NOT NULL        DEFAULT 0   COMMENT '잔여금액 = amount - SUM(deductions)',
    payment_type        VARCHAR(30)     NULL,
    tax_type            ENUM('TAXABLE','ZERO_RATE','EXEMPT') DEFAULT 'TAXABLE',
    note                TEXT            NULL,
    registered_by       BIGINT          NULL,
    deleted             BOOLEAN         DEFAULT FALSE,
    deleted_at          DATETIME        NULL,
    deleted_by          BIGINT          NULL,
    created_at          DATETIME        NOT NULL,
    updated_at          DATETIME        NOT NULL,
    created_by          BIGINT          NULL,
    updated_by          BIGINT          NULL,
    CONSTRAINT fk_presales_dept     FOREIGN KEY (department_id)     REFERENCES departments(id),
    CONSTRAINT fk_presales_mgr      FOREIGN KEY (manager_id)        REFERENCES users(id),
    CONSTRAINT fk_presales_biz      FOREIGN KEY (business_owner_id) REFERENCES business_owners(id),
    CONSTRAINT fk_presales_cust     FOREIGN KEY (customer_id)       REFERENCES customers(id),
    CONSTRAINT fk_presales_reg      FOREIGN KEY (registered_by)     REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_presales_dept_date ON pre_sales (department_id, created_at);

-- pre_sales_deductions (선매출 차감이력 - Spec 12.4: 1:N 관계)
CREATE TABLE pre_sales_deductions (
    id                  BIGINT          AUTO_INCREMENT PRIMARY KEY,
    pre_sales_id        BIGINT          NOT NULL,
    order_id            BIGINT          NOT NULL,
    deducted_amount     BIGINT          NOT NULL,
    note                TEXT            NULL,
    created_at          DATETIME        NOT NULL,
    created_by          BIGINT          NULL,
    CONSTRAINT fk_deduction_presales FOREIGN KEY (pre_sales_id) REFERENCES pre_sales(id),
    CONSTRAINT fk_deduction_order    FOREIGN KEY (order_id)     REFERENCES orders(id),
    CONSTRAINT fk_deduction_user     FOREIGN KEY (created_by)   REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_deduction_presales ON pre_sales_deductions (pre_sales_id);
CREATE INDEX idx_deduction_order    ON pre_sales_deductions (order_id);

-- untact_orders (비대면주문)
CREATE TABLE untact_orders (
    id                  BIGINT          AUTO_INCREMENT PRIMARY KEY,
    untact_no           VARCHAR(30)     NOT NULL UNIQUE,
    order_id            BIGINT          NULL,
    department_id       BIGINT          NULL,
    manager_id          BIGINT          NULL,
    business_owner_id   BIGINT          NULL,
    customer_id         BIGINT          NULL,
    amount              BIGINT          NOT NULL        DEFAULT 0,
    work_name           VARCHAR(200)    NULL,
    payment_status      ENUM('PENDING','COMPLETED') DEFAULT 'PENDING',
    payment_code        VARCHAR(30)     NULL,
    deleted             BOOLEAN         DEFAULT FALSE,
    deleted_at          DATETIME        NULL,
    deleted_by          BIGINT          NULL,
    created_at          DATETIME        NOT NULL,
    updated_at          DATETIME        NOT NULL,
    created_by          BIGINT          NULL,
    updated_by          BIGINT          NULL,
    CONSTRAINT fk_untact_order      FOREIGN KEY (order_id)          REFERENCES orders(id),
    CONSTRAINT fk_untact_dept       FOREIGN KEY (department_id)     REFERENCES departments(id),
    CONSTRAINT fk_untact_mgr        FOREIGN KEY (manager_id)        REFERENCES users(id),
    CONSTRAINT fk_untact_biz        FOREIGN KEY (business_owner_id) REFERENCES business_owners(id),
    CONSTRAINT fk_untact_cust       FOREIGN KEY (customer_id)       REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_untact_dept_created ON untact_orders (department_id, created_at);

-- untact_settlements (비대면정산)
CREATE TABLE untact_settlements (
    id                  BIGINT          AUTO_INCREMENT PRIMARY KEY,
    merchant_id         VARCHAR(30)     NULL,
    branch              VARCHAR(50)     NULL,
    untact_order_id     BIGINT          NULL,
    approval_datetime   DATETIME        NULL,
    approval_no         VARCHAR(30)     NULL,
    payment_method      VARCHAR(20)     NULL,
    payment_amount      BIGINT          DEFAULT 0,
    supply_price        BIGINT          DEFAULT 0,
    vat                 BIGINT          DEFAULT 0,
    payment_fee         BIGINT          DEFAULT 0,
    refund_fee          BIGINT          DEFAULT 0,
    payout_amount       BIGINT          DEFAULT 0,
    payout_date         DATE            NULL,
    deleted             BOOLEAN         DEFAULT FALSE,
    deleted_at          DATETIME        NULL,
    deleted_by          BIGINT          NULL,
    created_at          DATETIME        NOT NULL,
    updated_at          DATETIME        NOT NULL,
    created_by          BIGINT          NULL,
    updated_by          BIGINT          NULL,
    CONSTRAINT fk_untact_stl_order FOREIGN KEY (untact_order_id) REFERENCES untact_orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_untact_stl_branch ON untact_settlements (branch, approval_datetime);
```

- [ ] **1.2** Verify: `./gradlew flywayMigrate` or Spring Boot startup
- [ ] **1.3** Confirm all 7 tables: `SHOW TABLES LIKE '%sales%'; SHOW TABLES LIKE 'untact%';`

### Acceptance Criteria
- 7 tables created: sales, sales_audit_logs, card_sales, pre_sales, pre_sales_deductions, untact_orders, untact_settlements
- pre_sales has `remaining_amount`, does NOT have `deduct_order_id` (per Spec 12.4)
- pre_sales_deductions links pre_sales 1:N to orders
- All soft-delete + audit columns present (Spec 12.1, 12.3)

---

## Task 2: 매출 Backend - Sales + SalesAuditLog

> Entity, Service(list/create/confirm with audit log), Controller

**Files:**
- `sm-module-api/src/main/java/com/tara/sm/sales/entity/Sales.java`
- `sm-module-api/src/main/java/com/tara/sm/sales/entity/SalesAuditLog.java`
- `sm-module-api/src/main/java/com/tara/sm/sales/entity/CardSales.java`
- `sm-module-api/src/main/java/com/tara/sm/sales/dto/SalesDto.java`
- `sm-module-api/src/main/java/com/tara/sm/sales/repository/SalesRepository.java`
- `sm-module-api/src/main/java/com/tara/sm/sales/repository/SalesQueryRepository.java`
- `sm-module-api/src/main/java/com/tara/sm/sales/repository/SalesAuditLogRepository.java`
- `sm-module-api/src/main/java/com/tara/sm/sales/service/SalesService.java`
- `sm-module-api/src/main/java/com/tara/sm/sales/controller/SalesController.java`

### Steps

- [ ] **2.1** Entity: `Sales.java`

```java
package com.tara.sm.sales.entity;

import com.tara.sm.common.audit.BaseEntity;
import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity @Table(name = "sales")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
public class Sales extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_id")
    private Long orderId;

    @Column(name = "sales_date", nullable = false)
    private LocalDate salesDate;

    @Column(name = "amount", nullable = false)
    @Builder.Default
    private Long amount = 0L;

    @Column(name = "confirmed")
    @Builder.Default
    private Boolean confirmed = false;

    @Column(name = "confirmed_at")
    private LocalDateTime confirmedAt;

    @Column(name = "confirmed_by")
    private Long confirmedBy;

    @Column(name = "department_id")
    private Long departmentId;

    @Column(name = "deleted") @Builder.Default
    private Boolean deleted = false;

    @OneToMany(mappedBy = "sales", cascade = CascadeType.ALL)
    @Builder.Default
    private List<SalesAuditLog> auditLogs = new ArrayList<>();

    // --- Domain methods ---
    public void confirm(Long userId) {
        if (this.confirmed) throw new IllegalStateException("이미 확정된 매출입니다.");
        this.confirmed = true;
        this.confirmedAt = LocalDateTime.now();
        this.confirmedBy = userId;
    }
}
```

- [ ] **2.2** Entity: `SalesAuditLog.java`

```java
package com.tara.sm.sales.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity @Table(name = "sales_audit_logs")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
public class SalesAuditLog {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sales_id", nullable = false)
    private Sales sales;

    @Enumerated(EnumType.STRING)
    @Column(name = "action", nullable = false)
    private AuditAction action;

    @Column(name = "changed_field", length = 50)
    private String changedField;

    @Column(name = "old_value", columnDefinition = "TEXT")
    private String oldValue;

    @Column(name = "new_value", columnDefinition = "TEXT")
    private String newValue;

    @Column(name = "changed_by")
    private Long changedBy;

    @Column(name = "changed_at", nullable = false)
    private LocalDateTime changedAt;

    @Column(name = "note", columnDefinition = "TEXT")
    private String note;

    public enum AuditAction { CREATED, CONFIRMED, CANCELLED, MODIFIED }

    public static SalesAuditLog of(Sales sales, AuditAction action, Long userId) {
        return SalesAuditLog.builder()
            .sales(sales).action(action)
            .changedBy(userId).changedAt(LocalDateTime.now())
            .build();
    }
}
```

- [ ] **2.3** Entity: `CardSales.java`

```java
package com.tara.sm.sales.entity;

import com.tara.sm.common.audit.BaseEntity;
import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity @Table(name = "card_sales")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
public class CardSales extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_id")
    private Long orderId;

    @Column(name = "sales_id")
    private Long salesId;

    @Column(name = "branch", length = 50)
    private String branch;

    @Column(name = "sales_date", nullable = false)
    private LocalDate salesDate;

    @Column(name = "card_company", length = 30)
    private String cardCompany;

    @Column(name = "card_no", length = 30)
    private String cardNo;

    @Column(name = "approval_no", length = 30)
    private String approvalNo;

    @Column(name = "amount", nullable = false) @Builder.Default
    private Long amount = 0L;

    @Column(name = "sales_time")
    private LocalDateTime salesTime;

    @Column(name = "deleted") @Builder.Default
    private Boolean deleted = false;
}
```

- [ ] **2.4** DTOs: `SalesDto.java`

```java
package com.tara.sm.sales.dto;

import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class SalesDto {

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class CreateRequest {
        private Long orderId;
        private LocalDate salesDate;
        private Long amount;
        private Long departmentId;
        // Spec 12.8: card info (optional, for tax_type=CARD)
        private String cardCompany;
        private String cardNo;
        private String approvalNo;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class SearchCondition {
        private LocalDate startDate;
        private LocalDate endDate;
        private Long departmentId;
        private String keyword;
        private int page;
        private int size;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class ListItem {
        private Long id;
        private Long orderId;
        private String orderNo;
        private String orderTitle;
        private String companyName;
        private String customerName;
        private LocalDate salesDate;
        private Long amount;
        private Boolean confirmed;
        private LocalDateTime confirmedAt;
        private String departmentName;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class AuditLogItem {
        private Long id;
        private String action;
        private String changedField;
        private String oldValue;
        private String newValue;
        private String changedByName;
        private LocalDateTime changedAt;
        private String note;
    }

    // CardSales DTOs
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class CardSalesSearchCondition {
        private LocalDate startDate;
        private LocalDate endDate;
        private Long departmentId;
        private String keyword;
        private int page;
        private int size;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class CardSalesListItem {
        private Long id;
        private String branch;
        private String orderNo;
        private String orderTitle;
        private LocalDate salesDate;
        private String cardCompany;
        private String cardNo;
        private String approvalNo;
        private Long amount;
        private LocalDateTime salesTime;
    }
}
```

- [ ] **2.5** Repositories

```java
// SalesRepository.java
package com.tara.sm.sales.repository;

import com.tara.sm.sales.entity.Sales;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SalesRepository extends JpaRepository<Sales, Long> {}

// SalesAuditLogRepository.java
package com.tara.sm.sales.repository;

import com.tara.sm.sales.entity.SalesAuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface SalesAuditLogRepository extends JpaRepository<SalesAuditLog, Long> {
    List<SalesAuditLog> findBySalesIdOrderByChangedAtDesc(Long salesId);
}

// CardSalesRepository.java
package com.tara.sm.sales.repository;

import com.tara.sm.sales.entity.CardSales;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CardSalesRepository extends JpaRepository<CardSales, Long> {}
```

- [ ] **2.6** QueryDSL: `SalesQueryRepository.java`

```java
package com.tara.sm.sales.repository;

import com.querydsl.core.BooleanBuilder;
import com.querydsl.core.types.Projections;
import com.querydsl.jpa.impl.JPAQueryFactory;
import com.tara.sm.sales.dto.SalesDto;
import com.tara.sm.sales.entity.QSales;
import com.tara.sm.order.entity.QOrder;
import com.tara.sm.auth.entity.QDepartment;
import com.tara.sm.info.entity.QBusinessOwner;
import com.tara.sm.info.entity.QCustomer;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;
import java.util.List;

@Repository
@RequiredArgsConstructor
public class SalesQueryRepository {

    private final JPAQueryFactory queryFactory;

    public Page<SalesDto.ListItem> search(SalesDto.SearchCondition cond, Pageable pageable) {
        QSales s = QSales.sales;
        QOrder o = QOrder.order;
        QDepartment d = QDepartment.department;
        QBusinessOwner biz = QBusinessOwner.businessOwner;
        QCustomer cust = QCustomer.customer;

        BooleanBuilder where = new BooleanBuilder().and(s.deleted.isFalse());
        if (cond.getDepartmentId() != null) where.and(s.departmentId.eq(cond.getDepartmentId()));
        if (cond.getStartDate() != null)    where.and(s.salesDate.goe(cond.getStartDate()));
        if (cond.getEndDate() != null)      where.and(s.salesDate.loe(cond.getEndDate()));
        if (StringUtils.hasText(cond.getKeyword())) {
            String kw = "%" + cond.getKeyword() + "%";
            where.and(biz.companyName.like(kw).or(o.orderNo.like(kw)));
        }

        List<SalesDto.ListItem> content = queryFactory
            .select(Projections.bean(SalesDto.ListItem.class,
                s.id, s.orderId, o.orderNo, o.orderTitle,
                biz.companyName, cust.name.as("customerName"),
                s.salesDate, s.amount, s.confirmed, s.confirmedAt,
                d.name.as("departmentName")
            ))
            .from(s)
            .leftJoin(o).on(o.id.eq(s.orderId))
            .leftJoin(d).on(d.id.eq(s.departmentId))
            .leftJoin(biz).on(biz.id.eq(o.businessOwnerId))
            .leftJoin(cust).on(cust.id.eq(o.customerId))
            .where(where)
            .orderBy(s.salesDate.desc(), s.id.desc())
            .offset(pageable.getOffset()).limit(pageable.getPageSize())
            .fetch();

        long total = queryFactory.select(s.count()).from(s)
            .leftJoin(o).on(o.id.eq(s.orderId))
            .leftJoin(biz).on(biz.id.eq(o.businessOwnerId))
            .where(where).fetchOne();

        return new PageImpl<>(content, pageable, total);
    }

    /** CardSales search - same pattern, joins order for orderNo/title */
    // ... same pattern as above with QCardSales, returning CardSalesListItem
}
```

- [ ] **2.7** Service: `SalesService.java`

```java
package com.tara.sm.sales.service;

import com.tara.sm.common.exception.BusinessException;
import com.tara.sm.sales.dto.SalesDto;
import com.tara.sm.sales.entity.*;
import com.tara.sm.sales.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SalesService {

    private final SalesRepository salesRepository;
    private final SalesAuditLogRepository auditLogRepository;
    private final CardSalesRepository cardSalesRepository;
    private final SalesQueryRepository salesQueryRepository;

    public Page<SalesDto.ListItem> list(SalesDto.SearchCondition cond) {
        return salesQueryRepository.search(cond, PageRequest.of(cond.getPage(), cond.getSize()));
    }

    @Transactional
    public Sales create(SalesDto.CreateRequest req, Long userId) {
        Sales sales = Sales.builder()
            .orderId(req.getOrderId())
            .salesDate(req.getSalesDate() != null ? req.getSalesDate() : LocalDate.now())
            .amount(req.getAmount())
            .departmentId(req.getDepartmentId())
            .build();
        salesRepository.save(sales);

        // Audit: CREATED
        auditLogRepository.save(SalesAuditLog.of(sales, SalesAuditLog.AuditAction.CREATED, userId));

        // Spec 12.8: card_sales auto-create when card info provided
        if (req.getCardCompany() != null) {
            CardSales card = CardSales.builder()
                .orderId(req.getOrderId())
                .salesId(sales.getId())
                .salesDate(sales.getSalesDate())
                .cardCompany(req.getCardCompany())
                .cardNo(req.getCardNo())
                .approvalNo(req.getApprovalNo())
                .amount(req.getAmount())
                .build();
            cardSalesRepository.save(card);
        }
        return sales;
    }

    @Transactional
    public void confirm(Long salesId, Long userId) {
        Sales sales = findByIdOrThrow(salesId);
        sales.confirm(userId);
        auditLogRepository.save(SalesAuditLog.of(sales, SalesAuditLog.AuditAction.CONFIRMED, userId));
    }

    public List<SalesDto.AuditLogItem> getAuditLogs(Long salesId) {
        return auditLogRepository.findBySalesIdOrderByChangedAtDesc(salesId).stream()
            .map(log -> SalesDto.AuditLogItem.builder()
                .id(log.getId()).action(log.getAction().name())
                .changedField(log.getChangedField())
                .oldValue(log.getOldValue()).newValue(log.getNewValue())
                .changedAt(log.getChangedAt()).note(log.getNote())
                .build())
            .toList();
    }

    public byte[] exportExcel(SalesDto.SearchCondition cond) {
        // Re-use ExcelService from Phase 4 Task (common util)
        // Fetch all, map to headers/rows, call excelService.exportToExcel(...)
        throw new UnsupportedOperationException("Wire ExcelService in implementation");
    }

    private Sales findByIdOrThrow(Long id) {
        return salesRepository.findById(id)
            .filter(s -> !s.getDeleted())
            .orElseThrow(() -> new BusinessException("SALES_NOT_FOUND", "매출을 찾을 수 없습니다."));
    }
}
```

- [ ] **2.8** Controller: `SalesController.java`

```java
package com.tara.sm.sales.controller;

import com.tara.sm.common.dto.ApiResponse;
import com.tara.sm.sales.dto.SalesDto;
import com.tara.sm.sales.service.SalesService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.List;

@Tag(name = "Sales - 매출관리")
@RestController
@RequestMapping("/api/sales")
@RequiredArgsConstructor
public class SalesController {

    private final SalesService salesService;

    @Operation(summary = "매출목록 조회")
    @GetMapping
    public ApiResponse<Page<SalesDto.ListItem>> list(
            @RequestParam(required = false) LocalDate startDate,
            @RequestParam(required = false) LocalDate endDate,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        SalesDto.SearchCondition cond = SalesDto.SearchCondition.builder()
            .startDate(startDate).endDate(endDate)
            .departmentId(departmentId).keyword(keyword)
            .page(page).size(size).build();
        return ApiResponse.success(salesService.list(cond));
    }

    @Operation(summary = "매출 등록")
    @PostMapping
    public ApiResponse<Void> create(@RequestBody SalesDto.CreateRequest request) {
        // TODO: extract userId from SecurityContext
        salesService.create(request, /* userId */ null);
        return ApiResponse.success(null);
    }

    @Operation(summary = "매출 확정")
    @PatchMapping("/{id}/confirm")
    public ApiResponse<Void> confirm(@PathVariable Long id) {
        salesService.confirm(id, /* userId */ null);
        return ApiResponse.success(null);
    }

    @Operation(summary = "매출 이력 조회")
    @GetMapping("/{id}/audit-logs")
    public ApiResponse<List<SalesDto.AuditLogItem>> auditLogs(@PathVariable Long id) {
        return ApiResponse.success(salesService.getAuditLogs(id));
    }

    @Operation(summary = "매출 엑셀 다운로드")
    @GetMapping("/export")
    public ResponseEntity<byte[]> export(
            @RequestParam(required = false) LocalDate startDate,
            @RequestParam(required = false) LocalDate endDate,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) String keyword) {
        SalesDto.SearchCondition cond = SalesDto.SearchCondition.builder()
            .startDate(startDate).endDate(endDate)
            .departmentId(departmentId).keyword(keyword)
            .page(0).size(Integer.MAX_VALUE).build();
        byte[] bytes = salesService.exportExcel(cond);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
        headers.setContentDisposition(ContentDisposition.attachment().filename("sales.xlsx").build());
        return new ResponseEntity<>(bytes, headers, HttpStatus.OK);
    }

    // --- Card Sales endpoints ---

    @Operation(summary = "카드매출 목록")
    @GetMapping("/card")
    public ApiResponse<Page<SalesDto.CardSalesListItem>> cardList(
            @RequestParam(required = false) LocalDate startDate,
            @RequestParam(required = false) LocalDate endDate,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        // Same pattern: build condition, delegate to service
        return ApiResponse.success(null); // TODO: wire cardSalesQueryRepository
    }

    @Operation(summary = "카드매출 엑셀")
    @GetMapping("/card/export")
    public ResponseEntity<byte[]> cardExport(
            @RequestParam(required = false) LocalDate startDate,
            @RequestParam(required = false) LocalDate endDate,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) String keyword) {
        // Same export pattern
        return ResponseEntity.ok(new byte[0]); // TODO
    }
}
```

- [ ] **2.9** Verify: `./gradlew compileJava`

### Acceptance Criteria
- GET `/api/sales` returns paginated, filtered list with order/company joins
- POST `/api/sales` creates Sales + audit log (+ CardSales if card info provided per Spec 12.8)
- PATCH `/api/sales/{id}/confirm` sets confirmed=true, writes CONFIRMED audit log
- GET `/api/sales/{id}/audit-logs` returns change history
- Soft-deleted records excluded

---

## Task 3: 선매출 Backend - PreSales + PreSalesDeduction

> PreSales(remaining_amount), PreSalesDeduction, Service(create/deduct with validation), Controller.
> Key: 1:N partial deduction. remaining_amount = amount - SUM(deductions).

**Files:**
- `sm-module-api/src/main/java/com/tara/sm/sales/entity/PreSales.java`
- `sm-module-api/src/main/java/com/tara/sm/sales/entity/PreSalesDeduction.java`
- `sm-module-api/src/main/java/com/tara/sm/sales/dto/PreSalesDto.java`
- `sm-module-api/src/main/java/com/tara/sm/sales/repository/PreSales*Repository.java`
- `sm-module-api/src/main/java/com/tara/sm/sales/service/PreSalesService.java`
- `sm-module-api/src/main/java/com/tara/sm/sales/controller/PreSalesController.java`

### Steps

- [ ] **3.1** Entity: `PreSales.java`

```java
package com.tara.sm.sales.entity;

import com.tara.sm.common.audit.BaseEntity;
import jakarta.persistence.*;
import lombok.*;
import java.util.ArrayList;
import java.util.List;

@Entity @Table(name = "pre_sales")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
public class PreSales extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pre_sales_no", nullable = false, unique = true, length = 30)
    private String preSalesNo;

    @Column(name = "department_id")
    private Long departmentId;

    @Column(name = "manager_id")
    private Long managerId;

    @Column(name = "business_owner_id")
    private Long businessOwnerId;

    @Column(name = "customer_id")
    private Long customerId;

    @Column(name = "amount", nullable = false) @Builder.Default
    private Long amount = 0L;

    /** 잔여금액: amount - SUM(deductions.deducted_amount) */
    @Column(name = "remaining_amount", nullable = false) @Builder.Default
    private Long remainingAmount = 0L;

    @Column(name = "payment_type", length = 30)
    private String paymentType;

    @Enumerated(EnumType.STRING)
    @Column(name = "tax_type") @Builder.Default
    private TaxType taxType = TaxType.TAXABLE;

    @Column(name = "note", columnDefinition = "TEXT")
    private String note;

    @Column(name = "registered_by")
    private Long registeredBy;

    @Column(name = "deleted") @Builder.Default
    private Boolean deleted = false;

    @OneToMany(mappedBy = "preSales", cascade = CascadeType.ALL)
    @Builder.Default
    private List<PreSalesDeduction> deductions = new ArrayList<>();

    public enum TaxType { TAXABLE, ZERO_RATE, EXEMPT }

    /** 차감 실행. 잔여금액 부족 시 예외. */
    public void deduct(long deductAmount) {
        if (deductAmount <= 0) throw new IllegalArgumentException("차감금액은 0보다 커야 합니다.");
        if (deductAmount > this.remainingAmount)
            throw new IllegalStateException("잔여금액(" + remainingAmount + ") 부족. 요청: " + deductAmount);
        this.remainingAmount -= deductAmount;
    }
}
```

- [ ] **3.2** Entity: `PreSalesDeduction.java`

```java
package com.tara.sm.sales.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity @Table(name = "pre_sales_deductions")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
public class PreSalesDeduction {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pre_sales_id", nullable = false)
    private PreSales preSales;

    @Column(name = "order_id", nullable = false)
    private Long orderId;

    @Column(name = "deducted_amount", nullable = false)
    private Long deductedAmount;

    @Column(name = "note", columnDefinition = "TEXT")
    private String note;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "created_by")
    private Long createdBy;

    @PrePersist
    protected void onCreate() { this.createdAt = LocalDateTime.now(); }
}
```

- [ ] **3.3** DTOs: `PreSalesDto.java`

```java
package com.tara.sm.sales.dto;

import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class PreSalesDto {

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class CreateRequest {
        private Long departmentId;
        private Long businessOwnerId;
        private Long customerId;
        private Long amount;
        private String paymentType;
        private String taxType;  // TAXABLE | ZERO_RATE | EXEMPT
        private String note;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class DeductRequest {
        private Long preSalesId;
        private Long orderId;
        private Long deductedAmount;
        private String note;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class SearchCondition {
        private LocalDate startDate;
        private LocalDate endDate;
        private Long departmentId;
        private String keyword;
        private int page;
        private int size;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class ListItem {
        private Long id;
        private String preSalesNo;
        private LocalDateTime createdAt;
        private String departmentName;
        private String managerName;
        private String businessOwnerName;
        private String bizNo;
        private String customerName;
        private Long amount;
        private Long remainingAmount;
        private String note;
        private String paymentType;
        private List<DeductionItem> deductions;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class DeductionItem {
        private Long id;
        private Long orderId;
        private String orderNo;
        private Long deductedAmount;
        private LocalDateTime createdAt;
    }
}
```

- [ ] **3.4** Repositories

```java
// PreSalesRepository.java
package com.tara.sm.sales.repository;

import com.tara.sm.sales.entity.PreSales;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PreSalesRepository extends JpaRepository<PreSales, Long> {
    boolean existsByPreSalesNo(String preSalesNo);
}

// PreSalesDeductionRepository.java
package com.tara.sm.sales.repository;

import com.tara.sm.sales.entity.PreSalesDeduction;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface PreSalesDeductionRepository extends JpaRepository<PreSalesDeduction, Long> {
    List<PreSalesDeduction> findByPreSalesId(Long preSalesId);
}
```

- [ ] **3.5** Service: `PreSalesService.java`

```java
package com.tara.sm.sales.service;

import com.tara.sm.common.exception.BusinessException;
import com.tara.sm.common.util.SequenceNumberGenerator;
import com.tara.sm.sales.dto.PreSalesDto;
import com.tara.sm.sales.entity.*;
import com.tara.sm.sales.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PreSalesService {

    private final PreSalesRepository preSalesRepository;
    private final PreSalesDeductionRepository deductionRepository;
    private final PreSalesQueryRepository preSalesQueryRepository;
    private final SequenceNumberGenerator seqGenerator;

    public Page<PreSalesDto.ListItem> list(PreSalesDto.SearchCondition cond) {
        return preSalesQueryRepository.search(cond, PageRequest.of(cond.getPage(), cond.getSize()));
    }

    /** 선매출 등록. 번호채번: PS{YYMMDD}-{5자리}. remaining_amount = amount. */
    @Transactional
    public PreSales create(PreSalesDto.CreateRequest req, Long userId) {
        String no = seqGenerator.generatePreSalesNo(); // PS260303-00001

        PreSales ps = PreSales.builder()
            .preSalesNo(no)
            .departmentId(req.getDepartmentId())
            .businessOwnerId(req.getBusinessOwnerId())
            .customerId(req.getCustomerId())
            .amount(req.getAmount())
            .remainingAmount(req.getAmount()) // 초기 잔여 = 전체 금액
            .paymentType(req.getPaymentType())
            .taxType(req.getTaxType() != null
                ? PreSales.TaxType.valueOf(req.getTaxType())
                : PreSales.TaxType.TAXABLE)
            .note(req.getNote())
            .registeredBy(userId)
            .build();

        return preSalesRepository.save(ps);
    }

    /**
     * 선매출 차감 (1:N).
     * - 잔여금액 검증 후 PreSalesDeduction 생성
     * - PreSales.remaining_amount 차감
     */
    @Transactional
    public PreSalesDeduction deduct(PreSalesDto.DeductRequest req, Long userId) {
        PreSales ps = preSalesRepository.findById(req.getPreSalesId())
            .filter(p -> !p.getDeleted())
            .orElseThrow(() -> new BusinessException("PRESALES_NOT_FOUND", "선매출을 찾을 수 없습니다."));

        ps.deduct(req.getDeductedAmount()); // validates remaining >= deductAmount

        PreSalesDeduction deduction = PreSalesDeduction.builder()
            .preSales(ps)
            .orderId(req.getOrderId())
            .deductedAmount(req.getDeductedAmount())
            .note(req.getNote())
            .createdBy(userId)
            .build();

        return deductionRepository.save(deduction);
    }

    // exportExcel: same pattern as SalesService
}
```

- [ ] **3.6** Controller: `PreSalesController.java`

```java
package com.tara.sm.sales.controller;

import com.tara.sm.common.dto.ApiResponse;
import com.tara.sm.sales.dto.PreSalesDto;
import com.tara.sm.sales.service.PreSalesService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;

@Tag(name = "Sales - 선매출")
@RestController
@RequestMapping("/api/sales/pre")
@RequiredArgsConstructor
public class PreSalesController {

    private final PreSalesService preSalesService;

    @Operation(summary = "선매출 목록")
    @GetMapping
    public ApiResponse<Page<PreSalesDto.ListItem>> list(
            @RequestParam(required = false) LocalDate startDate,
            @RequestParam(required = false) LocalDate endDate,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        PreSalesDto.SearchCondition cond = PreSalesDto.SearchCondition.builder()
            .startDate(startDate).endDate(endDate)
            .departmentId(departmentId).keyword(keyword)
            .page(page).size(size).build();
        return ApiResponse.success(preSalesService.list(cond));
    }

    @Operation(summary = "선매출 등록")
    @PostMapping
    public ApiResponse<Void> create(@RequestBody PreSalesDto.CreateRequest request) {
        preSalesService.create(request, null); // TODO: userId from SecurityContext
        return ApiResponse.success(null);
    }

    @Operation(summary = "선매출 차감 (1:N)")
    @PostMapping("/deduct")
    public ApiResponse<Void> deduct(@RequestBody PreSalesDto.DeductRequest request) {
        preSalesService.deduct(request, null);
        return ApiResponse.success(null);
    }

    @Operation(summary = "선매출 엑셀")
    @GetMapping("/export")
    public void export() { /* same pattern as SalesController.export */ }
}
```

- [ ] **3.7** Verify: `./gradlew compileJava`

### Acceptance Criteria
- POST `/api/sales/pre` creates PreSales with auto-numbered PS{YYMMDD}-{seq}, remaining_amount = amount
- POST `/api/sales/pre/deduct` creates deduction, decrements remaining_amount
- Deduction rejected if deductedAmount > remainingAmount
- GET list shows deductions per pre_sales record
- Soft-delete: only deletable when no deductions linked (Spec 12.3)

---

## Task 4: 비대면주문/정산 Backend

> UntactOrder, UntactSettlement entities, Service, Controller. untact sub-package.

**Files:**
- `sm-module-api/src/main/java/com/tara/sm/sales/untact/entity/UntactOrder.java`
- `sm-module-api/src/main/java/com/tara/sm/sales/untact/entity/UntactSettlement.java`
- `sm-module-api/src/main/java/com/tara/sm/sales/untact/dto/UntactDto.java`
- `sm-module-api/src/main/java/com/tara/sm/sales/untact/repository/Untact*Repository.java`
- `sm-module-api/src/main/java/com/tara/sm/sales/untact/service/UntactService.java`
- `sm-module-api/src/main/java/com/tara/sm/sales/untact/controller/UntactController.java`

### Steps

- [ ] **4.1** Entity: `UntactOrder.java`

```java
package com.tara.sm.sales.untact.entity;

import com.tara.sm.common.audit.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

@Entity @Table(name = "untact_orders")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
public class UntactOrder extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "untact_no", nullable = false, unique = true, length = 30)
    private String untactNo;

    @Column(name = "order_id")       private Long orderId;
    @Column(name = "department_id")  private Long departmentId;
    @Column(name = "manager_id")     private Long managerId;
    @Column(name = "business_owner_id") private Long businessOwnerId;
    @Column(name = "customer_id")    private Long customerId;
    @Column(name = "amount", nullable = false) @Builder.Default private Long amount = 0L;
    @Column(name = "work_name", length = 200) private String workName;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_status") @Builder.Default
    private PaymentStatus paymentStatus = PaymentStatus.PENDING;

    @Column(name = "payment_code", length = 30) private String paymentCode;
    @Column(name = "deleted") @Builder.Default private Boolean deleted = false;

    public enum PaymentStatus { PENDING, COMPLETED }

    public void markPaymentCompleted(String code) {
        this.paymentStatus = PaymentStatus.COMPLETED;
        this.paymentCode = code;
    }
}
```

- [ ] **4.2** Entity: `UntactSettlement.java`

```java
package com.tara.sm.sales.untact.entity;

import com.tara.sm.common.audit.BaseEntity;
import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity @Table(name = "untact_settlements")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
public class UntactSettlement extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "merchant_id", length = 30)     private String merchantId;
    @Column(name = "branch", length = 50)           private String branch;
    @Column(name = "untact_order_id")               private Long untactOrderId;
    @Column(name = "approval_datetime")             private LocalDateTime approvalDatetime;
    @Column(name = "approval_no", length = 30)      private String approvalNo;
    @Column(name = "payment_method", length = 20)   private String paymentMethod;
    @Column(name = "payment_amount") @Builder.Default  private Long paymentAmount = 0L;
    @Column(name = "supply_price") @Builder.Default    private Long supplyPrice = 0L;
    @Column(name = "vat") @Builder.Default             private Long vat = 0L;
    @Column(name = "payment_fee") @Builder.Default     private Long paymentFee = 0L;
    @Column(name = "refund_fee") @Builder.Default      private Long refundFee = 0L;
    @Column(name = "payout_amount") @Builder.Default   private Long payoutAmount = 0L;
    @Column(name = "payout_date")                      private LocalDate payoutDate;
    @Column(name = "deleted") @Builder.Default         private Boolean deleted = false;
}
```

- [ ] **4.3** DTOs: `UntactDto.java`

```java
package com.tara.sm.sales.untact.dto;

import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class UntactDto {

    // --- UntactOrder ---
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class OrderCreateRequest {
        private Long orderId;
        private Long departmentId;
        private Long managerId;
        private Long businessOwnerId;
        private Long customerId;
        private Long amount;
        private String workName;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class PaymentRequest {
        private List<Long> orderIds; // untact_order IDs to mark as paid
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class OrderSearchCondition {
        private Long departmentId;
        private LocalDate startDate;
        private LocalDate endDate;
        private String keyword;
        private int page;
        private int size;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class OrderListItem {
        private Long id;
        private String untactNo;
        private String orderNo;
        private LocalDateTime createdAt;
        private String departmentName;
        private String managerName;
        private String businessOwnerName;
        private String customerName;
        private Long amount;
        private String workName;
        private String paymentStatus;
        private String paymentCode;
    }

    // --- UntactSettlement ---
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class SettlementSearchCondition {
        private String branch;
        private LocalDate startDate;
        private LocalDate endDate;
        private String keyword;
        private int page;
        private int size;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class SettlementListItem {
        private Long id;
        private String merchantId;
        private String branch;
        private Long untactOrderId;
        private LocalDateTime approvalDatetime;
        private String approvalNo;
        private String paymentMethod;
        private Long paymentAmount;
        private Long supplyPrice;
        private Long vat;
        private Long paymentFee;
        private Long refundFee;
        private Long payoutAmount;
        private LocalDate payoutDate;
    }

    /** 합계행 응답 */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class SettlementSummary {
        private int totalCount;
        private Long totalPaymentAmount;
        private Long totalSupplyPrice;
        private Long totalVat;
        private Long totalPaymentFee;
        private Long totalRefundFee;
        private Long totalPayoutAmount;
    }
}
```

- [ ] **4.4** Service: `UntactService.java`

```java
package com.tara.sm.sales.untact.service;

import com.tara.sm.common.exception.BusinessException;
import com.tara.sm.common.util.SequenceNumberGenerator;
import com.tara.sm.sales.untact.dto.UntactDto;
import com.tara.sm.sales.untact.entity.UntactOrder;
import com.tara.sm.sales.untact.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UntactService {

    private final UntactOrderRepository orderRepository;
    private final UntactOrderQueryRepository orderQueryRepository;
    private final UntactSettlementQueryRepository settlementQueryRepository;
    private final SequenceNumberGenerator seqGenerator;

    public Page<UntactDto.OrderListItem> listOrders(UntactDto.OrderSearchCondition cond) {
        return orderQueryRepository.search(cond, PageRequest.of(cond.getPage(), cond.getSize()));
    }

    @Transactional
    public UntactOrder createOrder(UntactDto.OrderCreateRequest req) {
        String untactNo = seqGenerator.generateUntactNo(req.getDepartmentId());
        // Un{YYMMDD}-{부서코드4자리}-{일련번호5자리}
        return orderRepository.save(UntactOrder.builder()
            .untactNo(untactNo)
            .orderId(req.getOrderId())
            .departmentId(req.getDepartmentId())
            .managerId(req.getManagerId())
            .businessOwnerId(req.getBusinessOwnerId())
            .customerId(req.getCustomerId())
            .amount(req.getAmount())
            .workName(req.getWorkName())
            .build());
    }

    /** 비대면결제 일괄 등록: 체크된 주문들 PENDING -> COMPLETED */
    @Transactional
    public void markPaymentCompleted(List<Long> untactOrderIds) {
        for (Long id : untactOrderIds) {
            UntactOrder order = orderRepository.findById(id)
                .filter(o -> !o.getDeleted())
                .orElseThrow(() -> new BusinessException("UNTACT_NOT_FOUND", "비대면주문 없음: " + id));
            if (order.getPaymentStatus() == UntactOrder.PaymentStatus.COMPLETED) continue;
            order.markPaymentCompleted(null); // paymentCode set externally if needed
        }
    }

    public Page<UntactDto.SettlementListItem> listSettlements(UntactDto.SettlementSearchCondition cond) {
        return settlementQueryRepository.search(cond, PageRequest.of(cond.getPage(), cond.getSize()));
    }

    /** 합계행 계산 */
    public UntactDto.SettlementSummary getSettlementSummary(UntactDto.SettlementSearchCondition cond) {
        return settlementQueryRepository.summarize(cond);
    }
}
```

- [ ] **4.5** Controller: `UntactController.java`

```java
package com.tara.sm.sales.untact.controller;

import com.tara.sm.common.dto.ApiResponse;
import com.tara.sm.sales.untact.dto.UntactDto;
import com.tara.sm.sales.untact.service.UntactService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;

@Tag(name = "Sales - 비대면주문/정산")
@RestController
@RequestMapping("/api/sales/untact")
@RequiredArgsConstructor
public class UntactController {

    private final UntactService untactService;

    @GetMapping
    @Operation(summary = "비대면주문 목록")
    public ApiResponse<Page<UntactDto.OrderListItem>> listOrders(
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) LocalDate startDate,
            @RequestParam(required = false) LocalDate endDate,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.success(untactService.listOrders(
            UntactDto.OrderSearchCondition.builder()
                .departmentId(departmentId).startDate(startDate).endDate(endDate)
                .keyword(keyword).page(page).size(size).build()));
    }

    @PostMapping
    @Operation(summary = "비대면주문 등록")
    public ApiResponse<Void> createOrder(@RequestBody UntactDto.OrderCreateRequest req) {
        untactService.createOrder(req);
        return ApiResponse.success(null);
    }

    @PostMapping("/payment")
    @Operation(summary = "비대면결제 일괄 등록")
    public ApiResponse<Void> markPayment(@RequestBody UntactDto.PaymentRequest req) {
        untactService.markPaymentCompleted(req.getOrderIds());
        return ApiResponse.success(null);
    }

    @GetMapping("/settlement")
    @Operation(summary = "비대면정산 목록 (+ 합계)")
    public ApiResponse<Page<UntactDto.SettlementListItem>> listSettlements(
            @RequestParam(required = false) String branch,
            @RequestParam(required = false) LocalDate startDate,
            @RequestParam(required = false) LocalDate endDate,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.success(untactService.listSettlements(
            UntactDto.SettlementSearchCondition.builder()
                .branch(branch).startDate(startDate).endDate(endDate)
                .keyword(keyword).page(page).size(size).build()));
    }

    @GetMapping("/settlement/summary")
    @Operation(summary = "비대면정산 합계")
    public ApiResponse<UntactDto.SettlementSummary> settlementSummary(
            @RequestParam(required = false) String branch,
            @RequestParam(required = false) LocalDate startDate,
            @RequestParam(required = false) LocalDate endDate,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.success(untactService.getSettlementSummary(
            UntactDto.SettlementSearchCondition.builder()
                .branch(branch).startDate(startDate).endDate(endDate)
                .keyword(keyword).page(0).size(0).build()));
    }

    // export endpoints: same pattern as SalesController
    @GetMapping("/export") @Operation(summary = "비대면주문 엑셀")
    public void exportOrders() { /* same pattern */ }

    @GetMapping("/settlement/export") @Operation(summary = "비대면정산 엑셀")
    public void exportSettlements() { /* same pattern */ }
}
```

- [ ] **4.6** QueryDSL repositories (UntactOrderQueryRepository, UntactSettlementQueryRepository) - same search pattern as SalesQueryRepository. Settlement summary uses `.select(Projections.bean(SettlementSummary.class, s.count(), s.paymentAmount.sum(), ...))`.
- [ ] **4.7** Verify: `./gradlew compileJava`

### Acceptance Criteria
- POST `/api/sales/untact` creates with auto-generated Un{YYMMDD}-{deptCode}-{seq}
- POST `/api/sales/untact/payment` bulk-marks orders as COMPLETED
- GET `/api/sales/untact/settlement/summary` returns aggregate totals
- Soft-delete: untact_orders deletable only when PENDING (Spec 12.3)

---

## Task 5: 매출목록 Frontend - SalesListPage.tsx

> Search (date+dept+keyword) + DataTable + confirm button + audit log modal + excel

**Files:**
- `sm-module-web/src/api/sales.api.ts`
- `sm-module-web/src/types/sales.ts`
- `sm-module-web/src/pages/sales/SalesListPage.tsx`

### Steps

- [ ] **5.1** API layer: `sales.api.ts`

```typescript
import { client } from './client';
import type { ApiResponse, PageResponse } from '../types/common';
import type {
  SalesListItem, SalesSearchParams, SalesAuditLogItem,
  CardSalesListItem, CardSalesSearchParams,
  PreSalesListItem, PreSalesSearchParams, PreSalesCreateRequest, PreSalesDeductRequest,
  UntactOrderListItem, UntactOrderSearchParams, UntactOrderCreateRequest,
  UntactSettlementListItem, UntactSettlementSearchParams, UntactSettlementSummary,
} from '../types/sales';

export const salesApi = {
  list: (params: SalesSearchParams) =>
    client.get<ApiResponse<PageResponse<SalesListItem>>>('/api/sales', { params }).then(r => r.data),
  create: (data: any) =>
    client.post<ApiResponse<void>>('/api/sales', data).then(r => r.data),
  confirm: (id: number) =>
    client.patch<ApiResponse<void>>(`/api/sales/${id}/confirm`).then(r => r.data),
  auditLogs: (id: number) =>
    client.get<ApiResponse<SalesAuditLogItem[]>>(`/api/sales/${id}/audit-logs`).then(r => r.data),
  export: (params: SalesSearchParams) =>
    client.get('/api/sales/export', { params, responseType: 'blob' }),
};

export const cardSalesApi = {
  list: (params: CardSalesSearchParams) =>
    client.get<ApiResponse<PageResponse<CardSalesListItem>>>('/api/sales/card', { params }).then(r => r.data),
  export: (params: CardSalesSearchParams) =>
    client.get('/api/sales/card/export', { params, responseType: 'blob' }),
};

export const preSalesApi = {
  list: (params: PreSalesSearchParams) =>
    client.get<ApiResponse<PageResponse<PreSalesListItem>>>('/api/sales/pre', { params }).then(r => r.data),
  create: (data: PreSalesCreateRequest) =>
    client.post<ApiResponse<void>>('/api/sales/pre', data).then(r => r.data),
  deduct: (data: PreSalesDeductRequest) =>
    client.post<ApiResponse<void>>('/api/sales/pre/deduct', data).then(r => r.data),
  export: (params: PreSalesSearchParams) =>
    client.get('/api/sales/pre/export', { params, responseType: 'blob' }),
};

export const untactApi = {
  listOrders: (params: UntactOrderSearchParams) =>
    client.get<ApiResponse<PageResponse<UntactOrderListItem>>>('/api/sales/untact', { params }).then(r => r.data),
  createOrder: (data: UntactOrderCreateRequest) =>
    client.post<ApiResponse<void>>('/api/sales/untact', data).then(r => r.data),
  markPayment: (orderIds: number[]) =>
    client.post<ApiResponse<void>>('/api/sales/untact/payment', { orderIds }).then(r => r.data),
  listSettlements: (params: UntactSettlementSearchParams) =>
    client.get<ApiResponse<PageResponse<UntactSettlementListItem>>>('/api/sales/untact/settlement', { params }).then(r => r.data),
  settlementSummary: (params: UntactSettlementSearchParams) =>
    client.get<ApiResponse<UntactSettlementSummary>>('/api/sales/untact/settlement/summary', { params }).then(r => r.data),
  exportOrders: (params: UntactOrderSearchParams) =>
    client.get('/api/sales/untact/export', { params, responseType: 'blob' }),
  exportSettlements: (params: UntactSettlementSearchParams) =>
    client.get('/api/sales/untact/settlement/export', { params, responseType: 'blob' }),
};
```

- [ ] **5.2** Types: `sales.ts`

```typescript
export interface SalesListItem {
  id: number; orderId: number; orderNo: string; orderTitle: string;
  companyName: string; customerName: string; salesDate: string;
  amount: number; confirmed: boolean; confirmedAt: string; departmentName: string;
}
export interface SalesSearchParams {
  startDate?: string; endDate?: string; departmentId?: number;
  keyword?: string; page?: number; size?: number;
}
export interface SalesAuditLogItem {
  id: number; action: string; changedField: string;
  oldValue: string; newValue: string; changedByName: string;
  changedAt: string; note: string;
}
export interface CardSalesListItem {
  id: number; branch: string; orderNo: string; orderTitle: string;
  salesDate: string; cardCompany: string; cardNo: string;
  approvalNo: string; amount: number; salesTime: string;
}
export type CardSalesSearchParams = SalesSearchParams;

export interface PreSalesListItem {
  id: number; preSalesNo: string; createdAt: string;
  departmentName: string; managerName: string;
  businessOwnerName: string; bizNo: string; customerName: string;
  amount: number; remainingAmount: number; note: string; paymentType: string;
  deductions: Array<{ id: number; orderId: number; orderNo: string; deductedAmount: number; createdAt: string }>;
}
export type PreSalesSearchParams = SalesSearchParams;
export interface PreSalesCreateRequest {
  departmentId: number; businessOwnerId: number; customerId?: number;
  amount: number; paymentType?: string; taxType?: string; note?: string;
}
export interface PreSalesDeductRequest {
  preSalesId: number; orderId: number; deductedAmount: number; note?: string;
}

export interface UntactOrderListItem {
  id: number; untactNo: string; orderNo: string; createdAt: string;
  departmentName: string; managerName: string; businessOwnerName: string;
  customerName: string; amount: number; workName: string;
  paymentStatus: string; paymentCode: string;
}
export interface UntactOrderSearchParams {
  departmentId?: number; startDate?: string; endDate?: string;
  keyword?: string; page?: number; size?: number;
}
export interface UntactOrderCreateRequest {
  orderId: number; departmentId: number; managerId: number;
  businessOwnerId: number; customerId?: number; amount: number; workName?: string;
}
export interface UntactSettlementListItem {
  id: number; merchantId: string; branch: string; untactOrderId: number;
  approvalDatetime: string; approvalNo: string; paymentMethod: string;
  paymentAmount: number; supplyPrice: number; vat: number;
  paymentFee: number; refundFee: number; payoutAmount: number; payoutDate: string;
}
export interface UntactSettlementSearchParams {
  branch?: string; startDate?: string; endDate?: string;
  keyword?: string; page?: number; size?: number;
}
export interface UntactSettlementSummary {
  totalCount: number; totalPaymentAmount: number; totalSupplyPrice: number;
  totalVat: number; totalPaymentFee: number; totalRefundFee: number; totalPayoutAmount: number;
}
```

- [ ] **5.3** Page: `SalesListPage.tsx`

```tsx
import React, { useMemo, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, DatePicker, Input, Select, Space, Table, Tag, Modal, message } from 'antd';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';

import PageLayout from '../../components/layout/PageLayout';
import { salesApi } from '../../api/sales.api';
import type { SalesListItem, SalesSearchParams, SalesAuditLogItem } from '../../types/sales';
import { useDepartments } from '../../hooks/useDepartments';
import { formatAmount, downloadBlob } from '../../utils/format';

const { RangePicker } = DatePicker;

const SalesListPage: React.FC = () => {
  const queryClient = useQueryClient();

  // --- Search state ---
  const [departmentId, setDepartmentId] = useState<number>();
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);

  // --- Audit log modal ---
  const [auditModal, setAuditModal] = useState<{ visible: boolean; salesId: number | null }>({
    visible: false, salesId: null,
  });

  const { departments } = useDepartments();

  const searchParams: SalesSearchParams = useMemo(() => ({
    departmentId, keyword: keyword || undefined,
    startDate: dateRange[0]?.format('YYYY-MM-DD'),
    endDate: dateRange[1]?.format('YYYY-MM-DD'),
    page, size: pageSize,
  }), [departmentId, dateRange, keyword, page, pageSize]);

  const { data, isLoading } = useQuery({
    queryKey: ['sales', searchParams],
    queryFn: () => salesApi.list(searchParams),
  });

  const { data: auditLogs } = useQuery({
    queryKey: ['sales-audit', auditModal.salesId],
    queryFn: () => salesApi.auditLogs(auditModal.salesId!),
    enabled: !!auditModal.salesId,
  });

  const confirmMutation = useMutation({
    mutationFn: (id: number) => salesApi.confirm(id),
    onSuccess: () => {
      message.success('매출이 확정되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['sales'] });
    },
  });

  const handleExport = useCallback(async () => {
    const res = await salesApi.export(searchParams);
    downloadBlob(res.data, 'sales.xlsx');
  }, [searchParams]);

  const columns: ColumnsType<SalesListItem> = useMemo(() => [
    { title: '#', key: 'idx', width: 50, align: 'center',
      render: (_, __, i) => page * pageSize + i + 1 },
    { title: '주문번호/제목', key: 'order',
      render: (_, r) => <>{r.orderNo}<br/><small>{r.orderTitle}</small></> },
    { title: '회사명', dataIndex: 'companyName', width: 140 },
    { title: '고객명', dataIndex: 'customerName', width: 100 },
    { title: '금액', dataIndex: 'amount', width: 120, align: 'right',
      render: (v: number) => formatAmount(v) },
    { title: '매출확정', key: 'confirm', width: 100, align: 'center',
      render: (_, r) => r.confirmed
        ? <Tag color="green">확정</Tag>
        : <Button size="small" type="primary"
            onClick={() => confirmMutation.mutate(r.id)}>확정</Button>,
    },
    { title: '이력', key: 'audit', width: 80, align: 'center',
      render: (_, r) => <Button size="small"
        onClick={() => setAuditModal({ visible: true, salesId: r.id })}>보기</Button>,
    },
  ], [page, pageSize, confirmMutation]);

  const pageData = data?.data;

  return (
    <PageLayout title="매출목록" breadcrumb={['매출관리', '매출목록']}>
      {/* Search bar */}
      <Space wrap style={{ marginBottom: 16 }}>
        <RangePicker value={dateRange} onChange={(v) => setDateRange(v || [null, null])} />
        <Select placeholder="부서" allowClear style={{ width: 160 }}
          value={departmentId} onChange={setDepartmentId}
          options={departments?.map(d => ({ label: d.name, value: d.id }))} />
        <Input placeholder="거래처명, 회사명" style={{ width: 200 }}
          value={keyword} onChange={e => setKeyword(e.target.value)}
          onPressEnter={() => setPage(0)} />
        <Button icon={<SearchOutlined />} type="primary" onClick={() => setPage(0)}>검색</Button>
        <Button icon={<DownloadOutlined />} onClick={handleExport}>엑셀다운로드</Button>
      </Space>

      {/* Table */}
      <Table<SalesListItem>
        rowKey="id" columns={columns} loading={isLoading}
        dataSource={pageData?.content || []}
        pagination={{
          current: page + 1, pageSize, total: pageData?.totalElements || 0,
          onChange: (p) => setPage(p - 1), showSizeChanger: false,
        }}
      />

      {/* Audit log modal */}
      <Modal title="매출 변경 이력" open={auditModal.visible}
        onCancel={() => setAuditModal({ visible: false, salesId: null })} footer={null} width={600}>
        <Table<SalesAuditLogItem>
          rowKey="id" size="small" pagination={false}
          dataSource={auditLogs?.data || []}
          columns={[
            { title: '변경유형', dataIndex: 'action', width: 100 },
            { title: '변경일시', dataIndex: 'changedAt', width: 160 },
            { title: '변경자', dataIndex: 'changedByName', width: 100 },
            { title: '비고', dataIndex: 'note' },
          ]}
        />
      </Modal>
    </PageLayout>
  );
};

export default SalesListPage;
```

### Acceptance Criteria
- Date range + department + keyword filtering
- Confirm button calls PATCH, refreshes list, shows success tag
- Audit log modal fetches and displays history
- Excel download triggers blob download

---

## Task 6: 카드매출 Frontend - CardSalesPage.tsx

**Files:**
- `sm-module-web/src/pages/sales/CardSalesPage.tsx`

### Steps

- [ ] **6.1** Create `CardSalesPage.tsx`

```tsx
import React, { useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, DatePicker, Input, Select, Space, Table } from 'antd';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';

import PageLayout from '../../components/layout/PageLayout';
import { cardSalesApi } from '../../api/sales.api';
import type { CardSalesListItem, CardSalesSearchParams } from '../../types/sales';
import { useDepartments } from '../../hooks/useDepartments';
import { formatAmount, downloadBlob } from '../../utils/format';

const { RangePicker } = DatePicker;

const CardSalesPage: React.FC = () => {
  const [departmentId, setDepartmentId] = useState<number>();
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { departments } = useDepartments();

  const params: CardSalesSearchParams = useMemo(() => ({
    departmentId, keyword: keyword || undefined,
    startDate: dateRange[0]?.format('YYYY-MM-DD'),
    endDate: dateRange[1]?.format('YYYY-MM-DD'),
    page, size: pageSize,
  }), [departmentId, dateRange, keyword, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['card-sales', params],
    queryFn: () => cardSalesApi.list(params),
  });

  const handleExport = useCallback(async () => {
    const res = await cardSalesApi.export(params);
    downloadBlob(res.data, 'card-sales.xlsx');
  }, [params]);

  const columns: ColumnsType<CardSalesListItem> = [
    { title: '#', key: 'idx', width: 50, align: 'center', render: (_, __, i) => page * pageSize + i + 1 },
    { title: '지점명', dataIndex: 'branch', width: 100 },
    { title: '주문번호/제목', key: 'order',
      render: (_, r) => <>{r.orderNo}<br/><small>{r.orderTitle}</small></> },
    { title: '매출일자', dataIndex: 'salesDate', width: 110 },
    { title: '카드사', dataIndex: 'cardCompany', width: 100 },
    { title: '카드번호', dataIndex: 'cardNo', width: 140 },
    { title: '승인번호', dataIndex: 'approvalNo', width: 120 },
    { title: '금액', dataIndex: 'amount', width: 120, align: 'right', render: formatAmount },
    { title: '매출시간', dataIndex: 'salesTime', width: 160 },
  ];

  const pageData = data?.data;

  return (
    <PageLayout title="카드매출목록" breadcrumb={['매출관리', '카드매출목록']}>
      <Space wrap style={{ marginBottom: 16 }}>
        <RangePicker value={dateRange} onChange={(v) => setDateRange(v || [null, null])} />
        <Select placeholder="부서" allowClear style={{ width: 160 }}
          value={departmentId} onChange={setDepartmentId}
          options={departments?.map(d => ({ label: d.name, value: d.id }))} />
        <Input placeholder="키워드" style={{ width: 200 }}
          value={keyword} onChange={e => setKeyword(e.target.value)}
          onPressEnter={() => setPage(0)} />
        <Button icon={<SearchOutlined />} type="primary" onClick={() => setPage(0)}>검색</Button>
        <Button icon={<DownloadOutlined />} onClick={handleExport}>엑셀다운로드</Button>
      </Space>
      <Table<CardSalesListItem>
        rowKey="id" columns={columns} loading={isLoading}
        dataSource={pageData?.content || []}
        pagination={{
          current: page + 1, pageSize, total: pageData?.totalElements || 0,
          onChange: (p) => setPage(p - 1), showSizeChanger: false,
        }}
      />
    </PageLayout>
  );
};

export default CardSalesPage;
```

### Acceptance Criteria
- Same search pattern as SalesListPage
- Columns match Spec 6.6: 지점명, 주문번호/제목, 매출일자, 카드사, 카드번호, 승인번호, 금액, 매출시간

---

## Task 7: 선매출 Frontend - PreSalesListPage + PreSalesInputPage

**Files:**
- `sm-module-web/src/pages/sales/PreSalesListPage.tsx`
- `sm-module-web/src/pages/sales/PreSalesInputPage.tsx`

### Steps

- [ ] **7.1** `PreSalesListPage.tsx`

```tsx
import React, { useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, DatePicker, Input, Select, Space, Table } from 'antd';
import { DownloadOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';

import PageLayout from '../../components/layout/PageLayout';
import { preSalesApi } from '../../api/sales.api';
import type { PreSalesListItem, PreSalesSearchParams } from '../../types/sales';
import { useDepartments } from '../../hooks/useDepartments';
import { formatAmount, downloadBlob } from '../../utils/format';

const { RangePicker } = DatePicker;

const PreSalesListPage: React.FC = () => {
  const navigate = useNavigate();
  const [departmentId, setDepartmentId] = useState<number>();
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const { departments } = useDepartments();

  const params: PreSalesSearchParams = useMemo(() => ({
    departmentId, keyword: keyword || undefined,
    startDate: dateRange[0]?.format('YYYY-MM-DD'),
    endDate: dateRange[1]?.format('YYYY-MM-DD'),
    page, size: pageSize,
  }), [departmentId, dateRange, keyword, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['pre-sales', params],
    queryFn: () => preSalesApi.list(params),
  });

  const handleExport = useCallback(async () => {
    const res = await preSalesApi.export(params);
    downloadBlob(res.data, 'pre-sales.xlsx');
  }, [params]);

  // Spec 6.6: #, 선매출번호, 등록일자, 부서명, 부서담당자, 거래처명, 사업자번호, 거래처담당자, 금액, 차감주문번호, 비고, 결제구분
  const columns: ColumnsType<PreSalesListItem> = [
    { title: '#', key: 'idx', width: 50, align: 'center', render: (_, __, i) => page * pageSize + i + 1 },
    { title: '선매출번호', dataIndex: 'preSalesNo', width: 150 },
    { title: '등록일자', dataIndex: 'createdAt', width: 110, render: (v: string) => v?.slice(0, 10) },
    { title: '부서명', dataIndex: 'departmentName', width: 120 },
    { title: '부서담당자', dataIndex: 'managerName', width: 100 },
    { title: '거래처명', dataIndex: 'businessOwnerName', width: 140 },
    { title: '사업자번호', dataIndex: 'bizNo', width: 120 },
    { title: '거래처담당자', dataIndex: 'customerName', width: 100 },
    { title: '금액', dataIndex: 'amount', width: 120, align: 'right', render: formatAmount },
    { title: '잔여금액', dataIndex: 'remainingAmount', width: 120, align: 'right', render: formatAmount },
    { title: '차감주문', key: 'deductions', width: 140,
      render: (_, r) => r.deductions?.map(d => d.orderNo).join(', ') || '-' },
    { title: '비고', dataIndex: 'note', ellipsis: true },
    { title: '결제구분', dataIndex: 'paymentType', width: 100 },
  ];

  return (
    <PageLayout title="선매출목록" breadcrumb={['매출관리', '선매출목록']}>
      <Space wrap style={{ marginBottom: 16 }}>
        <RangePicker value={dateRange} onChange={(v) => setDateRange(v || [null, null])} />
        <Select placeholder="부서" allowClear style={{ width: 160 }}
          value={departmentId} onChange={setDepartmentId}
          options={departments?.map(d => ({ label: d.name, value: d.id }))} />
        <Input placeholder="키워드" style={{ width: 200 }}
          value={keyword} onChange={e => setKeyword(e.target.value)}
          onPressEnter={() => setPage(0)} />
        <Button icon={<SearchOutlined />} type="primary" onClick={() => setPage(0)}>검색</Button>
        <Button icon={<PlusOutlined />} onClick={() => navigate('/sales/pre/create')}>선매출 등록</Button>
        <Button icon={<DownloadOutlined />} onClick={handleExport}>엑셀다운로드</Button>
      </Space>
      <Table<PreSalesListItem>
        rowKey="id" columns={columns} loading={isLoading}
        dataSource={data?.data?.content || []} scroll={{ x: 1400 }}
        pagination={{
          current: page + 1, pageSize, total: data?.data?.totalElements || 0,
          onChange: (p) => setPage(p - 1),
        }}
      />
    </PageLayout>
  );
};

export default PreSalesListPage;
```

- [ ] **7.2** `PreSalesInputPage.tsx` (form with SearchPopup)

```tsx
import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button, Form, Input, InputNumber, Select, message } from 'antd';
import { useNavigate } from 'react-router-dom';

import PageLayout from '../../components/layout/PageLayout';
import SearchPopup from '../../components/common/SearchPopup'; // Phase 1 component
import { preSalesApi } from '../../api/sales.api';
import type { PreSalesCreateRequest } from '../../types/sales';
import { useDepartments } from '../../hooks/useDepartments';
import { useAuth } from '../../hooks/useAuth';

const TAX_TYPE_OPTIONS = [
  { label: '과세', value: 'TAXABLE' },
  { label: '영세', value: 'ZERO_RATE' },
  { label: '면세', value: 'EXEMPT' },
];

const PreSalesInputPage: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const { user } = useAuth();
  const { departments } = useDepartments();

  // SearchPopup state
  const [bizPopup, setBizPopup] = useState(false);
  const [custPopup, setCustPopup] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: PreSalesCreateRequest) => preSalesApi.create(data),
    onSuccess: () => {
      message.success('선매출이 등록되었습니다.');
      navigate('/sales/pre');
    },
    onError: () => message.error('등록에 실패했습니다.'),
  });

  const handleSubmit = (values: any) => {
    mutation.mutate({
      departmentId: values.departmentId,
      businessOwnerId: values.businessOwnerId,
      customerId: values.customerId,
      amount: values.amount,
      paymentType: values.paymentType,
      taxType: values.taxType,
      note: values.note,
    });
  };

  return (
    <PageLayout title="선매출입력" breadcrumb={['매출관리', '선매출입력']}>
      <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ maxWidth: 600 }}>
        <Form.Item label="영업부서" name="departmentId" rules={[{ required: true }]}>
          <Select options={departments?.map(d => ({ label: d.name, value: d.id }))} />
        </Form.Item>

        <Form.Item label="등록자명">
          <Input disabled value={user?.name || ''} />
        </Form.Item>

        {/* 영업거래처: SearchPopup */}
        <Form.Item label="영업거래처" name="businessOwnerId" rules={[{ required: true }]}>
          <Input readOnly placeholder="검색..." onClick={() => setBizPopup(true)}
            value={form.getFieldValue('businessOwnerName')} />
        </Form.Item>
        <SearchPopup type="businessOwner" visible={bizPopup}
          onClose={() => setBizPopup(false)}
          onSelect={(item) => {
            form.setFieldsValue({ businessOwnerId: item.id, businessOwnerName: item.name });
            setBizPopup(false);
          }} />

        {/* 영업담당자: SearchPopup */}
        <Form.Item label="영업담당자" name="customerId">
          <Input readOnly placeholder="검색..." onClick={() => setCustPopup(true)} />
        </Form.Item>
        <SearchPopup type="customer" visible={custPopup}
          onClose={() => setCustPopup(false)}
          onSelect={(item) => {
            form.setFieldsValue({ customerId: item.id });
            setCustPopup(false);
          }} />

        <Form.Item label="선매출액" name="amount" rules={[{ required: true }]}>
          <InputNumber style={{ width: '100%' }} min={1}
            formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={v => v!.replace(/,/g, '') as any} />
        </Form.Item>

        <Form.Item label="과세구분" name="taxType" initialValue="TAXABLE" rules={[{ required: true }]}>
          <Select options={TAX_TYPE_OPTIONS} />
        </Form.Item>

        <Form.Item label="비고" name="note">
          <Input.TextArea rows={3} />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={mutation.isPending}>저장</Button>
        </Form.Item>
      </Form>
    </PageLayout>
  );
};

export default PreSalesInputPage;
```

### Acceptance Criteria
- PreSalesListPage: columns match Spec 6.6, shows deduction order numbers
- PreSalesInputPage: form fields per Spec 6.6 table, SearchPopup for 거래처/담당자
- Create mutation navigates back to list on success
- Amount formatted with comma separator

---

## Task 8: 비대면 Frontend

> UntactOrderCreatePage (bulk checkbox), UntactOrderListPage, UntactSettlementPage (합계행)

**Files:**
- `sm-module-web/src/pages/sales/untact/UntactOrderCreatePage.tsx`
- `sm-module-web/src/pages/sales/untact/UntactOrderListPage.tsx`
- `sm-module-web/src/pages/sales/untact/UntactSettlementPage.tsx`

### Steps

- [ ] **8.1** `UntactOrderCreatePage.tsx` - bulk checkbox + "비대면결제 등록" button

```tsx
import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Table, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import PageLayout from '../../../components/layout/PageLayout';
import { untactApi } from '../../../api/sales.api';
import type { UntactOrderListItem } from '../../../types/sales';
import { formatAmount } from '../../../utils/format';

const UntactOrderCreatePage: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Fetch orders eligible for untact payment (PENDING only)
  const { data, isLoading } = useQuery({
    queryKey: ['untact-orders-pending'],
    queryFn: () => untactApi.listOrders({ page: 0, size: 999 }),
  });

  const paymentMutation = useMutation({
    mutationFn: (ids: number[]) => untactApi.markPayment(ids),
    onSuccess: () => {
      message.success('비대면결제가 등록되었습니다.');
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['untact-orders-pending'] });
    },
  });

  const handleBulkPayment = useCallback(() => {
    if (!selectedIds.length) { message.warning('주문을 선택해주세요.'); return; }
    paymentMutation.mutate(selectedIds);
  }, [selectedIds, paymentMutation]);

  // Spec 6.6: #, 지점명, 주문번호/제목, 회사명, 고객명, 주문금액, 미결제금액, 체크박스
  const columns: ColumnsType<UntactOrderListItem> = [
    { title: '#', key: 'idx', width: 50, align: 'center', render: (_, __, i) => i + 1 },
    { title: '지점명', dataIndex: 'departmentName', width: 120 },
    { title: '주문번호/제목', key: 'order',
      render: (_, r) => <>{r.orderNo}<br/><small>{r.workName}</small></> },
    { title: '회사명', dataIndex: 'businessOwnerName', width: 140 },
    { title: '고객명', dataIndex: 'customerName', width: 100 },
    { title: '금액', dataIndex: 'amount', width: 120, align: 'right', render: formatAmount },
    { title: '결제여부', dataIndex: 'paymentStatus', width: 100, align: 'center' },
  ];

  const pendingOrders = (data?.data?.content || []).filter(o => o.paymentStatus === 'PENDING');

  return (
    <PageLayout title="비대면주문 등록" breadcrumb={['매출관리', '비대면주문 등록']}
      extra={<Button type="primary" onClick={handleBulkPayment}
        loading={paymentMutation.isPending}>비대면결제 등록</Button>}>
      <Table<UntactOrderListItem>
        rowKey="id" columns={columns} loading={isLoading}
        dataSource={pendingOrders}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys as number[]),
        }}
        pagination={false}
      />
    </PageLayout>
  );
};

export default UntactOrderCreatePage;
```

- [ ] **8.2** `UntactOrderListPage.tsx`

```tsx
import React, { useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, DatePicker, Input, Select, Space, Table } from 'antd';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';

import PageLayout from '../../../components/layout/PageLayout';
import { untactApi } from '../../../api/sales.api';
import type { UntactOrderListItem, UntactOrderSearchParams } from '../../../types/sales';
import { useDepartments } from '../../../hooks/useDepartments';
import { formatAmount, downloadBlob } from '../../../utils/format';

const { RangePicker } = DatePicker;

const UntactOrderListPage: React.FC = () => {
  const [departmentId, setDepartmentId] = useState<number>();
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const { departments } = useDepartments();

  const params: UntactOrderSearchParams = useMemo(() => ({
    departmentId, keyword: keyword || undefined,
    startDate: dateRange[0]?.format('YYYY-MM-DD'),
    endDate: dateRange[1]?.format('YYYY-MM-DD'),
    page, size: pageSize,
  }), [departmentId, dateRange, keyword, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['untact-orders', params],
    queryFn: () => untactApi.listOrders(params),
  });

  const handleExport = useCallback(async () => {
    const res = await untactApi.exportOrders(params);
    downloadBlob(res.data, 'untact-orders.xlsx');
  }, [params]);

  // Spec 6.6 columns
  const columns: ColumnsType<UntactOrderListItem> = [
    { title: '비대면결제번호', dataIndex: 'untactNo', width: 180 },
    { title: '주문번호', dataIndex: 'orderNo', width: 160 },
    { title: '등록일자', dataIndex: 'createdAt', width: 110, render: (v: string) => v?.slice(0, 10) },
    { title: '영업담당부서', dataIndex: 'departmentName', width: 120 },
    { title: '영업담당자', dataIndex: 'managerName', width: 100 },
    { title: '거래처명', dataIndex: 'businessOwnerName', width: 140 },
    { title: '고객명', dataIndex: 'customerName', width: 100 },
    { title: '금액', dataIndex: 'amount', width: 120, align: 'right', render: formatAmount },
    { title: '작업명', dataIndex: 'workName', ellipsis: true },
    { title: '결제여부', dataIndex: 'paymentStatus', width: 100 },
    { title: '결제코드', dataIndex: 'paymentCode', width: 120 },
  ];

  return (
    <PageLayout title="비대면주문 목록" breadcrumb={['매출관리', '비대면주문 목록']}>
      <Space wrap style={{ marginBottom: 16 }}>
        <Select placeholder="영업담당부서" allowClear style={{ width: 160 }}
          value={departmentId} onChange={setDepartmentId}
          options={departments?.map(d => ({ label: d.name, value: d.id }))} />
        <RangePicker value={dateRange} onChange={v => setDateRange(v || [null, null])} />
        <Input placeholder="키워드" style={{ width: 200 }}
          value={keyword} onChange={e => setKeyword(e.target.value)} onPressEnter={() => setPage(0)} />
        <Button icon={<SearchOutlined />} type="primary" onClick={() => setPage(0)}>검색</Button>
        <Button icon={<DownloadOutlined />} onClick={handleExport}>엑셀다운로드</Button>
      </Space>
      <Table<UntactOrderListItem>
        rowKey="id" columns={columns} loading={isLoading}
        dataSource={data?.data?.content || []} scroll={{ x: 1500 }}
        pagination={{
          current: page + 1, pageSize, total: data?.data?.totalElements || 0,
          onChange: p => setPage(p - 1),
        }}
      />
    </PageLayout>
  );
};

export default UntactOrderListPage;
```

- [ ] **8.3** `UntactSettlementPage.tsx` (합계행)

```tsx
import React, { useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, DatePicker, Input, Select, Space, Table } from 'antd';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';

import PageLayout from '../../../components/layout/PageLayout';
import { untactApi } from '../../../api/sales.api';
import type { UntactSettlementListItem, UntactSettlementSearchParams } from '../../../types/sales';
import { formatAmount, downloadBlob } from '../../../utils/format';

const { RangePicker } = DatePicker;

const UntactSettlementPage: React.FC = () => {
  const [branch, setBranch] = useState<string>();
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const params: UntactSettlementSearchParams = useMemo(() => ({
    branch, keyword: keyword || undefined,
    startDate: dateRange[0]?.format('YYYY-MM-DD'),
    endDate: dateRange[1]?.format('YYYY-MM-DD'),
    page, size: pageSize,
  }), [branch, dateRange, keyword, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['untact-settlement', params],
    queryFn: () => untactApi.listSettlements(params),
  });

  const { data: summary } = useQuery({
    queryKey: ['untact-settlement-summary', params],
    queryFn: () => untactApi.settlementSummary(params),
  });

  const handleExport = useCallback(async () => {
    const res = await untactApi.exportSettlements(params);
    downloadBlob(res.data, 'untact-settlement.xlsx');
  }, [params]);

  // Spec 6.6: 가맹점ID, 지점/파트, 주문ID, 승인날짜시간, 승인번호, 결제수단,
  //           결제금액, 공급가, 부가세, 결제수수료, 환불수수료, 지급금액, 지급일자
  const columns: ColumnsType<UntactSettlementListItem> = [
    { title: '가맹점ID', dataIndex: 'merchantId', width: 120 },
    { title: '지점/파트', dataIndex: 'branch', width: 100 },
    { title: '주문ID', dataIndex: 'untactOrderId', width: 80 },
    { title: '승인날짜시간', dataIndex: 'approvalDatetime', width: 160 },
    { title: '승인번호', dataIndex: 'approvalNo', width: 120 },
    { title: '결제수단', dataIndex: 'paymentMethod', width: 100 },
    { title: '결제금액', dataIndex: 'paymentAmount', width: 110, align: 'right', render: formatAmount },
    { title: '공급가', dataIndex: 'supplyPrice', width: 110, align: 'right', render: formatAmount },
    { title: '부가세', dataIndex: 'vat', width: 100, align: 'right', render: formatAmount },
    { title: '결제수수료', dataIndex: 'paymentFee', width: 110, align: 'right', render: formatAmount },
    { title: '환불수수료', dataIndex: 'refundFee', width: 110, align: 'right', render: formatAmount },
    { title: '지급금액', dataIndex: 'payoutAmount', width: 110, align: 'right', render: formatAmount },
    { title: '지급일자', dataIndex: 'payoutDate', width: 110 },
  ];

  const summaryData = summary?.data;

  return (
    <PageLayout title="비대면 정산" breadcrumb={['매출관리', '비대면 정산']}>
      <Space wrap style={{ marginBottom: 16 }}>
        <Select placeholder="거래지점" allowClear style={{ width: 160 }}
          value={branch} onChange={setBranch}
          options={[/* populated dynamically or hardcoded per branch list */]} />
        <RangePicker value={dateRange} onChange={v => setDateRange(v || [null, null])} />
        <Input placeholder="키워드" style={{ width: 200 }}
          value={keyword} onChange={e => setKeyword(e.target.value)} onPressEnter={() => setPage(0)} />
        <Button icon={<SearchOutlined />} type="primary" onClick={() => setPage(0)}>검색</Button>
        <Button icon={<DownloadOutlined />} onClick={handleExport}>엑셀다운로드</Button>
      </Space>
      <Table<UntactSettlementListItem>
        rowKey="id" columns={columns} loading={isLoading}
        dataSource={data?.data?.content || []} scroll={{ x: 1600 }}
        pagination={{
          current: page + 1, pageSize, total: data?.data?.totalElements || 0,
          onChange: p => setPage(p - 1),
        }}
        summary={() => summaryData ? (
          <Table.Summary fixed>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={6} align="right">
                <strong>총합계 ({summaryData.totalCount}건)</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={6} align="right"><strong>{formatAmount(summaryData.totalPaymentAmount)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={7} align="right"><strong>{formatAmount(summaryData.totalSupplyPrice)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={8} align="right"><strong>{formatAmount(summaryData.totalVat)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={9} align="right"><strong>{formatAmount(summaryData.totalPaymentFee)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={10} align="right"><strong>{formatAmount(summaryData.totalRefundFee)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={11} align="right"><strong>{formatAmount(summaryData.totalPayoutAmount)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={12} />
            </Table.Summary.Row>
          </Table.Summary>
        ) : null}
      />
    </PageLayout>
  );
};

export default UntactSettlementPage;
```

### Acceptance Criteria
- UntactOrderCreatePage: checkbox selection + bulk "비대면결제 등록" button
- UntactOrderListPage: columns match Spec 6.6
- UntactSettlementPage: 합계행 at bottom with totals for all monetary columns
- All pages have excel export

---

## Task 9: 라우팅 + 메뉴

> Add routes and nav menu entries for all sales pages (Spec Section 11, items #10-#16).

**Files:**
- `sm-module-web/src/router/index.tsx` (or routes config)
- `sm-module-web/src/components/layout/menuConfig.ts` (or sidebar config)

### Steps

- [ ] **9.1** Add routes to router config

```tsx
// Add to existing routes array (lazy-loaded)
import { lazy } from 'react';

const SalesListPage = lazy(() => import('../pages/sales/SalesListPage'));
const CardSalesPage = lazy(() => import('../pages/sales/CardSalesPage'));
const PreSalesListPage = lazy(() => import('../pages/sales/PreSalesListPage'));
const PreSalesInputPage = lazy(() => import('../pages/sales/PreSalesInputPage'));
const UntactOrderCreatePage = lazy(() => import('../pages/sales/untact/UntactOrderCreatePage'));
const UntactOrderListPage = lazy(() => import('../pages/sales/untact/UntactOrderListPage'));
const UntactSettlementPage = lazy(() => import('../pages/sales/untact/UntactSettlementPage'));

// Inside <Route> tree, under authenticated layout:
// <Route path="/sales" element={<SalesListPage />} />
// <Route path="/sales/card" element={<CardSalesPage />} />
// <Route path="/sales/pre" element={<PreSalesListPage />} />
// <Route path="/sales/pre/create" element={<PreSalesInputPage />} />
// <Route path="/sales/untact/create" element={<UntactOrderCreatePage />} />
// <Route path="/sales/untact" element={<UntactOrderListPage />} />
// <Route path="/sales/untact/settlement" element={<UntactSettlementPage />} />
```

- [ ] **9.2** Add menu config entries

```typescript
// Add to menuConfig under '매출관리' group
{
  key: 'sales',
  label: '매출관리',
  children: [
    { key: '/sales', label: '매출목록' },
    { key: '/sales/card', label: '카드매출목록' },
    { key: '/sales/pre', label: '선매출목록' },
    { key: '/sales/pre/create', label: '선매출입력' },
    { key: '/sales/untact/create', label: '비대면주문 등록' },
    { key: '/sales/untact', label: '비대면주문 목록' },
    { key: '/sales/untact/settlement', label: '비대면 정산' },
  ],
}
```

- [ ] **9.3** Verify all 7 routes render correctly in browser

### Acceptance Criteria
- All 7 routes (Spec #10-#16) accessible via browser navigation
- Menu highlights current page
- Lazy loading works (code-split per page)
- Breadcrumb shows correct path (매출관리 > {page name})
