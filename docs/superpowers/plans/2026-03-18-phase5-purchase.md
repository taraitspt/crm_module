# Phase 5: 매입마감 구현 계획서

> **Updated:** 2026-04-07 — 실제 구현 상태 및 신규 요구사항 반영
>
> **주요 변경 이력 (2026-03-26 ~ 2026-04-06):**
> - 테이블명 변경: outsourcing_pos→po_mst, outsourcing_settlements→po_dtl (발주디테일로 변경)
> - PK 전략: 단일PK → 복합PK(company_cd + plant_cd + po_no)
> - po_dtl 신규 6개 인쇄업 전용 컬럼: po_item_type, po_config_cd, po_work_cd, po_page_cnt, po_print_front, po_print_back
> - po_mst 신규: in_delivery_dt (입고요청일, 2026.04.01)
> - 신규 테이블: po_settle_mst (외주정산마스터), po_settle_dtl (외주정산디테일)
> - 외주발주 상태값 변경: 접수대기/미정산/정산/매입완료
> - 외주발주등록 버튼 삭제 → 로우클릭 상세보기(PDF형태)
> - 외주정산: 정산확정/취소 버튼, N개 체크→정산생성 팝업(Gitgo API)
> - 외주정산현황: 미구현

> **Oracle 연동 확정 (2026-04-07):**
> - SM→ERP 발주등록: `PP_PURORDER_MST_X20329`에 쓰기 (ErpOrderWriteService.createPurchaseOrderInErp())
>   - ERP 발주번호: GPO{YYYYMMDD}{seq4} (예: GPO202604060001)
>   - 등록 데이터: COMPANY_CD='1000', PURDOC_NO, PURDOC_NM, PARTNER_CD, PUR_DT, DEPT_CD
> - 외주정산→ERP: `PP_INVOICE_MST` + `PP_INVOICE_DTL` (구매송장) 사용 확정
> - Gitgo 전자결재: API 사양 미정, 정산생성 시 팝업에서 Gitgo API 전달
> - 배송 동기화: SD_DLV_MST (ISS_ST='C') → 발주상태 자동 업데이트 (ErpTransactionSyncScheduler)
>
> **코드 분석 결과 (2026-04-07) — 3개 화면 모두 FE/BE 완성:**
> - 외주발주목록: FE 완성 (로우클릭 상세모달, 확정/취소, PDF 다운로드), BE 완성 → **완료**
> - 외주정산등록: FE 완성 (체크박스 선택, 정산확정/취소, 합계), BE 완성 (confirm/cancel 벌크) → **완료**
> - 외주정산현황: FE 완성 (조회, 엑셀, 업체필터), BE 완성 (status/export/vendors) → **완료**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 외주발주목록(상세보기), 외주정산등록(정산생성/확정), 외주정산현황, 엑셀 다운로드

**Architecture:** purchase 도메인 패키지. po_mst→po_dtl (1:N), po_settle_mst→po_settle_dtl (1:N). 복합PK. SM→ERP 발주는 PP_PURORDER_MST_X20329 쓰기. Gitgo 전자결재 연동 예정.

**Tech Stack:** Spring Boot 3.x, JPA, QueryDSL | React 18, TypeScript, Ant Design, xlsx(SheetJS)

**Spec:** `docs/superpowers/specs/2026-03-18-sm-module-design.md` Section 4.6, 5.7, 6.7

---

## Task 1: DB 스키마 - 매입마감 테이블

> ~~outsourcing_pos, outsourcing_settlements~~ → po_mst, po_dtl, po_settle_mst, po_settle_dtl 로 변경.
> 복합PK 아키텍처. FK 삭제 → 비정규화.

### Steps

- [x] **1.1** 매입마감 테이블 (V1 통합 스키마)

```sql
-- =============================================================
-- 매입마감 테이블 (V1 통합 스키마)
-- 변경: outsourcing_pos→po_mst, outsourcing_settlements→po_dtl
-- 신규: po_settle_mst, po_settle_dtl
-- =============================================================

-- -----------------------------------------------------------
-- po_mst (외주발주마스터) - 복합PK
-- -----------------------------------------------------------
CREATE TABLE po_mst (
    company_cd              INT             NOT NULL        COMMENT '회사코드',
    plant_cd                INT             NOT NULL        COMMENT '공장코드',
    po_no                   VARCHAR(30)     NOT NULL        COMMENT '발주번호',
    order_no                VARCHAR(30)     NULL            COMMENT '주문번호 (비정규화)',
    dept_cd                 INT             NULL            COMMENT '영업부서코드',
    work_title              VARCHAR(200)    NULL            COMMENT '작업제목',
    partner_cd              VARCHAR(20)     NULL            COMMENT '거래처코드 (비정규화)',
    partner_nm              VARCHAR(100)    NULL            COMMENT '거래처명',
    order_amt               BIGINT          DEFAULT 0       COMMENT '수주금액',
    po_amt                  BIGINT          DEFAULT 0       COMMENT '발주금액',
    sales_emp_no            VARCHAR(20)     NULL            COMMENT '영업담당자사번',
    po_emp_no               VARCHAR(20)     NULL            COMMENT '외주담당자사번',
    status_cd               VARCHAR(30)     DEFAULT 'PENDING' COMMENT '접수대기/미정산/정산/매입완료',
    settle_status_cd        VARCHAR(20)     DEFAULT 'UNSETTLED' COMMENT '정산상태',
    delivery_dt             DATE            NULL            COMMENT '납품일',
    in_delivery_dt          DATETIME        NULL            COMMENT '입고요청일 (신규 2026.04.01)',
    received_dt             DATE            NULL            COMMENT '접수일',
    erp_po_no               VARCHAR(30)     NULL            COMMENT 'ERP 발주번호',
    erp_sync_status         VARCHAR(20)     DEFAULT 'NONE'  COMMENT 'ERP 연동상태',
    -- Audit (BaseEntity)
    created_at              DATETIME        NOT NULL,
    updated_at              DATETIME        NOT NULL,
    created_id              VARCHAR(20)     NULL,
    updated_id              VARCHAR(20)     NULL,
    PRIMARY KEY (company_cd, plant_cd, po_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_po_mst_status ON po_mst (status_cd, delivery_dt);

-- -----------------------------------------------------------
-- po_dtl (외주발주디테일) - 복합PK, 인쇄업 전용 컬럼 포함
-- -----------------------------------------------------------
CREATE TABLE po_dtl (
    company_cd              INT             NOT NULL,
    plant_cd                INT             NOT NULL,
    po_no                   VARCHAR(30)     NOT NULL,
    po_sq                   INT             NOT NULL        COMMENT '발주순번',
    work_name               VARCHAR(200)    NULL            COMMENT '작업명',
    quantity                INT             DEFAULT 0,
    unit_price              BIGINT          DEFAULT 0,
    amt                     BIGINT          DEFAULT 0       COMMENT '금액',
    note                    VARCHAR(500)    NULL,
    -- 인쇄업 전용 (신규 2026.03.27)
    po_item_type            VARCHAR(30)     NULL            COMMENT '구분 (용지/원자재 등)',
    po_config_cd            VARCHAR(30)     NULL            COMMENT '구성',
    po_work_cd              VARCHAR(30)     NULL            COMMENT '작업코드',
    po_page_cnt             INT             NULL            COMMENT '페이지수',
    po_print_front          INT             NULL            COMMENT '인쇄도수(전)',
    po_print_back           INT             NULL            COMMENT '인쇄도수(후)',
    -- Audit
    created_at              DATETIME        NOT NULL,
    updated_at              DATETIME        NOT NULL,
    created_id              VARCHAR(20)     NULL,
    updated_id              VARCHAR(20)     NULL,
    PRIMARY KEY (company_cd, plant_cd, po_no, po_sq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- po_settle_mst (외주정산마스터) - 신규 테이블
-- -----------------------------------------------------------
CREATE TABLE po_settle_mst (
    company_cd              INT             NOT NULL,
    plant_cd                INT             NOT NULL,
    pos_no                  VARCHAR(30)     NOT NULL        COMMENT '정산번호',
    po_no                   VARCHAR(30)     NULL            COMMENT '발주번호',
    order_no                VARCHAR(30)     NULL            COMMENT '주문번호',
    partner_cd              VARCHAR(20)     NULL            COMMENT '거래처코드',
    partner_nm              VARCHAR(100)    NULL            COMMENT '거래처명',
    total_amt               BIGINT          DEFAULT 0       COMMENT '총금액',
    status_cd               VARCHAR(20)     DEFAULT 'UNSETTLED' COMMENT '정산상태',
    -- Audit
    created_at              DATETIME        NOT NULL,
    updated_at              DATETIME        NOT NULL,
    created_id              VARCHAR(20)     NULL,
    updated_id              VARCHAR(20)     NULL,
    PRIMARY KEY (company_cd, plant_cd, pos_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- po_settle_dtl (외주정산디테일) - 신규 테이블
-- -----------------------------------------------------------
CREATE TABLE po_settle_dtl (
    company_cd              INT             NOT NULL,
    plant_cd                INT             NOT NULL,
    pos_no                  VARCHAR(30)     NOT NULL,
    pos_sq                  INT             NOT NULL        COMMENT '정산순번',
    work_name               VARCHAR(200)    NULL            COMMENT '작업명(세부품목명)',
    vendor_name             VARCHAR(100)    NULL            COMMENT '업체명',
    quantity                INT             DEFAULT 0,
    unit_price              BIGINT          DEFAULT 0,
    amt                     BIGINT          DEFAULT 0,
    settle_status_cd        VARCHAR(20)     DEFAULT 'UNSETTLED',
    -- Audit
    created_at              DATETIME        NOT NULL,
    updated_at              DATETIME        NOT NULL,
    created_id              VARCHAR(20)     NULL,
    updated_id              VARCHAR(20)     NULL,
    PRIMARY KEY (company_cd, plant_cd, pos_no, pos_sq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 검색 성능 인덱스
CREATE INDEX idx_settlement_po_id
    ON outsourcing_settlements (outsourcing_po_id);

CREATE INDEX idx_settlement_vendor
    ON outsourcing_settlements (vendor_name);

CREATE INDEX idx_settlement_status
    ON outsourcing_settlements (settlement_status);

CREATE INDEX idx_settlement_order_no
    ON outsourcing_settlements (order_no);
```

- [ ] **1.2** Verify migration runs cleanly: `./gradlew flywayMigrate` (or Spring Boot startup auto-migrate)
- [ ] **1.3** Confirm tables exist via `SHOW CREATE TABLE outsourcing_pos; SHOW CREATE TABLE outsourcing_settlements;`

### Acceptance Criteria
- Both tables created with all columns matching spec 4.6
- All FKs reference existing Phase 1-3 tables (orders, departments, business_owners, users)
- Index `idx_outsourcing_pos_dept_status_delivery` covers the primary query pattern
- Soft-delete columns (deleted, deleted_at, deleted_by) present per spec 12.3
- Audit columns (created_at, updated_at, created_by, updated_by) present per spec 12.1

---

## Task 2: 외주발주 Backend (OutsourcingPo)

> Entity, Repository, DTO, Service, Controller for 외주발주 CRUD + 발주확정 + 정산여부변경 + PDF 출력.

### Steps

- [ ] **2.1** Create entity `sm-module-api/src/main/java/com/tara/sm/purchase/entity/OutsourcingPo.java`

```java
package com.tara.sm.purchase.entity;

import com.tara.sm.common.audit.BaseEntity;
import com.tara.sm.auth.entity.Department;
import com.tara.sm.auth.entity.User;
import com.tara.sm.info.entity.BusinessOwner;
import com.tara.sm.order.entity.Order;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "outsourcing_pos")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class OutsourcingPo extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "po_no", nullable = false, unique = true, length = 30)
    private String poNo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id")
    private Order order;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id")
    private Department department;

    @Column(name = "work_title", length = 200)
    private String workTitle;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "business_owner_id")
    private BusinessOwner businessOwner;

    @Column(name = "order_amount")
    @Builder.Default
    private Long orderAmount = 0L;

    @Column(name = "outsourcing_amount")
    @Builder.Default
    private Long outsourcingAmount = 0L;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sales_manager_id")
    private User salesManager;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "outsourcing_manager_id")
    private User outsourcingManager;

    /** SALES_CONFIRMED, SETTLEMENT_DONE, SHIPPED */
    @Column(name = "status", length = 30)
    private String status;

    /** UNSETTLED, SETTLED */
    @Column(name = "settlement_status", length = 20)
    @Builder.Default
    private String settlementStatus = "UNSETTLED";

    @Column(name = "delivery_date")
    private LocalDate deliveryDate;

    @Column(name = "received_date")
    private LocalDate receivedDate;

    // --- Soft delete ---
    @Column(name = "deleted")
    @Builder.Default
    private Boolean deleted = false;

    // --- One-to-many: settlements ---
    @OneToMany(mappedBy = "outsourcingPo", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<OutsourcingSettlement> settlements = new ArrayList<>();

    // --- Domain methods ---

    public void confirm() {
        this.status = "SALES_CONFIRMED";
    }

    public void changeSettlementStatus(String newStatus) {
        this.settlementStatus = newStatus;
    }

    public void markShipped() {
        this.status = "SHIPPED";
    }
}
```

- [ ] **2.2** Create enum constants (optional, can use String for flexibility) `sm-module-api/src/main/java/com/tara/sm/purchase/entity/PoStatus.java`

```java
package com.tara.sm.purchase.entity;

public final class PoStatus {
    public static final String SALES_CONFIRMED = "SALES_CONFIRMED";
    public static final String SETTLEMENT_DONE = "SETTLEMENT_DONE";
    public static final String SHIPPED = "SHIPPED";

    private PoStatus() {}
}
```

```java
package com.tara.sm.purchase.entity;

public final class SettlementStatus {
    public static final String UNSETTLED = "UNSETTLED";
    public static final String SETTLED = "SETTLED";

    private SettlementStatus() {}
}
```

- [ ] **2.3** Create DTOs `sm-module-api/src/main/java/com/tara/sm/purchase/dto/OutsourcingPoDto.java`

```java
package com.tara.sm.purchase.dto;

import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

public class OutsourcingPoDto {

    // --- Request DTOs ---

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class CreateRequest {
        private Long orderId;
        private Long departmentId;
        private String workTitle;
        private Long businessOwnerId;
        private Long orderAmount;
        private Long outsourcingAmount;
        private Long salesManagerId;
        private Long outsourcingManagerId;
        private LocalDate deliveryDate;
        private LocalDate receivedDate;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class SettlementStatusRequest {
        private String status; // UNSETTLED | SETTLED
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class SearchCondition {
        private Long departmentId;
        private String status;
        private LocalDate startDate;
        private LocalDate endDate;
        private String keyword;
        private int page;
        private int size;
    }

    // --- Response DTOs ---

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class ListItem {
        private Long id;
        private String poNo;
        private LocalDate receivedDate;
        private String departmentName;
        private String workTitle;
        private String businessOwnerName;
        private Long orderAmount;
        private String salesManagerName;
        private Long outsourcingAmount;
        private String outsourcingManagerName;
        private String status;
        private String settlementStatus;
        private LocalDate deliveryDate;
        private Long orderId;
        private String orderNo;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Detail {
        private Long id;
        private String poNo;
        private Long orderId;
        private String orderNo;
        private Long departmentId;
        private String departmentName;
        private String workTitle;
        private Long businessOwnerId;
        private String businessOwnerName;
        private Long orderAmount;
        private Long outsourcingAmount;
        private Long salesManagerId;
        private String salesManagerName;
        private Long outsourcingManagerId;
        private String outsourcingManagerName;
        private String status;
        private String settlementStatus;
        private LocalDate deliveryDate;
        private LocalDate receivedDate;
        private LocalDateTime createdAt;
    }
}
```

- [ ] **2.4** Create repository `sm-module-api/src/main/java/com/tara/sm/purchase/repository/OutsourcingPoRepository.java`

```java
package com.tara.sm.purchase.repository;

import com.tara.sm.purchase.entity.OutsourcingPo;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface OutsourcingPoRepository extends JpaRepository<OutsourcingPo, Long> {

    Optional<OutsourcingPo> findByPoNoAndDeletedFalse(String poNo);

    boolean existsByPoNo(String poNo);
}
```

- [ ] **2.5** Create QueryDSL custom repository `sm-module-api/src/main/java/com/tara/sm/purchase/repository/OutsourcingPoQueryRepository.java`

```java
package com.tara.sm.purchase.repository;

import com.querydsl.core.BooleanBuilder;
import com.querydsl.core.types.Projections;
import com.querydsl.jpa.impl.JPAQueryFactory;
import com.tara.sm.purchase.dto.OutsourcingPoDto;
import com.tara.sm.purchase.entity.QOutsourcingPo;
import com.tara.sm.auth.entity.QDepartment;
import com.tara.sm.auth.entity.QUser;
import com.tara.sm.info.entity.QBusinessOwner;
import com.tara.sm.order.entity.QOrder;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import java.util.List;

@Repository
@RequiredArgsConstructor
public class OutsourcingPoQueryRepository {

    private final JPAQueryFactory queryFactory;

    public Page<OutsourcingPoDto.ListItem> search(OutsourcingPoDto.SearchCondition cond, Pageable pageable) {
        QOutsourcingPo po       = QOutsourcingPo.outsourcingPo;
        QDepartment dept        = QDepartment.department;
        QUser salesMgr          = new QUser("salesMgr");
        QUser outsourcingMgr    = new QUser("outsourcingMgr");
        QBusinessOwner biz      = QBusinessOwner.businessOwner;
        QOrder order            = QOrder.order;

        BooleanBuilder where = new BooleanBuilder();
        where.and(po.deleted.isFalse());

        if (cond.getDepartmentId() != null) {
            where.and(po.department.id.eq(cond.getDepartmentId()));
        }
        if (StringUtils.hasText(cond.getStatus())) {
            where.and(po.status.eq(cond.getStatus()));
        }
        if (cond.getStartDate() != null) {
            where.and(po.receivedDate.goe(cond.getStartDate()));
        }
        if (cond.getEndDate() != null) {
            where.and(po.receivedDate.loe(cond.getEndDate()));
        }
        if (StringUtils.hasText(cond.getKeyword())) {
            String kw = "%" + cond.getKeyword() + "%";
            where.and(
                biz.companyName.like(kw)
                    .or(po.workTitle.like(kw))
                    .or(order.orderNo.like(kw))
            );
        }

        List<OutsourcingPoDto.ListItem> content = queryFactory
            .select(Projections.bean(OutsourcingPoDto.ListItem.class,
                po.id,
                po.poNo,
                po.receivedDate,
                dept.name.as("departmentName"),
                po.workTitle,
                biz.companyName.as("businessOwnerName"),
                po.orderAmount,
                salesMgr.name.as("salesManagerName"),
                po.outsourcingAmount,
                outsourcingMgr.name.as("outsourcingManagerName"),
                po.status,
                po.settlementStatus,
                po.deliveryDate,
                po.order.id.as("orderId"),
                order.orderNo
            ))
            .from(po)
            .leftJoin(po.department, dept)
            .leftJoin(po.businessOwner, biz)
            .leftJoin(po.salesManager, salesMgr)
            .leftJoin(po.outsourcingManager, outsourcingMgr)
            .leftJoin(po.order, order)
            .where(where)
            .orderBy(po.receivedDate.desc(), po.id.desc())
            .offset(pageable.getOffset())
            .limit(pageable.getPageSize())
            .fetch();

        long total = queryFactory
            .select(po.count())
            .from(po)
            .leftJoin(po.businessOwner, biz)
            .leftJoin(po.order, order)
            .where(where)
            .fetchOne();

        return new PageImpl<>(content, pageable, total);
    }
}
```

- [ ] **2.6** Create service `sm-module-api/src/main/java/com/tara/sm/purchase/service/OutsourcingPoService.java`

```java
package com.tara.sm.purchase.service;

import com.tara.sm.auth.entity.Department;
import com.tara.sm.auth.entity.User;
import com.tara.sm.common.exception.BusinessException;
import com.tara.sm.common.util.SequenceNumberGenerator;
import com.tara.sm.info.entity.BusinessOwner;
import com.tara.sm.purchase.dto.OutsourcingPoDto;
import com.tara.sm.purchase.entity.OutsourcingPo;
import com.tara.sm.purchase.entity.SettlementStatus;
import com.tara.sm.purchase.repository.OutsourcingPoQueryRepository;
import com.tara.sm.purchase.repository.OutsourcingPoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OutsourcingPoService {

    private final OutsourcingPoRepository poRepository;
    private final OutsourcingPoQueryRepository poQueryRepository;
    private final SequenceNumberGenerator sequenceNumberGenerator;
    // Inject other repositories (OrderRepository, DepartmentRepository, etc.) as needed

    /**
     * 외주발주 목록 조회 (QueryDSL 기반 동적 검색)
     */
    public Page<OutsourcingPoDto.ListItem> list(OutsourcingPoDto.SearchCondition condition) {
        PageRequest pageable = PageRequest.of(condition.getPage(), condition.getSize());
        return poQueryRepository.search(condition, pageable);
    }

    /**
     * 외주발주 상세 조회
     */
    public OutsourcingPoDto.Detail getDetail(Long id) {
        OutsourcingPo po = findByIdOrThrow(id);
        return toDetail(po);
    }

    /**
     * 외주발주 등록
     * - 발주번호 자동 채번: PO{YYMMDD}-{일련번호3자리}
     * - 초기 상태: status 미설정 (주문에서 발주 시 SALES_CONFIRMED으로 전환)
     */
    @Transactional
    public OutsourcingPoDto.Detail create(OutsourcingPoDto.CreateRequest request) {
        String poNo = sequenceNumberGenerator.generatePoNo();

        OutsourcingPo po = OutsourcingPo.builder()
            .poNo(poNo)
            // .order(orderRepository.getReferenceById(request.getOrderId()))
            // .department(departmentRepository.getReferenceById(request.getDepartmentId()))
            // .businessOwner(bizOwnerRepository.getReferenceById(request.getBusinessOwnerId()))
            // .salesManager(userRepository.getReferenceById(request.getSalesManagerId()))
            // .outsourcingManager(userRepository.getReferenceById(request.getOutsourcingManagerId()))
            .workTitle(request.getWorkTitle())
            .orderAmount(request.getOrderAmount())
            .outsourcingAmount(request.getOutsourcingAmount())
            .deliveryDate(request.getDeliveryDate())
            .receivedDate(request.getReceivedDate())
            .settlementStatus(SettlementStatus.UNSETTLED)
            .build();

        // NOTE: Uncomment and wire repository references above in actual implementation.
        // The commented lines show the intended wiring pattern.

        poRepository.save(po);
        return toDetail(po);
    }

    /**
     * 발주 확정 처리
     */
    @Transactional
    public void confirm(Long id) {
        OutsourcingPo po = findByIdOrThrow(id);
        po.confirm();
    }

    /**
     * 정산여부 변경 (인라인 토글)
     */
    @Transactional
    public void changeSettlementStatus(Long id, String newStatus) {
        if (!SettlementStatus.UNSETTLED.equals(newStatus)
            && !SettlementStatus.SETTLED.equals(newStatus)) {
            throw new BusinessException("INVALID_SETTLEMENT_STATUS",
                "유효하지 않은 정산여부 값: " + newStatus);
        }
        OutsourcingPo po = findByIdOrThrow(id);
        po.changeSettlementStatus(newStatus);
    }

    /**
     * 발주서 PDF 바이트 배열 생성
     * - 실제 구현에서 Thymeleaf + Flying Saucer / iText 등으로 PDF 렌더링
     */
    public byte[] generatePdf(Long id) {
        OutsourcingPo po = findByIdOrThrow(id);
        // TODO: PDF generation logic
        // 1. Load PO details + order items
        // 2. Render HTML template with Thymeleaf
        // 3. Convert HTML -> PDF using Flying Saucer or iText
        throw new UnsupportedOperationException("PDF generation not yet implemented");
    }

    // --- Private helpers ---

    private OutsourcingPo findByIdOrThrow(Long id) {
        return poRepository.findById(id)
            .filter(po -> !po.getDeleted())
            .orElseThrow(() -> new BusinessException("PO_NOT_FOUND",
                "외주발주를 찾을 수 없습니다. id=" + id));
    }

    private OutsourcingPoDto.Detail toDetail(OutsourcingPo po) {
        return OutsourcingPoDto.Detail.builder()
            .id(po.getId())
            .poNo(po.getPoNo())
            .orderId(po.getOrder() != null ? po.getOrder().getId() : null)
            .orderNo(po.getOrder() != null ? po.getOrder().getOrderNo() : null)
            .departmentId(po.getDepartment() != null ? po.getDepartment().getId() : null)
            .departmentName(po.getDepartment() != null ? po.getDepartment().getName() : null)
            .workTitle(po.getWorkTitle())
            .businessOwnerId(po.getBusinessOwner() != null ? po.getBusinessOwner().getId() : null)
            .businessOwnerName(po.getBusinessOwner() != null ? po.getBusinessOwner().getCompanyName() : null)
            .orderAmount(po.getOrderAmount())
            .outsourcingAmount(po.getOutsourcingAmount())
            .salesManagerId(po.getSalesManager() != null ? po.getSalesManager().getId() : null)
            .salesManagerName(po.getSalesManager() != null ? po.getSalesManager().getName() : null)
            .outsourcingManagerId(po.getOutsourcingManager() != null ? po.getOutsourcingManager().getId() : null)
            .outsourcingManagerName(po.getOutsourcingManager() != null ? po.getOutsourcingManager().getName() : null)
            .status(po.getStatus())
            .settlementStatus(po.getSettlementStatus())
            .deliveryDate(po.getDeliveryDate())
            .receivedDate(po.getReceivedDate())
            .createdAt(po.getCreatedAt())
            .build();
    }
}
```

- [ ] **2.7** Create controller `sm-module-api/src/main/java/com/tara/sm/purchase/controller/OutsourcingPoController.java`

```java
package com.tara.sm.purchase.controller;

import com.tara.sm.common.dto.ApiResponse;
import com.tara.sm.purchase.dto.OutsourcingPoDto;
import com.tara.sm.purchase.service.OutsourcingPoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

@Tag(name = "Purchase - 외주발주", description = "외주발주 관리 API")
@RestController
@RequestMapping("/api/purchase/outsourcing-po")
@RequiredArgsConstructor
public class OutsourcingPoController {

    private final OutsourcingPoService poService;

    @Operation(summary = "외주발주 목록 조회")
    @GetMapping
    public ApiResponse<Page<OutsourcingPoDto.ListItem>> list(
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) LocalDate startDate,
            @RequestParam(required = false) LocalDate endDate,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        OutsourcingPoDto.SearchCondition cond = OutsourcingPoDto.SearchCondition.builder()
                .departmentId(departmentId)
                .status(status)
                .startDate(startDate)
                .endDate(endDate)
                .keyword(keyword)
                .page(page)
                .size(size)
                .build();
        return ApiResponse.success(poService.list(cond));
    }

    @Operation(summary = "외주발주 상세 조회")
    @GetMapping("/{id}")
    public ApiResponse<OutsourcingPoDto.Detail> detail(@PathVariable Long id) {
        return ApiResponse.success(poService.getDetail(id));
    }

    @Operation(summary = "외주발주 등록")
    @PostMapping
    public ApiResponse<OutsourcingPoDto.Detail> create(
            @RequestBody OutsourcingPoDto.CreateRequest request) {
        return ApiResponse.success(poService.create(request));
    }

    @Operation(summary = "발주 확정")
    @PatchMapping("/{id}/confirm")
    public ApiResponse<Void> confirm(@PathVariable Long id) {
        poService.confirm(id);
        return ApiResponse.success(null);
    }

    @Operation(summary = "정산여부 변경")
    @PatchMapping("/{id}/settlement-status")
    public ApiResponse<Void> changeSettlementStatus(
            @PathVariable Long id,
            @RequestBody OutsourcingPoDto.SettlementStatusRequest request) {
        poService.changeSettlementStatus(id, request.getStatus());
        return ApiResponse.success(null);
    }

    @Operation(summary = "발주서 PDF 출력")
    @GetMapping("/{id}/document")
    public ResponseEntity<byte[]> document(@PathVariable Long id) {
        byte[] pdf = poService.generatePdf(id);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDisposition(
                ContentDisposition.attachment().filename("PO-" + id + ".pdf").build());
        return new ResponseEntity<>(pdf, headers, HttpStatus.OK);
    }
}
```

- [ ] **2.8** Verify compilation: `./gradlew compileJava`
- [ ] **2.9** Write unit test for OutsourcingPoService (create, confirm, changeSettlementStatus)

### Acceptance Criteria
- GET `/api/purchase/outsourcing-po` returns paginated list with all filter combinations
- POST creates a new PO with auto-generated po_no (PO{YYMMDD}-{seq})
- PATCH `/{id}/confirm` transitions status to SALES_CONFIRMED
- PATCH `/{id}/settlement-status` toggles between UNSETTLED/SETTLED with validation
- GET `/{id}/document` returns PDF bytes (placeholder OK for Phase 5)
- Soft-deleted records excluded from all queries

---

## Task 3: 외주정산 Backend (OutsourcingSettlement)

> Entity, Repository, DTO, Service, Controller for 외주정산 CRUD + 일괄생성 + 엑셀 import/export.
> Business rule: 모든 품목에 금액 기입 -> 자동 정산완료.

### Steps

- [ ] **3.1** Create entity `sm-module-api/src/main/java/com/tara/sm/purchase/entity/OutsourcingSettlement.java`

```java
package com.tara.sm.purchase.entity;

import com.tara.sm.common.audit.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "outsourcing_settlements")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class OutsourcingSettlement extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "outsourcing_po_id")
    private OutsourcingPo outsourcingPo;

    @Column(name = "order_no", length = 30)
    private String orderNo;

    @Column(name = "po_no", length = 30)
    private String poNo;

    @Column(name = "order_name", length = 200)
    private String orderName;

    @Column(name = "work_name", length = 100)
    private String workName;

    @Column(name = "vendor_name", length = 100)
    private String vendorName;

    @Column(name = "quantity")
    @Builder.Default
    private Integer quantity = 0;

    @Column(name = "unit_price")
    @Builder.Default
    private Long unitPrice = 0L;

    @Column(name = "amount")
    @Builder.Default
    private Long amount = 0L;

    /** UNSETTLED | SETTLED */
    @Column(name = "settlement_status", length = 20)
    @Builder.Default
    private String settlementStatus = "UNSETTLED";

    /** PENDING | SYNCED | FAILED */
    @Column(name = "gitgo_sync_status", length = 20)
    @Builder.Default
    private String gitgoSyncStatus = "PENDING";

    // --- Soft delete ---
    @Column(name = "deleted")
    @Builder.Default
    private Boolean deleted = false;

    // --- Domain methods ---

    /**
     * 금액 기입 시 호출. amount > 0이면 정산완료로 자동 전환.
     */
    public void updateAmount(int quantity, long unitPrice) {
        this.quantity = quantity;
        this.unitPrice = unitPrice;
        this.amount = (long) quantity * unitPrice;
        if (this.amount > 0) {
            this.settlementStatus = SettlementStatus.SETTLED;
        }
    }

    public void markGitgoSynced() {
        this.gitgoSyncStatus = "SYNCED";
    }

    public void markGitgoFailed() {
        this.gitgoSyncStatus = "FAILED";
    }
}
```

- [ ] **3.2** Create DTOs `sm-module-api/src/main/java/com/tara/sm/purchase/dto/OutsourcingSettlementDto.java`

```java
package com.tara.sm.purchase.dto;

import lombok.*;
import java.time.LocalDateTime;
import java.util.List;

public class OutsourcingSettlementDto {

    // --- Request DTOs ---

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class BulkCreateRequest {
        /** 정산 대상 외주발주 ID 목록 */
        private List<Long> outsourcingPoIds;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class SearchCondition {
        private String vendor;
        private String settlementStatus;
        private String keyword;
        private String startDate;   // ISO date string
        private String endDate;
        private int page;
        private int size;
    }

    // --- Response DTOs ---

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class ListItem {
        private Long id;
        private Long outsourcingPoId;
        private String orderNo;
        private String poNo;
        private String orderName;
        private String workName;
        private String vendorName;
        private Integer quantity;
        private Long unitPrice;
        private Long amount;
        private String settlementStatus;
        private String gitgoSyncStatus;
        private LocalDateTime createdAt;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class SummaryResponse {
        private int selectedCount;
        private Long totalAmount;
    }

    // --- Excel import row ---

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class ExcelRow {
        private int rowIndex;        // 원본 엑셀 행 번호 (에러 보고용)
        private String orderNo;
        private String poNo;
        private String orderName;
        private String workName;
        private String vendorName;
        private Integer quantity;
        private Long unitPrice;
        private Long amount;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class ExcelImportResult {
        private int successCount;
        private int failCount;
        private int totalCount;
        private List<ExcelRowError> errors;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class ExcelRowError {
        private int rowIndex;
        private String field;
        private String message;
    }
}
```

- [ ] **3.3** Create repository `sm-module-api/src/main/java/com/tara/sm/purchase/repository/OutsourcingSettlementRepository.java`

```java
package com.tara.sm.purchase.repository;

import com.tara.sm.purchase.entity.OutsourcingSettlement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface OutsourcingSettlementRepository extends JpaRepository<OutsourcingSettlement, Long> {

    List<OutsourcingSettlement> findByOutsourcingPoIdAndDeletedFalse(Long outsourcingPoId);

    @Query("SELECT s FROM OutsourcingSettlement s WHERE s.outsourcingPo.id = :poId AND s.deleted = false AND s.amount = 0")
    List<OutsourcingSettlement> findUnsettledByPoId(@Param("poId") Long poId);

    /**
     * Check if all settlements for a given PO have amount > 0 (all settled).
     * Returns true if any unsettled (amount = 0) settlements exist.
     */
    @Query("SELECT COUNT(s) > 0 FROM OutsourcingSettlement s " +
           "WHERE s.outsourcingPo.id = :poId AND s.deleted = false AND s.amount = 0")
    boolean hasUnsettledItems(@Param("poId") Long poId);
}
```

- [ ] **3.4** Create QueryDSL custom repository `sm-module-api/src/main/java/com/tara/sm/purchase/repository/OutsourcingSettlementQueryRepository.java`

```java
package com.tara.sm.purchase.repository;

import com.querydsl.core.BooleanBuilder;
import com.querydsl.core.types.Projections;
import com.querydsl.jpa.impl.JPAQueryFactory;
import com.tara.sm.purchase.dto.OutsourcingSettlementDto;
import com.tara.sm.purchase.entity.QOutsourcingSettlement;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import java.util.List;

@Repository
@RequiredArgsConstructor
public class OutsourcingSettlementQueryRepository {

    private final JPAQueryFactory queryFactory;

    public Page<OutsourcingSettlementDto.ListItem> search(
            OutsourcingSettlementDto.SearchCondition cond, Pageable pageable) {

        QOutsourcingSettlement s = QOutsourcingSettlement.outsourcingSettlement;

        BooleanBuilder where = new BooleanBuilder();
        where.and(s.deleted.isFalse());

        if (StringUtils.hasText(cond.getVendor())) {
            where.and(s.vendorName.eq(cond.getVendor()));
        }
        if (StringUtils.hasText(cond.getSettlementStatus())) {
            where.and(s.settlementStatus.eq(cond.getSettlementStatus()));
        }
        if (StringUtils.hasText(cond.getKeyword())) {
            String kw = "%" + cond.getKeyword() + "%";
            where.and(
                s.orderNo.like(kw)
                    .or(s.poNo.like(kw))
                    .or(s.vendorName.like(kw))
                    .or(s.orderName.like(kw))
            );
        }
        // Date range filter on createdAt if provided
        // (add parsing for startDate/endDate strings if needed)

        List<OutsourcingSettlementDto.ListItem> content = queryFactory
            .select(Projections.bean(OutsourcingSettlementDto.ListItem.class,
                s.id,
                s.outsourcingPo.id.as("outsourcingPoId"),
                s.orderNo,
                s.poNo,
                s.orderName,
                s.workName,
                s.vendorName,
                s.quantity,
                s.unitPrice,
                s.amount,
                s.settlementStatus,
                s.gitgoSyncStatus,
                s.createdAt
            ))
            .from(s)
            .where(where)
            .orderBy(s.createdAt.desc())
            .offset(pageable.getOffset())
            .limit(pageable.getPageSize())
            .fetch();

        long total = queryFactory
            .select(s.count())
            .from(s)
            .where(where)
            .fetchOne();

        return new PageImpl<>(content, pageable, total);
    }

    /**
     * 벤더명 목록 (distinct) - 거래처 필터 드롭다운용
     */
    public List<String> findDistinctVendorNames() {
        QOutsourcingSettlement s = QOutsourcingSettlement.outsourcingSettlement;
        return queryFactory
            .select(s.vendorName).distinct()
            .from(s)
            .where(s.deleted.isFalse().and(s.vendorName.isNotNull()))
            .orderBy(s.vendorName.asc())
            .fetch();
    }
}
```

- [ ] **3.5** Create service `sm-module-api/src/main/java/com/tara/sm/purchase/service/OutsourcingSettlementService.java`

```java
package com.tara.sm.purchase.service;

import com.tara.sm.common.exception.BusinessException;
import com.tara.sm.common.util.ExcelService;
import com.tara.sm.purchase.dto.OutsourcingSettlementDto;
import com.tara.sm.purchase.entity.OutsourcingPo;
import com.tara.sm.purchase.entity.OutsourcingSettlement;
import com.tara.sm.purchase.entity.SettlementStatus;
import com.tara.sm.purchase.repository.OutsourcingPoRepository;
import com.tara.sm.purchase.repository.OutsourcingSettlementQueryRepository;
import com.tara.sm.purchase.repository.OutsourcingSettlementRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
@Slf4j
public class OutsourcingSettlementService {

    private final OutsourcingSettlementRepository settlementRepository;
    private final OutsourcingSettlementQueryRepository settlementQueryRepository;
    private final OutsourcingPoRepository poRepository;
    private final ExcelService excelService;

    /**
     * 외주정산 목록 조회
     */
    public Page<OutsourcingSettlementDto.ListItem> list(OutsourcingSettlementDto.SearchCondition cond) {
        PageRequest pageable = PageRequest.of(cond.getPage(), cond.getSize());
        return settlementQueryRepository.search(cond, pageable);
    }

    /**
     * 벤더명 목록 (거래처 필터용)
     */
    public List<String> getVendorNames() {
        return settlementQueryRepository.findDistinctVendorNames();
    }

    /**
     * 외주정산 일괄 생성
     * - 선택된 외주발주 ID 목록으로부터 정산 레코드 생성
     * - 주문의 품목(order_items) 정보를 기반으로 정산 행 생성
     */
    @Transactional
    public List<OutsourcingSettlementDto.ListItem> createBulk(
            OutsourcingSettlementDto.BulkCreateRequest request) {

        List<OutsourcingSettlement> created = new ArrayList<>();

        for (Long poId : request.getOutsourcingPoIds()) {
            OutsourcingPo po = poRepository.findById(poId)
                .filter(p -> !p.getDeleted())
                .orElseThrow(() -> new BusinessException("PO_NOT_FOUND",
                    "외주발주를 찾을 수 없습니다. id=" + poId));

            // Create settlement record(s) from PO data
            // In full implementation: iterate over order items linked to this PO
            OutsourcingSettlement settlement = OutsourcingSettlement.builder()
                .outsourcingPo(po)
                .orderNo(po.getOrder() != null ? po.getOrder().getOrderNo() : null)
                .poNo(po.getPoNo())
                .orderName(po.getWorkTitle())
                .workName(po.getWorkTitle())
                .vendorName(po.getBusinessOwner() != null
                    ? po.getBusinessOwner().getCompanyName() : null)
                .quantity(0)
                .unitPrice(0L)
                .amount(0L)
                .settlementStatus(SettlementStatus.UNSETTLED)
                .build();

            created.add(settlementRepository.save(settlement));
        }

        return created.stream().map(this::toListItem).toList();
    }

    /**
     * 엑셀 업로드 (일괄 등록/수정)
     * Validation rules:
     *   - orderNo: 필수, 존재하는 주문번호
     *   - vendorName: 필수
     *   - quantity: 0 이상 정수
     *   - unitPrice: 0 이상
     *   - amount: quantity * unitPrice 일치 검증
     */
    @Transactional
    public OutsourcingSettlementDto.ExcelImportResult importExcel(MultipartFile file) {
        List<OutsourcingSettlementDto.ExcelRow> rows = excelService.importFromExcel(
            file,
            OutsourcingSettlementDto.ExcelRow.class,
            this::validateExcelRow
        );

        List<OutsourcingSettlementDto.ExcelRowError> errors = new ArrayList<>();
        int successCount = 0;

        for (OutsourcingSettlementDto.ExcelRow row : rows) {
            try {
                // Validate and create/update settlement
                OutsourcingSettlement settlement = OutsourcingSettlement.builder()
                    .orderNo(row.getOrderNo())
                    .poNo(row.getPoNo())
                    .orderName(row.getOrderName())
                    .workName(row.getWorkName())
                    .vendorName(row.getVendorName())
                    .quantity(row.getQuantity())
                    .unitPrice(row.getUnitPrice())
                    .amount(row.getAmount())
                    .build();

                // Auto-settle if amount > 0
                if (settlement.getAmount() != null && settlement.getAmount() > 0) {
                    settlement.setSettlementStatus(SettlementStatus.SETTLED);
                }

                settlementRepository.save(settlement);
                successCount++;
            } catch (Exception e) {
                errors.add(OutsourcingSettlementDto.ExcelRowError.builder()
                    .rowIndex(row.getRowIndex())
                    .field("general")
                    .message(e.getMessage())
                    .build());
            }
        }

        return OutsourcingSettlementDto.ExcelImportResult.builder()
            .totalCount(rows.size())
            .successCount(successCount)
            .failCount(errors.size())
            .errors(errors)
            .build();
    }

    /**
     * 엑셀 다운로드 (현재 조회 조건 기반)
     */
    public byte[] exportExcel(OutsourcingSettlementDto.SearchCondition cond) {
        // Fetch all matching records (no pagination)
        OutsourcingSettlementDto.SearchCondition allCond =
            OutsourcingSettlementDto.SearchCondition.builder()
                .vendor(cond.getVendor())
                .settlementStatus(cond.getSettlementStatus())
                .keyword(cond.getKeyword())
                .startDate(cond.getStartDate())
                .endDate(cond.getEndDate())
                .page(0)
                .size(Integer.MAX_VALUE)
                .build();

        Page<OutsourcingSettlementDto.ListItem> allData = list(allCond);

        String[] headers = {
            "주문번호", "발주번호", "주문명", "작업명", "업체명",
            "수량", "단가", "금액", "정산여부"
        };

        List<Object[]> dataRows = allData.getContent().stream()
            .map(item -> new Object[]{
                item.getOrderNo(),
                item.getPoNo(),
                item.getOrderName(),
                item.getWorkName(),
                item.getVendorName(),
                item.getQuantity(),
                item.getUnitPrice(),
                item.getAmount(),
                item.getSettlementStatus()
            })
            .toList();

        return excelService.exportToExcel(headers, dataRows);
    }

    /**
     * 외주정산에서 정산완료 자동 판정
     * Business rule: 해당 발주의 모든 정산 품목에 금액이 기입되면 -> 발주의 settlement_status = SETTLED
     */
    @Transactional
    public void checkAndAutoSettle(Long outsourcingPoId) {
        boolean hasUnsettled = settlementRepository.hasUnsettledItems(outsourcingPoId);
        OutsourcingPo po = poRepository.findById(outsourcingPoId)
            .orElseThrow(() -> new BusinessException("PO_NOT_FOUND", "발주 없음"));

        if (!hasUnsettled) {
            // 모든 품목 금액 기입 완료 -> 자동 정산완료
            po.changeSettlementStatus(SettlementStatus.SETTLED);
            po.setStatus("SETTLEMENT_DONE");
            log.info("외주발주 {} 자동 정산완료 처리", po.getPoNo());
        } else {
            po.changeSettlementStatus(SettlementStatus.UNSETTLED);
        }
    }

    // --- Private helpers ---

    private List<OutsourcingSettlementDto.ExcelRowError> validateExcelRow(
            OutsourcingSettlementDto.ExcelRow row) {
        List<OutsourcingSettlementDto.ExcelRowError> errors = new ArrayList<>();

        if (row.getVendorName() == null || row.getVendorName().isBlank()) {
            errors.add(OutsourcingSettlementDto.ExcelRowError.builder()
                .rowIndex(row.getRowIndex())
                .field("vendorName")
                .message("업체명은 필수입니다.")
                .build());
        }
        if (row.getQuantity() != null && row.getQuantity() < 0) {
            errors.add(OutsourcingSettlementDto.ExcelRowError.builder()
                .rowIndex(row.getRowIndex())
                .field("quantity")
                .message("수량은 0 이상이어야 합니다.")
                .build());
        }
        if (row.getUnitPrice() != null && row.getUnitPrice() < 0) {
            errors.add(OutsourcingSettlementDto.ExcelRowError.builder()
                .rowIndex(row.getRowIndex())
                .field("unitPrice")
                .message("단가는 0 이상이어야 합니다.")
                .build());
        }
        // Cross-field: amount == quantity * unitPrice
        if (row.getQuantity() != null && row.getUnitPrice() != null && row.getAmount() != null) {
            long expected = (long) row.getQuantity() * row.getUnitPrice();
            if (!row.getAmount().equals(expected)) {
                errors.add(OutsourcingSettlementDto.ExcelRowError.builder()
                    .rowIndex(row.getRowIndex())
                    .field("amount")
                    .message("금액이 수량 x 단가와 일치하지 않습니다. (기대값: " + expected + ")")
                    .build());
            }
        }

        return errors;
    }

    private OutsourcingSettlementDto.ListItem toListItem(OutsourcingSettlement s) {
        return OutsourcingSettlementDto.ListItem.builder()
            .id(s.getId())
            .outsourcingPoId(s.getOutsourcingPo() != null ? s.getOutsourcingPo().getId() : null)
            .orderNo(s.getOrderNo())
            .poNo(s.getPoNo())
            .orderName(s.getOrderName())
            .workName(s.getWorkName())
            .vendorName(s.getVendorName())
            .quantity(s.getQuantity())
            .unitPrice(s.getUnitPrice())
            .amount(s.getAmount())
            .settlementStatus(s.getSettlementStatus())
            .gitgoSyncStatus(s.getGitgoSyncStatus())
            .createdAt(s.getCreatedAt())
            .build();
    }
}
```

- [ ] **3.6** Create controller `sm-module-api/src/main/java/com/tara/sm/purchase/controller/OutsourcingSettlementController.java`

```java
package com.tara.sm.purchase.controller;

import com.tara.sm.common.dto.ApiResponse;
import com.tara.sm.purchase.dto.OutsourcingSettlementDto;
import com.tara.sm.purchase.service.OutsourcingSettlementService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Tag(name = "Purchase - 외주정산", description = "외주정산 관리 API")
@RestController
@RequestMapping("/api/purchase/outsourcing-settlement")
@RequiredArgsConstructor
public class OutsourcingSettlementController {

    private final OutsourcingSettlementService settlementService;

    @Operation(summary = "외주정산 목록 조회")
    @GetMapping
    public ApiResponse<Page<OutsourcingSettlementDto.ListItem>> list(
            @RequestParam(required = false) String vendor,
            @RequestParam(required = false) String settlementStatus,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        OutsourcingSettlementDto.SearchCondition cond =
            OutsourcingSettlementDto.SearchCondition.builder()
                .vendor(vendor)
                .settlementStatus(settlementStatus)
                .keyword(keyword)
                .startDate(startDate)
                .endDate(endDate)
                .page(page)
                .size(size)
                .build();
        return ApiResponse.success(settlementService.list(cond));
    }

    @Operation(summary = "거래처명 목록 (필터 드롭다운용)")
    @GetMapping("/vendors")
    public ApiResponse<List<String>> vendors() {
        return ApiResponse.success(settlementService.getVendorNames());
    }

    @Operation(summary = "외주정산 일괄 생성")
    @PostMapping
    public ApiResponse<List<OutsourcingSettlementDto.ListItem>> createBulk(
            @RequestBody OutsourcingSettlementDto.BulkCreateRequest request) {
        return ApiResponse.success(settlementService.createBulk(request));
    }

    @Operation(summary = "엑셀 업로드 (일괄 등록)")
    @PostMapping("/import")
    public ApiResponse<OutsourcingSettlementDto.ExcelImportResult> importExcel(
            @RequestParam("file") MultipartFile file) {
        return ApiResponse.success(settlementService.importExcel(file));
    }

    @Operation(summary = "엑셀 다운로드")
    @GetMapping("/export")
    public ResponseEntity<byte[]> exportExcel(
            @RequestParam(required = false) String vendor,
            @RequestParam(required = false) String settlementStatus,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate
    ) {
        OutsourcingSettlementDto.SearchCondition cond =
            OutsourcingSettlementDto.SearchCondition.builder()
                .vendor(vendor)
                .settlementStatus(settlementStatus)
                .keyword(keyword)
                .startDate(startDate)
                .endDate(endDate)
                .page(0)
                .size(Integer.MAX_VALUE)
                .build();

        byte[] excelBytes = settlementService.exportExcel(cond);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
        headers.setContentDisposition(
            ContentDisposition.attachment()
                .filename("outsourcing-settlement.xlsx")
                .build());

        return new ResponseEntity<>(excelBytes, headers, HttpStatus.OK);
    }

    @Operation(summary = "깃고 전자결재 연동")
    @PostMapping("/sync-gitgo")
    public ApiResponse<Void> syncGitgo(@RequestBody OutsourcingSettlementDto.BulkCreateRequest request) {
        // TODO: Implement gitgo integration in Phase 6+
        // 1. Collect settlement data for given IDs
        // 2. Call GitgoApiClient.submitApproval(...)
        // 3. Update gitgo_sync_status on each settlement
        return ApiResponse.success(null);
    }
}
```

- [ ] **3.7** Verify compilation: `./gradlew compileJava`
- [ ] **3.8** Write unit tests: bulk create, auto-settle rule, excel import validation

### Acceptance Criteria
- GET `/api/purchase/outsourcing-settlement` returns paginated/filtered results
- POST creates settlement records in bulk from PO IDs
- POST `/import` parses Excel, validates each row, returns success/fail counts + error details
- GET `/export` returns .xlsx binary with matching data
- Auto-settle rule: when all items for a PO have amount > 0, PO.settlementStatus -> SETTLED
- Validation catches: missing vendorName, negative quantity/unitPrice, amount mismatch

---

## Task 4: 엑셀 업로드/다운로드 공통 서비스

> 재사용 가능한 ExcelService. Apache POI 기반(backend). 다른 도메인에서도 사용 가능.

### Steps

- [ ] **4.1** Add Apache POI dependency to `sm-module-api/build.gradle`

```groovy
// build.gradle - dependencies block
implementation 'org.apache.poi:poi-ooxml:5.2.5'
```

- [ ] **4.2** Create `sm-module-api/src/main/java/com/tara/sm/common/util/ExcelService.java`

```java
package com.tara.sm.common.util;

import com.tara.sm.common.exception.BusinessException;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

@Service
@Slf4j
public class ExcelService {

    /**
     * 엑셀 다운로드용 바이트 배열 생성
     *
     * @param headers 컬럼 헤더 배열 (예: {"주문번호", "발주번호", "업체명", ...})
     * @param data    행 데이터 리스트 (각 행 = Object 배열)
     * @return .xlsx 바이트 배열
     */
    public byte[] exportToExcel(String[] headers, List<Object[]> data) {
        try (Workbook workbook = new XSSFWorkbook()) {
            Sheet sheet = workbook.createSheet("Sheet1");

            // --- Header style ---
            CellStyle headerStyle = workbook.createCellStyle();
            Font headerFont = workbook.createFont();
            headerFont.setBold(true);
            headerFont.setFontHeightInPoints((short) 11);
            headerStyle.setFont(headerFont);
            headerStyle.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            headerStyle.setBorderBottom(BorderStyle.THIN);
            headerStyle.setBorderTop(BorderStyle.THIN);
            headerStyle.setBorderLeft(BorderStyle.THIN);
            headerStyle.setBorderRight(BorderStyle.THIN);
            headerStyle.setAlignment(HorizontalAlignment.CENTER);

            // --- Number style (금액 컬럼용) ---
            CellStyle numberStyle = workbook.createCellStyle();
            DataFormat format = workbook.createDataFormat();
            numberStyle.setDataFormat(format.getFormat("#,##0"));

            // --- Date style ---
            CellStyle dateStyle = workbook.createCellStyle();
            dateStyle.setDataFormat(format.getFormat("yyyy-mm-dd"));

            // --- Write headers ---
            Row headerRow = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers[i]);
                cell.setCellStyle(headerStyle);
            }

            // --- Write data rows ---
            for (int rowIdx = 0; rowIdx < data.size(); rowIdx++) {
                Row row = sheet.createRow(rowIdx + 1);
                Object[] rowData = data.get(rowIdx);
                for (int colIdx = 0; colIdx < rowData.length; colIdx++) {
                    Cell cell = row.createCell(colIdx);
                    Object value = rowData[colIdx];

                    if (value == null) {
                        cell.setCellValue("");
                    } else if (value instanceof Number) {
                        cell.setCellValue(((Number) value).doubleValue());
                        cell.setCellStyle(numberStyle);
                    } else if (value instanceof java.time.LocalDate ld) {
                        cell.setCellValue(ld.toString());
                    } else if (value instanceof java.time.LocalDateTime ldt) {
                        cell.setCellValue(ldt.toString());
                    } else {
                        cell.setCellValue(value.toString());
                    }
                }
            }

            // --- Auto-size columns ---
            for (int i = 0; i < headers.length; i++) {
                sheet.autoSizeColumn(i);
                // Minimum width to prevent too-narrow columns
                int width = sheet.getColumnWidth(i);
                if (width < 3000) {
                    sheet.setColumnWidth(i, 3000);
                }
            }

            // --- Write to byte array ---
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return out.toByteArray();

        } catch (IOException e) {
            log.error("엑셀 생성 실패", e);
            throw new BusinessException("EXCEL_EXPORT_FAILED", "엑셀 파일 생성에 실패했습니다.");
        }
    }

    /**
     * 엑셀 업로드 파싱 (generic)
     *
     * @param file       업로드된 MultipartFile (.xlsx)
     * @param rowType    행 DTO 클래스 (현재 미사용, 타입 힌트용)
     * @param validator  행별 유효성 검증 함수 (에러 리스트 반환; empty = valid)
     * @param <T>        행 DTO 타입
     * @return 파싱된 행 리스트
     */
    public <T> List<T> importFromExcel(
            MultipartFile file,
            Class<T> rowType,
            Function<T, List<?>> validator) {

        validateFile(file);

        try (InputStream is = file.getInputStream();
             Workbook workbook = new XSSFWorkbook(is)) {

            Sheet sheet = workbook.getSheetAt(0);
            if (sheet == null) {
                throw new BusinessException("EXCEL_INVALID", "시트를 찾을 수 없습니다.");
            }

            // Skip header row (row 0), parse data from row 1
            int lastRowNum = sheet.getLastRowNum();
            log.info("엑셀 업로드: 총 {} 행 감지", lastRowNum);

            // The actual parsing is domain-specific.
            // This method provides the workbook; callers should implement
            // their own row-level mapping.
            // For OutsourcingSettlement, see parseSettlementRows() below.

            throw new UnsupportedOperationException(
                "Generic import requires domain-specific row mapper. " +
                "Use parseSettlementRows() for outsourcing settlements.");

        } catch (IOException e) {
            log.error("엑셀 파싱 실패", e);
            throw new BusinessException("EXCEL_IMPORT_FAILED", "엑셀 파일 읽기에 실패했습니다.");
        }
    }

    /**
     * 외주정산 전용 엑셀 파싱
     * Expected columns (0-based):
     *   0: 주문번호, 1: 발주번호, 2: 주문명, 3: 작업명,
     *   4: 업체명, 5: 수량, 6: 단가, 7: 금액
     */
    public List<ExcelParsedRow> parseSettlementRows(MultipartFile file) {
        validateFile(file);

        try (InputStream is = file.getInputStream();
             Workbook workbook = new XSSFWorkbook(is)) {

            Sheet sheet = workbook.getSheetAt(0);
            List<ExcelParsedRow> rows = new ArrayList<>();

            for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;

                ExcelParsedRow parsed = new ExcelParsedRow();
                parsed.setRowIndex(i + 1); // 1-based for user display
                parsed.setValues(new String[8]);

                for (int col = 0; col < 8; col++) {
                    Cell cell = row.getCell(col);
                    parsed.getValues()[col] = getCellValueAsString(cell);
                }
                rows.add(parsed);
            }
            return rows;

        } catch (IOException e) {
            throw new BusinessException("EXCEL_IMPORT_FAILED", "엑셀 파일 읽기에 실패했습니다.");
        }
    }

    // --- Helper types ---

    @lombok.Getter @lombok.Setter
    public static class ExcelParsedRow {
        private int rowIndex;
        private String[] values;
    }

    // --- Private helpers ---

    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException("EXCEL_EMPTY", "파일이 비어있습니다.");
        }
        String filename = file.getOriginalFilename();
        if (filename == null || (!filename.endsWith(".xlsx") && !filename.endsWith(".xls"))) {
            throw new BusinessException("EXCEL_INVALID_FORMAT",
                "엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.");
        }
        // Max 10MB
        if (file.getSize() > 10 * 1024 * 1024) {
            throw new BusinessException("EXCEL_TOO_LARGE",
                "파일 크기가 10MB를 초과합니다.");
        }
    }

    private String getCellValueAsString(Cell cell) {
        if (cell == null) return "";
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue().trim();
            case NUMERIC -> {
                if (DateUtil.isCellDateFormatted(cell)) {
                    yield cell.getLocalDateTimeCellValue().toLocalDate().toString();
                }
                // Remove decimal point for integer-like numbers
                double val = cell.getNumericCellValue();
                if (val == Math.floor(val) && !Double.isInfinite(val)) {
                    yield String.valueOf((long) val);
                }
                yield String.valueOf(val);
            }
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case FORMULA -> {
                try {
                    yield String.valueOf(cell.getNumericCellValue());
                } catch (Exception e) {
                    yield cell.getStringCellValue();
                }
            }
            default -> "";
        };
    }
}
```

- [ ] **4.3** Verify compilation and add unit tests for exportToExcel and parseSettlementRows

### Acceptance Criteria
- `exportToExcel(headers, data)` produces valid .xlsx with styled headers, number formatting, auto-width columns
- `parseSettlementRows(file)` reads .xlsx row by row, skipping header
- File validation: rejects null/empty, non-xlsx, files > 10MB
- Number cells without decimals read as integer strings (no ".0" suffix)
- Date cells formatted as YYYY-MM-DD

---

## Task 5: 외주발주목록 Frontend (OutsourcingPoPage)

> React page for 외주발주 list with search filters, DataTable, inline settlement toggle, PDF button.

### Steps

- [ ] **5.1** Create API layer `sm-module-web/src/api/purchase.api.ts`

```typescript
import { client } from './client';
import type { ApiResponse, PageResponse } from '../types/common';

// ===== OutsourcingPo Types =====

export interface OutsourcingPoListItem {
  id: number;
  poNo: string;
  receivedDate: string;
  departmentName: string;
  workTitle: string;
  businessOwnerName: string;
  orderAmount: number;
  salesManagerName: string;
  outsourcingAmount: number;
  outsourcingManagerName: string;
  status: string;
  settlementStatus: string;
  deliveryDate: string;
  orderId: number;
  orderNo: string;
}

export interface OutsourcingPoSearchParams {
  departmentId?: number;
  status?: string;
  startDate?: string;
  endDate?: string;
  keyword?: string;
  page?: number;
  size?: number;
}

export interface SettlementStatusRequest {
  status: string;
}

// ===== OutsourcingSettlement Types =====

export interface OutsourcingSettlementListItem {
  id: number;
  outsourcingPoId: number;
  orderNo: string;
  poNo: string;
  orderName: string;
  workName: string;
  vendorName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  settlementStatus: string;
  gitgoSyncStatus: string;
  createdAt: string;
}

export interface OutsourcingSettlementSearchParams {
  vendor?: string;
  settlementStatus?: string;
  keyword?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  size?: number;
}

export interface ExcelImportResult {
  successCount: number;
  failCount: number;
  totalCount: number;
  errors: Array<{
    rowIndex: number;
    field: string;
    message: string;
  }>;
}

// ===== OutsourcingPo API =====

export const outsourcingPoApi = {
  list: (params: OutsourcingPoSearchParams) =>
    client.get<ApiResponse<PageResponse<OutsourcingPoListItem>>>(
      '/api/purchase/outsourcing-po', { params }
    ).then(res => res.data),

  detail: (id: number) =>
    client.get<ApiResponse<OutsourcingPoListItem>>(
      `/api/purchase/outsourcing-po/${id}`
    ).then(res => res.data),

  confirm: (id: number) =>
    client.patch<ApiResponse<void>>(
      `/api/purchase/outsourcing-po/${id}/confirm`
    ).then(res => res.data),

  changeSettlementStatus: (id: number, request: SettlementStatusRequest) =>
    client.patch<ApiResponse<void>>(
      `/api/purchase/outsourcing-po/${id}/settlement-status`, request
    ).then(res => res.data),

  downloadPdf: (id: number) =>
    client.get(`/api/purchase/outsourcing-po/${id}/document`, {
      responseType: 'blob',
    }),
};

// ===== OutsourcingSettlement API =====

export const outsourcingSettlementApi = {
  list: (params: OutsourcingSettlementSearchParams) =>
    client.get<ApiResponse<PageResponse<OutsourcingSettlementListItem>>>(
      '/api/purchase/outsourcing-settlement', { params }
    ).then(res => res.data),

  vendors: () =>
    client.get<ApiResponse<string[]>>(
      '/api/purchase/outsourcing-settlement/vendors'
    ).then(res => res.data),

  createBulk: (outsourcingPoIds: number[]) =>
    client.post<ApiResponse<OutsourcingSettlementListItem[]>>(
      '/api/purchase/outsourcing-settlement',
      { outsourcingPoIds }
    ).then(res => res.data),

  importExcel: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return client.post<ApiResponse<ExcelImportResult>>(
      '/api/purchase/outsourcing-settlement/import',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    ).then(res => res.data);
  },

  exportExcel: (params: OutsourcingSettlementSearchParams) =>
    client.get('/api/purchase/outsourcing-settlement/export', {
      params,
      responseType: 'blob',
    }),

  syncGitgo: (settlementIds: number[]) =>
    client.post<ApiResponse<void>>(
      '/api/purchase/outsourcing-settlement/sync-gitgo',
      { outsourcingPoIds: settlementIds }
    ).then(res => res.data),
};
```

- [ ] **5.2** Create types `sm-module-web/src/types/purchase.ts`

```typescript
export type PoStatus = 'SALES_CONFIRMED' | 'SETTLEMENT_DONE' | 'SHIPPED';
export type SettlementStatusType = 'UNSETTLED' | 'SETTLED';

export const PO_STATUS_LABELS: Record<string, string> = {
  SALES_CONFIRMED: '매출확정',
  SETTLEMENT_DONE: '정산완료',
  SHIPPED: '발송완료',
};

export const SETTLEMENT_STATUS_LABELS: Record<string, string> = {
  UNSETTLED: '미정산',
  SETTLED: '정산완료',
};

export const PO_STATUS_OPTIONS = [
  { label: '전체', value: '' },
  { label: '매출확정', value: 'SALES_CONFIRMED' },
  { label: '정산완료', value: 'SETTLEMENT_DONE' },
  { label: '발송완료', value: 'SHIPPED' },
];

export const SETTLEMENT_STATUS_OPTIONS = [
  { label: '전체', value: '' },
  { label: '미정산', value: 'UNSETTLED' },
  { label: '정산완료', value: 'SETTLED' },
];
```

- [ ] **5.3** Create page `sm-module-web/src/pages/purchase/OutsourcingPoPage.tsx`

```tsx
import React, { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button, DatePicker, Input, Select, Space, Table, Tag, message, Tooltip,
} from 'antd';
import { DownloadOutlined, FileTextOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';

import PageLayout from '../../components/layout/PageLayout';
import {
  outsourcingPoApi,
  type OutsourcingPoListItem,
  type OutsourcingPoSearchParams,
} from '../../api/purchase.api';
import {
  PO_STATUS_LABELS,
  PO_STATUS_OPTIONS,
  SETTLEMENT_STATUS_LABELS,
} from '../../types/purchase';
import { useDepartments } from '../../hooks/useDepartments'; // assumed from Phase 1
import { formatAmount } from '../../utils/format'; // assumed: e.g., "1,234,567"

const { RangePicker } = DatePicker;

const OutsourcingPoPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // --- Search state ---
  const [departmentId, setDepartmentId] = useState<number | undefined>();
  const [status, setStatus] = useState<string>('');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  // --- Departments (from Phase 1 hook) ---
  const { departments } = useDepartments();

  // --- Build search params ---
  const searchParams: OutsourcingPoSearchParams = useMemo(() => ({
    departmentId: departmentId || undefined,
    status: status || undefined,
    startDate: dateRange[0]?.format('YYYY-MM-DD') || undefined,
    endDate: dateRange[1]?.format('YYYY-MM-DD') || undefined,
    keyword: keyword || undefined,
    page,
    size: pageSize,
  }), [departmentId, status, dateRange, keyword, page, pageSize]);

  // --- Query ---
  const { data, isLoading } = useQuery({
    queryKey: ['outsourcing-po', searchParams],
    queryFn: () => outsourcingPoApi.list(searchParams),
  });

  const pageData = data?.data;

  // --- Settlement status toggle mutation ---
  const settlementMutation = useMutation({
    mutationFn: ({ id, newStatus }: { id: number; newStatus: string }) =>
      outsourcingPoApi.changeSettlementStatus(id, { status: newStatus }),
    onSuccess: () => {
      message.success('정산여부가 변경되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['outsourcing-po'] });
    },
    onError: () => {
      message.error('정산여부 변경에 실패했습니다.');
    },
  });

  // --- PDF download ---
  const handlePdfDownload = useCallback(async (id: number, poNo: string) => {
    try {
      const response = await outsourcingPoApi.downloadPdf(id);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${poNo}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      message.error('PDF 다운로드에 실패했습니다.');
    }
  }, []);

  // --- Search handler ---
  const handleSearch = useCallback(() => {
    setPage(0);
  }, []);

  // --- Table columns ---
  const columns: ColumnsType<OutsourcingPoListItem> = useMemo(() => [
    {
      title: '#',
      key: 'index',
      width: 50,
      align: 'center',
      render: (_: unknown, __: OutsourcingPoListItem, index: number) =>
        page * pageSize + index + 1,
    },
    {
      title: '접수일',
      dataIndex: 'receivedDate',
      key: 'receivedDate',
      width: 110,
      align: 'center',
    },
    {
      title: '영업부서',
      dataIndex: 'departmentName',
      key: 'departmentName',
      width: 120,
    },
    {
      title: '작업제목',
      dataIndex: 'workTitle',
      key: 'workTitle',
      width: 250,
      ellipsis: true,
      render: (text: string, record: OutsourcingPoListItem) => (
        <a onClick={() => navigate(`/orders/${record.orderId}`)}>
          {text}
        </a>
      ),
    },
    {
      title: '회사명',
      dataIndex: 'businessOwnerName',
      key: 'businessOwnerName',
      width: 150,
      ellipsis: true,
    },
    {
      title: '수주금액',
      dataIndex: 'orderAmount',
      key: 'orderAmount',
      width: 120,
      align: 'right',
      render: (val: number) => formatAmount(val),
    },
    {
      title: '영업담당자',
      dataIndex: 'salesManagerName',
      key: 'salesManagerName',
      width: 100,
      align: 'center',
    },
    {
      title: '외주금액',
      dataIndex: 'outsourcingAmount',
      key: 'outsourcingAmount',
      width: 120,
      align: 'right',
      render: (val: number) => formatAmount(val),
    },
    {
      title: '외주담당',
      dataIndex: 'outsourcingManagerName',
      key: 'outsourcingManagerName',
      width: 100,
      align: 'center',
    },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      render: (val: string) => {
        const colors: Record<string, string> = {
          SALES_CONFIRMED: 'blue',
          SETTLEMENT_DONE: 'green',
          SHIPPED: 'orange',
        };
        return <Tag color={colors[val] || 'default'}>{PO_STATUS_LABELS[val] || val}</Tag>;
      },
    },
    {
      title: '정산여부',
      dataIndex: 'settlementStatus',
      key: 'settlementStatus',
      width: 120,
      align: 'center',
      render: (val: string, record: OutsourcingPoListItem) => (
        <Select
          value={val}
          size="small"
          style={{ width: 100 }}
          onChange={(newVal) =>
            settlementMutation.mutate({ id: record.id, newStatus: newVal })
          }
          options={[
            { label: '미정산', value: 'UNSETTLED' },
            { label: '정산완료', value: 'SETTLED' },
          ]}
        />
      ),
    },
    {
      title: '납품일',
      dataIndex: 'deliveryDate',
      key: 'deliveryDate',
      width: 110,
      align: 'center',
    },
    {
      title: '출력',
      key: 'actions',
      width: 80,
      align: 'center',
      render: (_: unknown, record: OutsourcingPoListItem) => (
        <Tooltip title="발주서 PDF">
          <Button
            type="link"
            icon={<FileTextOutlined />}
            onClick={() => handlePdfDownload(record.id, record.poNo)}
          />
        </Tooltip>
      ),
    },
  ], [page, pageSize, navigate, settlementMutation, handlePdfDownload]);

  return (
    <PageLayout
      title="외주발주목록"
      breadcrumb={['매입마감', '외주발주목록']}
    >
      {/* ===== Search Bar ===== */}
      <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Select
          placeholder="영업부서"
          allowClear
          style={{ width: 150 }}
          value={departmentId}
          onChange={setDepartmentId}
          options={[
            { label: '전체', value: undefined as unknown as number },
            ...(departments?.map(d => ({ label: d.name, value: d.id })) || []),
          ]}
        />

        <Select
          placeholder="상태"
          allowClear
          style={{ width: 130 }}
          value={status || undefined}
          onChange={(val) => setStatus(val || '')}
          options={PO_STATUS_OPTIONS}
        />

        <RangePicker
          value={dateRange}
          onChange={(dates) =>
            setDateRange(dates ? [dates[0], dates[1]] : [null, null])
          }
          placeholder={['시작일', '종료일']}
          style={{ width: 250 }}
        />

        <Input
          placeholder="회사명, 작업제목, 주문번호"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 250 }}
          suffix={<SearchOutlined />}
        />

        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
          조회
        </Button>
      </div>

      {/* ===== Table ===== */}
      <Table<OutsourcingPoListItem>
        rowKey="id"
        columns={columns}
        dataSource={pageData?.content || []}
        loading={isLoading}
        size="small"
        scroll={{ x: 1600 }}
        pagination={{
          current: page + 1,
          pageSize,
          total: pageData?.totalElements || 0,
          showSizeChanger: true,
          showTotal: (total) => `총 ${total}건`,
          onChange: (p, s) => {
            setPage(p - 1);
            setPageSize(s);
          },
        }}
      />
    </PageLayout>
  );
};

export default OutsourcingPoPage;
```

- [ ] **5.4** Verify TypeScript compilation: `npx tsc --noEmit`

### Acceptance Criteria
- Search bar: 영업부서 Select, 상태 Select, DateRangePicker, keyword Input, 조회 Button
- DataTable with all columns from spec 6.7 (외주발주목록)
- 정산여부 column renders as inline Select (UNSETTLED/SETTLED) with instant mutation
- 작업제목 links to `/orders/{orderId}` (주문상세)
- 발주서 PDF button downloads .pdf blob
- Pagination synced with backend (page/size)
- 금액 columns formatted with comma separator

---

## Task 6: 외주정산등록 Frontend (OutsourcingSettlementPage)

> React page with search, DataTable + checkboxes, 엑셀 업로드/다운로드, 하단 요약, 업로드 모달.

### Steps

- [ ] **6.1** Create excel upload modal component `sm-module-web/src/components/common/ExcelUploadModal.tsx`

```tsx
import React, { useState, useCallback } from 'react';
import { Modal, Upload, Button, Table, Alert, Space, Tag, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import * as XLSX from 'xlsx';

const { Dragger } = Upload;

export interface ExcelPreviewRow {
  key: number;
  rowIndex: number;
  values: string[];
  errors: Array<{ field: string; message: string }>;
  isValid: boolean;
}

export interface ExcelUploadModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (file: File) => Promise<void>;
  expectedHeaders: string[];
  /** Client-side row validator (optional). Return error messages or empty array. */
  validateRow?: (values: string[], rowIndex: number) => Array<{ field: string; message: string }>;
  title?: string;
}

const ExcelUploadModal: React.FC<ExcelUploadModalProps> = ({
  open,
  onCancel,
  onConfirm,
  expectedHeaders,
  validateRow,
  title = '엑셀 업로드',
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<ExcelPreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorCount, setErrorCount] = useState(0);

  // --- Parse uploaded file for preview ---
  const handleFileParse = useCallback((uploadedFile: File) => {
    setFile(uploadedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData: string[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: '',
        });

        // Skip header row
        const rows = jsonData.slice(1).filter((row) =>
          row.some((cell) => cell !== '')
        );

        let errCount = 0;
        const preview: ExcelPreviewRow[] = rows.map((row, idx) => {
          const errors = validateRow ? validateRow(row.map(String), idx + 2) : [];
          if (errors.length > 0) errCount++;
          return {
            key: idx,
            rowIndex: idx + 2,
            values: row.map(String),
            errors,
            isValid: errors.length === 0,
          };
        });

        setPreviewData(preview);
        setErrorCount(errCount);
      } catch {
        message.error('엑셀 파일을 읽을 수 없습니다.');
      }
    };
    reader.readAsArrayBuffer(uploadedFile);
  }, [validateRow]);

  // --- Confirm upload ---
  const handleConfirm = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    try {
      await onConfirm(file);
      // Reset state on success
      setFile(null);
      setPreviewData([]);
      setErrorCount(0);
    } catch {
      message.error('업로드에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [file, onConfirm]);

  // --- Reset on cancel ---
  const handleCancel = useCallback(() => {
    setFile(null);
    setPreviewData([]);
    setErrorCount(0);
    onCancel();
  }, [onCancel]);

  // --- Preview columns ---
  const previewColumns = [
    {
      title: '행',
      dataIndex: 'rowIndex',
      width: 50,
      align: 'center' as const,
    },
    ...expectedHeaders.map((header, idx) => ({
      title: header,
      key: `col_${idx}`,
      render: (_: unknown, record: ExcelPreviewRow) => record.values[idx] || '',
      ellipsis: true,
    })),
    {
      title: '검증',
      key: 'validation',
      width: 120,
      render: (_: unknown, record: ExcelPreviewRow) =>
        record.isValid ? (
          <Tag color="green">OK</Tag>
        ) : (
          <Tag color="red">{record.errors.length}건 오류</Tag>
        ),
    },
  ];

  return (
    <Modal
      title={title}
      open={open}
      onCancel={handleCancel}
      width={1000}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          취소
        </Button>,
        <Button
          key="upload"
          type="primary"
          loading={loading}
          disabled={!file || errorCount > 0}
          onClick={handleConfirm}
        >
          업로드 확인 ({previewData.length - errorCount}건)
        </Button>,
      ]}
    >
      {/* File dropper */}
      {!file && (
        <Dragger
          accept=".xlsx,.xls"
          maxCount={1}
          showUploadList={false}
          beforeUpload={(f) => {
            handleFileParse(f);
            return false; // prevent auto-upload
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">
            엑셀 파일(.xlsx)을 드래그하거나 클릭하여 선택하세요
          </p>
          <p className="ant-upload-hint">
            예상 컬럼: {expectedHeaders.join(', ')}
          </p>
        </Dragger>
      )}

      {/* Preview */}
      {file && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type={errorCount > 0 ? 'warning' : 'success'}
            message={`파일: ${file.name} | 총 ${previewData.length}건 | 성공 ${previewData.length - errorCount}건 | 오류 ${errorCount}건`}
            showIcon
          />

          <Table
            dataSource={previewData}
            columns={previewColumns}
            size="small"
            scroll={{ x: 900, y: 400 }}
            pagination={false}
          />

          <Button
            onClick={() => {
              setFile(null);
              setPreviewData([]);
              setErrorCount(0);
            }}
          >
            다른 파일 선택
          </Button>
        </Space>
      )}
    </Modal>
  );
};

export default ExcelUploadModal;
```

- [ ] **6.2** Create page `sm-module-web/src/pages/purchase/OutsourcingSettlementPage.tsx`

```tsx
import React, { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button, DatePicker, Input, Select, Space, Table, Tag, message, Typography,
} from 'antd';
import {
  DownloadOutlined, SearchOutlined, UploadOutlined,
} from '@ant-design/icons';
import type { ColumnsType, TableRowSelection } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import * as XLSX from 'xlsx';

import PageLayout from '../../components/layout/PageLayout';
import ExcelUploadModal from '../../components/common/ExcelUploadModal';
import {
  outsourcingSettlementApi,
  type OutsourcingSettlementListItem,
  type OutsourcingSettlementSearchParams,
} from '../../api/purchase.api';
import {
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_OPTIONS,
} from '../../types/purchase';
import { formatAmount } from '../../utils/format';

const { RangePicker } = DatePicker;
const { Text } = Typography;

const EXCEL_HEADERS = [
  '주문번호', '발주번호', '주문명', '작업명', '업체명', '수량', '단가', '금액',
];

const OutsourcingSettlementPage: React.FC = () => {
  const queryClient = useQueryClient();

  // --- Search state ---
  const [vendor, setVendor] = useState<string | undefined>();
  const [settlementStatus, setSettlementStatus] = useState<string>('');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // --- Search params ---
  const searchParams: OutsourcingSettlementSearchParams = useMemo(() => ({
    vendor: vendor || undefined,
    settlementStatus: settlementStatus || undefined,
    startDate: dateRange[0]?.format('YYYY-MM-DD') || undefined,
    endDate: dateRange[1]?.format('YYYY-MM-DD') || undefined,
    keyword: keyword || undefined,
    page,
    size: pageSize,
  }), [vendor, settlementStatus, dateRange, keyword, page, pageSize]);

  // --- Queries ---
  const { data, isLoading } = useQuery({
    queryKey: ['outsourcing-settlement', searchParams],
    queryFn: () => outsourcingSettlementApi.list(searchParams),
  });

  const { data: vendorsData } = useQuery({
    queryKey: ['outsourcing-settlement-vendors'],
    queryFn: () => outsourcingSettlementApi.vendors(),
  });

  const pageData = data?.data;
  const vendorOptions = [
    { label: '전체', value: '' },
    ...(vendorsData?.data?.map(v => ({ label: v, value: v })) || []),
  ];

  // --- Row selection ---
  const rowSelection: TableRowSelection<OutsourcingSettlementListItem> = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
  };

  // --- Selected rows summary ---
  const selectedRows = useMemo(() => {
    const content = pageData?.content || [];
    return content.filter(item => selectedRowKeys.includes(item.id));
  }, [pageData, selectedRowKeys]);

  const selectedSummary = useMemo(() => ({
    count: selectedRows.length,
    totalAmount: selectedRows.reduce((sum, item) => sum + (item.amount || 0), 0),
  }), [selectedRows]);

  // --- Excel download ---
  const handleExcelDownload = useCallback(async () => {
    try {
      const response = await outsourcingSettlementApi.exportExcel(searchParams);
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `외주정산_${dayjs().format('YYYYMMDD')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      message.error('엑셀 다운로드에 실패했습니다.');
    }
  }, [searchParams]);

  // --- Excel upload confirm ---
  const handleExcelUpload = useCallback(async (file: File) => {
    const result = await outsourcingSettlementApi.importExcel(file);
    if (result.data) {
      const { successCount, failCount } = result.data;
      if (failCount > 0) {
        message.warning(`업로드 완료: 성공 ${successCount}건, 실패 ${failCount}건`);
      } else {
        message.success(`업로드 완료: ${successCount}건 등록되었습니다.`);
      }
      setUploadModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['outsourcing-settlement'] });
    }
  }, [queryClient]);

  // --- Client-side row validation for preview ---
  const validateRow = useCallback((values: string[], rowIndex: number) => {
    const errors: Array<{ field: string; message: string }> = [];
    // Col 4: 업체명 (required)
    if (!values[4]?.trim()) {
      errors.push({ field: '업체명', message: `행 ${rowIndex}: 업체명은 필수입니다.` });
    }
    // Col 5: 수량 (numeric, >= 0)
    const qty = Number(values[5]);
    if (values[5] && (isNaN(qty) || qty < 0)) {
      errors.push({ field: '수량', message: `행 ${rowIndex}: 수량은 0 이상 숫자여야 합니다.` });
    }
    // Col 6: 단가 (numeric, >= 0)
    const price = Number(values[6]);
    if (values[6] && (isNaN(price) || price < 0)) {
      errors.push({ field: '단가', message: `행 ${rowIndex}: 단가는 0 이상 숫자여야 합니다.` });
    }
    return errors;
  }, []);

  // --- Search handler ---
  const handleSearch = useCallback(() => {
    setPage(0);
    setSelectedRowKeys([]);
  }, []);

  // --- Table columns ---
  const columns: ColumnsType<OutsourcingSettlementListItem> = useMemo(() => [
    {
      title: '주문번호',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 160,
    },
    {
      title: '발주번호',
      dataIndex: 'poNo',
      key: 'poNo',
      width: 140,
    },
    {
      title: '주문명',
      dataIndex: 'orderName',
      key: 'orderName',
      width: 200,
      ellipsis: true,
    },
    {
      title: '작업명',
      dataIndex: 'workName',
      key: 'workName',
      width: 150,
      ellipsis: true,
    },
    {
      title: '업체명',
      dataIndex: 'vendorName',
      key: 'vendorName',
      width: 150,
    },
    {
      title: '수량',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      align: 'right',
      render: (val: number) => val?.toLocaleString() || '0',
    },
    {
      title: '단가',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 100,
      align: 'right',
      render: (val: number) => formatAmount(val),
    },
    {
      title: '금액',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      align: 'right',
      render: (val: number) => (
        <Text strong>{formatAmount(val)}</Text>
      ),
    },
    {
      title: '정산여부',
      dataIndex: 'settlementStatus',
      key: 'settlementStatus',
      width: 100,
      align: 'center',
      render: (val: string) => (
        <Tag color={val === 'SETTLED' ? 'green' : 'default'}>
          {SETTLEMENT_STATUS_LABELS[val] || val}
        </Tag>
      ),
    },
  ], []);

  return (
    <PageLayout
      title="외주정산등록"
      breadcrumb={['매입마감', '외주정산등록']}
    >
      {/* ===== Search Bar ===== */}
      <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <RangePicker
          value={dateRange}
          onChange={(dates) =>
            setDateRange(dates ? [dates[0], dates[1]] : [null, null])
          }
          placeholder={['시작일', '종료일']}
          style={{ width: 250 }}
        />

        <Select
          placeholder="거래처명"
          allowClear
          style={{ width: 160 }}
          value={vendor}
          onChange={(val) => setVendor(val || undefined)}
          options={vendorOptions}
          showSearch
          filterOption={(input, option) =>
            (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
          }
        />

        <Select
          placeholder="정산여부"
          allowClear
          style={{ width: 130 }}
          value={settlementStatus || undefined}
          onChange={(val) => setSettlementStatus(val || '')}
          options={SETTLEMENT_STATUS_OPTIONS}
        />

        <Input
          placeholder="주문번호/발주번호/거래처명"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 250 }}
          suffix={<SearchOutlined />}
        />

        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
          조회
        </Button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button icon={<UploadOutlined />} onClick={() => setUploadModalOpen(true)}>
            엑셀업로드
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExcelDownload}>
            엑셀다운로드
          </Button>
        </div>
      </div>

      {/* ===== Table ===== */}
      <Table<OutsourcingSettlementListItem>
        rowKey="id"
        rowSelection={rowSelection}
        columns={columns}
        dataSource={pageData?.content || []}
        loading={isLoading}
        size="small"
        scroll={{ x: 1300 }}
        pagination={{
          current: page + 1,
          pageSize,
          total: pageData?.totalElements || 0,
          showSizeChanger: true,
          showTotal: (total) => `총 ${total}건`,
          onChange: (p, s) => {
            setPage(p - 1);
            setPageSize(s);
          },
        }}
      />

      {/* ===== Bottom summary bar ===== */}
      <div
        style={{
          marginTop: 16,
          padding: '12px 16px',
          background: '#fafafa',
          borderRadius: 4,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          border: '1px solid #f0f0f0',
        }}
      >
        <Space size="large">
          <Text>
            선택: <Text strong>{selectedSummary.count}건</Text>
          </Text>
          <Text>
            합계 금액: <Text strong style={{ color: '#1677ff', fontSize: 16 }}>
              {formatAmount(selectedSummary.totalAmount)}원
            </Text>
          </Text>
        </Space>

        <Button
          type="primary"
          disabled={selectedSummary.count === 0}
          onClick={() => {
            message.info(`${selectedSummary.count}건 정산 생성 처리 예정`);
            // TODO: Call outsourcingSettlementApi.syncGitgo(selectedRowKeys as number[])
          }}
        >
          외주정산 생성
        </Button>
      </div>

      {/* ===== Excel Upload Modal ===== */}
      <ExcelUploadModal
        open={uploadModalOpen}
        onCancel={() => setUploadModalOpen(false)}
        onConfirm={handleExcelUpload}
        expectedHeaders={EXCEL_HEADERS}
        validateRow={validateRow}
        title="외주정산 엑셀 업로드"
      />
    </PageLayout>
  );
};

export default OutsourcingSettlementPage;
```

- [ ] **6.3** Verify TypeScript compilation: `npx tsc --noEmit`

### Acceptance Criteria
- Search bar: DateRangePicker, 거래처명 Select (dynamic from API), 정산여부 Select, keyword Input, 조회/엑셀업로드/엑셀다운로드 Buttons
- DataTable with checkbox selection (전체선택 포함)
- Columns: 주문번호, 발주번호, 주문명, 작업명, 업체명, 수량, 단가, 금액, 정산여부 (per spec 6.7)
- Bottom summary bar: "선택: N건 | 합계 금액: X,XXX,XXX원"
- Excel upload modal: file drag/drop -> SheetJS client-side parse -> preview table with per-row validation -> confirm button sends to server
- Excel download: backend returns .xlsx blob, triggers browser download
- 금액 formatting with comma separator

---

## Task 7: 라우팅 + 메뉴

> Wire new pages into React Router and AppHeader dropdown.

### Steps

- [ ] **7.1** Update route configuration `sm-module-web/src/routes/index.tsx` (or `routes.tsx`)

Add the following route entries inside the authenticated layout route:

```tsx
// Inside <Route element={<AuthenticatedLayout />}>

import OutsourcingPoPage from '../pages/purchase/OutsourcingPoPage';
import OutsourcingSettlementPage from '../pages/purchase/OutsourcingSettlementPage';

// ... existing routes ...

{/* 매입마감 */}
<Route path="/purchase/outsourcing-po" element={<OutsourcingPoPage />} />
<Route path="/purchase/outsourcing-settlement" element={<OutsourcingSettlementPage />} />
```

- [ ] **7.2** Update `sm-module-web/src/components/layout/AppHeader.tsx` - add 매입마감 dropdown

Locate the navigation menu items array and add:

```tsx
// In the headerMenuItems or equivalent navigation config:

{
  key: 'purchase',
  label: '매입마감',
  children: [
    {
      key: '/purchase/outsourcing-po',
      label: <Link to="/purchase/outsourcing-po">외주발주목록</Link>,
    },
    {
      key: '/purchase/outsourcing-settlement',
      label: <Link to="/purchase/outsourcing-settlement">외주정산등록</Link>,
    },
  ],
},
```

This follows the Ant Design Menu `items` pattern with `children` for dropdown submenus, consistent with how 정보관리, 주문관리, 매출관리 menus are structured in prior phases.

- [ ] **7.3** Verify navigation: click "매입마감" in header -> dropdown shows "외주발주목록" and "외주정산등록" -> clicking navigates correctly
- [ ] **7.4** Verify breadcrumb renders correctly on both pages: "매입마감 > 외주발주목록" and "매입마감 > 외주정산등록"

### Acceptance Criteria
- `/purchase/outsourcing-po` renders OutsourcingPoPage
- `/purchase/outsourcing-settlement` renders OutsourcingSettlementPage
- AppHeader shows "매입마감" with dropdown containing both sub-menu items
- Active menu item highlighted when on corresponding page
- Breadcrumb displays correct hierarchy
- Unauthenticated users redirected to /login (ProtectedRoute)

---

## File Index

All files created or modified in this phase:

| # | Path | Action |
|---|------|--------|
| 1 | `sm-module-api/src/main/resources/db/migration/V5__create_purchase_tables.sql` | CREATE |
| 2 | `sm-module-api/src/main/java/com/tara/sm/purchase/entity/OutsourcingPo.java` | CREATE |
| 3 | `sm-module-api/src/main/java/com/tara/sm/purchase/entity/OutsourcingSettlement.java` | CREATE |
| 4 | `sm-module-api/src/main/java/com/tara/sm/purchase/entity/PoStatus.java` | CREATE |
| 5 | `sm-module-api/src/main/java/com/tara/sm/purchase/entity/SettlementStatus.java` | CREATE |
| 6 | `sm-module-api/src/main/java/com/tara/sm/purchase/dto/OutsourcingPoDto.java` | CREATE |
| 7 | `sm-module-api/src/main/java/com/tara/sm/purchase/dto/OutsourcingSettlementDto.java` | CREATE |
| 8 | `sm-module-api/src/main/java/com/tara/sm/purchase/repository/OutsourcingPoRepository.java` | CREATE |
| 9 | `sm-module-api/src/main/java/com/tara/sm/purchase/repository/OutsourcingPoQueryRepository.java` | CREATE |
| 10 | `sm-module-api/src/main/java/com/tara/sm/purchase/repository/OutsourcingSettlementRepository.java` | CREATE |
| 11 | `sm-module-api/src/main/java/com/tara/sm/purchase/repository/OutsourcingSettlementQueryRepository.java` | CREATE |
| 12 | `sm-module-api/src/main/java/com/tara/sm/purchase/service/OutsourcingPoService.java` | CREATE |
| 13 | `sm-module-api/src/main/java/com/tara/sm/purchase/service/OutsourcingSettlementService.java` | CREATE |
| 14 | `sm-module-api/src/main/java/com/tara/sm/purchase/controller/OutsourcingPoController.java` | CREATE |
| 15 | `sm-module-api/src/main/java/com/tara/sm/purchase/controller/OutsourcingSettlementController.java` | CREATE |
| 16 | `sm-module-api/src/main/java/com/tara/sm/common/util/ExcelService.java` | CREATE |
| 17 | `sm-module-api/build.gradle` | MODIFY (add POI dependency) |
| 18 | `sm-module-web/src/api/purchase.api.ts` | CREATE |
| 19 | `sm-module-web/src/types/purchase.ts` | CREATE |
| 20 | `sm-module-web/src/pages/purchase/OutsourcingPoPage.tsx` | CREATE |
| 21 | `sm-module-web/src/pages/purchase/OutsourcingSettlementPage.tsx` | CREATE |
| 22 | `sm-module-web/src/components/common/ExcelUploadModal.tsx` | CREATE |
| 23 | `sm-module-web/src/routes/index.tsx` | MODIFY (add purchase routes) |
| 24 | `sm-module-web/src/components/layout/AppHeader.tsx` | MODIFY (add purchase menu) |

---

## Dependencies & Assumptions

1. **Phase 1-3 complete**: `orders`, `departments`, `users`, `business_owners` tables exist; `BaseEntity`, `ApiResponse`, `BusinessException`, `SequenceNumberGenerator`, `PageLayout`, `useDepartments`, `formatAmount`, `client.ts` all available.
2. **Flyway V1-V4 applied**: migrations ran successfully before V5.
3. **QueryDSL configured**: `JPAQueryFactory` bean registered, Q-classes generated via annotation processing.
4. **Apache POI**: added to `build.gradle` in Task 4.1.
5. **SheetJS (`xlsx`)**: already in `package.json` per spec 1.2 tech stack.
6. **PDF generation** (Task 2 `generatePdf`): placeholder implementation. Full PDF rendering (Thymeleaf + Flying Saucer) deferred or addressed in a follow-up task.
7. **Gitgo integration** (Task 3 `syncGitgo`): placeholder. Full integration deferred to Phase 6+.
