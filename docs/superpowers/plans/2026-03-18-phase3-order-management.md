# Phase 3: 주문관리 구현 계획서

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans

**Goal:** 주문목록(SM+ERP 통합), 주문등록(2탭 폼), 주문상세/수정, 주문번호 동시성 처리, 매출등록, 엑셀다운로드
**Architecture:** order 도메인. OrderMst→OrderDtl→OrderInfo→OrderDlv 4계층. 복합PK 아키텍처(company_cd, plant_cd 기반). 시퀀스 테이블 + SELECT FOR UPDATE.
**Tech Stack:** Spring Boot 3.x, JPA, QueryDSL | React 18, Ant Design Tabs, React Hook Form + Zod
**Spec:** Section 4.3, 5.4, 6.5, 7.5, 12.10, 12.11, 12.13

> **변경이력:**
> - 2026-03-18: 최초 작성
> - 2026-03-26: 복합PK 아키텍처 전환, 비정규화, 주문번호 규칙 변경(GSM prefix), 영업부서/사번 체계 변경, wrk_fg 추가
> - 2026-03-27: order_info에 ord_partner_cd 추가
> - 2026-04-06: work_name→세부품목명 명명변경, 주문상태 6단계 확장, 매출등록 모달, 주문목록 ERP통합, order_dlv 신규 테이블
> - 2026-04-07: 계획서 전면 갱신 (현행 코드 기준), Oracle 연동 방식 확정, 코드 분석 결과 반영
>
> **코드 분석 결과 (2026-04-07):**
> - 주문목록 FE 완성, BE 완성. **수정 필요:** 매출등록 체크박스 선택UI 없음 (버튼+API 존재, DataTable 체크박스 컬럼 누락). 하드코딩 통계("검토대기 12건", "출고 28건") 제거 필요.
> - 주문등록 FE 완성, BE 완성. **버그:** 주문수정 시 success 반환하지만 실제 수정 안됨 (P0).
> - OrderCreatePage: 상태변경 워크플로우, 탭 레이아웃, zod 검증 모두 정상 구현됨.
>
> **Oracle 연동 확정 (2026-04-07):**
> - 주문 조회: `SD_ORDER_MST_X20329` + `SD_ORDER_DTL_X20329` 직접 조회 (ErpOrderRepository)
>   - 복합 JOIN: CI_PARTNER_MST(거래처명), VW_MA_DEPT_MST(부서명), HR_EMP_MST(담당자명)
>   - WRK_FG 상태 매핑: 100=PENDING, 200/202=CONFIRMED, 300=SHIPPED, 400=COMPLETED, 900=CANCELLED
>   - 금액: SUM(SD_ORDER_DTL.SUM_AMT) 서브쿼리로 합산
> - SM→ERP 주문등록: ErpOrderWriteService.createOrderInErp() → ERP 번호 GOR{YYYYMMDD}{seq4}
> - SM→ERP 상태변경: ErpOrderWriteService.changeStatusInOracle() → WRK_FG 업데이트
> - SM→ERP 주문수정: ErpOrderWriteService.updateOrderDirectInOracle() (ORDDOC_NM, PARTNER_CD, PASGNR_NM, ORD_DT, RMK_TXT)
> - 배송 동기화: SD_DLV_MST (ISS_ST='C') → OrderMst.statusCd=SHIP_COMPLETE (1시간 스케줄)
> - 알려진 버그: 주문수정 시 success 반환되지만 실제 수정 안됨 → updateOrderInErp() 디버깅 필요

---

## Task 1: Flyway V3 - 주문 테이블 마이그레이션

> order_mst, order_dtl, order_info, order_dlv, file_attachments, sequence_numbers 테이블 + 인덱스.
> Phase 1-2에서 V1, V2가 이미 생성된 상태를 전제한다.
> **변경:** 단일 auto-increment PK → 복합PK(company_cd, plant_cd 기반), FK 제거→비정규화, order_dlv 신규 추가

**Files:**
- `sm-module-api/src/main/resources/db/migration/V3__create_order_tables.sql`

### Steps

- [ ] **1.1** Create `sm-module-api/src/main/resources/db/migration/V3__create_order_tables.sql`

```sql
-- =============================================================
-- V3: 주문관리 테이블 (order_mst, order_dtl, order_info,
--     order_dlv, file_attachments, sequence_numbers)
-- 변경: 복합PK 아키텍처, FK 제거→비정규화
-- =============================================================

-- -----------------------------------------------------------
-- sequence_numbers (번호 시퀀스 - 동시성 제어용)
-- -----------------------------------------------------------
CREATE TABLE sequence_numbers (
    id        BIGINT       AUTO_INCREMENT PRIMARY KEY,
    seq_type  VARCHAR(20)  NOT NULL  COMMENT 'ORDER | UNTACT | PO | PRE_SALES',
    seq_date  DATE         NOT NULL  COMMENT '날짜',
    dept_code VARCHAR(4)   NULL      COMMENT '부서코드 (ORDER, UNTACT용)',
    last_seq  INT          DEFAULT 0 COMMENT '마지막 일련번호',

    CONSTRAINT uq_seq UNIQUE (seq_type, seq_date, dept_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='번호 시퀀스';

-- -----------------------------------------------------------
-- order_mst (주문 마스터) - 구 orders
-- 복합PK: (company_cd, plant_cd, order_no)
-- FK 제거 → partner_cd/partner_nm/customer_nm 비정규화 직접 저장
-- -----------------------------------------------------------
CREATE TABLE order_mst (
    company_cd      INTEGER       NOT NULL  COMMENT '회사코드',
    plant_cd        INTEGER       NOT NULL  COMMENT '플랜트코드',
    order_no        VARCHAR(30)   NOT NULL  COMMENT '주문번호 (GSM{YYYY}{MMDD}{시퀀스5자리})',
    order_title     VARCHAR(200)  NOT NULL  COMMENT '주문명',
    partner_cd      VARCHAR(20)   NULL      COMMENT '거래처코드 (비정규화)',
    partner_nm      VARCHAR(100)  NULL      COMMENT '거래처명 (비정규화)',
    customer_nm     VARCHAR(100)  NULL      COMMENT '고객명 (비정규화)',
    sales_dept_cd   INTEGER       NULL      COMMENT '영업부서코드 (신규 3/26)',
    sales_emp_no    VARCHAR(20)   NULL      COMMENT '영업담당자 사번 (사번변경 3/26)',
    rcv_emp_no      VARCHAR(20)   NULL      COMMENT '접수자 사번',
    rcv_branch      VARCHAR(50)   NULL      COMMENT '접수지점(→영업부서 명명변경)',
    tax_type_cd     VARCHAR(20)   DEFAULT 'TAXABLE'
                    COMMENT 'TAXABLE|ZERO_RATE|EXEMPT|INDIVIDUAL|CARD',
    status_cd       VARCHAR(30)   DEFAULT 'PENDING'
                    COMMENT 'PENDING|CONFIRMED|PO_COMPLETE|SHIP_COMPLETE|SALES_WAIT|SALES_CONFIRMED',
    request_dt      DATETIME      NULL      COMMENT '완료요청일시',
    received_dt     DATE          NOT NULL  COMMENT '접수일자',
    due_dt          DATE          NULL      COMMENT '납기일',
    note            TEXT          NULL      COMMENT '특이사항',
    total_amt       BIGINT        DEFAULT 0 COMMENT '총금액',
    erp_order_no    VARCHAR(30)   NULL      COMMENT 'ERP 주문번호',
    erp_sync_status VARCHAR(20)   NULL      COMMENT 'ERP 연동상태',
    wrk_fg          VARCHAR(10)   DEFAULT '202' COMMENT '업무구분 (신규 3/26: 202국내/400품질/401샘플)',
    erp_no          VARCHAR(30)   NULL      COMMENT 'ERP번호 (신규 3/26)',
    deleted         BOOLEAN       DEFAULT FALSE,
    deleted_at      DATETIME      NULL,
    deleted_by      VARCHAR(20)   NULL,
    created_at      DATETIME      NOT NULL,
    updated_at      DATETIME      NOT NULL,
    created_by      VARCHAR(20)   NULL,
    updated_by      VARCHAR(20)   NULL,

    PRIMARY KEY (company_cd, plant_cd, order_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='주문 마스터';

-- 주문 검색 인덱스
CREATE INDEX idx_order_mst_date_status ON order_mst (received_dt, status_cd);
CREATE INDEX idx_order_mst_dept_status ON order_mst (sales_dept_cd, status_cd);
CREATE INDEX idx_order_mst_partner     ON order_mst (partner_cd);
CREATE INDEX idx_order_mst_erp         ON order_mst (erp_order_no);

-- -----------------------------------------------------------
-- order_dtl (주문 상세/작업) - 구 order_works
-- 복합PK: (company_cd, plant_cd, order_no, order_sq)
-- work_name → 세부품목명 (명명변경 4/6)
-- status_cd 추가 (per-work status)
-- -----------------------------------------------------------
CREATE TABLE order_dtl (
    company_cd      INTEGER       NOT NULL  COMMENT '회사코드',
    plant_cd        INTEGER       NOT NULL  COMMENT '플랜트코드',
    order_no        VARCHAR(30)   NOT NULL  COMMENT '주문번호',
    order_sq        INTEGER       NOT NULL  COMMENT '주문순번',
    work_type       VARCHAR(20)   NOT NULL
                    COMMENT 'OUTSOURCE|PACKAGE|PND|PURCHASE|POD',
    work_name       VARCHAR(200)  NOT NULL  COMMENT '세부품목명 (구 작업명, 명명변경 4/6)',
    quantity        INT           DEFAULT 1 COMMENT '제작부수(B)',
    note            TEXT          NULL      COMMENT '기타사항',
    work_amount     BIGINT        DEFAULT 0 COMMENT '작업금액(C=A*B)',
    delivery_fee    BIGINT        DEFAULT 0 COMMENT '배송비',
    design_fee      BIGINT        DEFAULT 0 COMMENT '디자인비',
    discount        BIGINT        DEFAULT 0 COMMENT '할인',
    payment_amount  BIGINT        DEFAULT 0 COMMENT '결제금액',
    status_cd       VARCHAR(30)   DEFAULT 'PENDING'
                    COMMENT '작업별 상태 (PENDING|CONFIRMED|PO_COMPLETE|SHIP_COMPLETE|SALES_WAIT|SALES_CONFIRMED)',
    sort_order      INT           DEFAULT 0,
    created_at      DATETIME      NOT NULL,
    updated_at      DATETIME      NOT NULL,

    PRIMARY KEY (company_cd, plant_cd, order_no, order_sq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='주문 상세 (세부품목/작업)';

CREATE INDEX idx_order_dtl_order ON order_dtl (company_cd, plant_cd, order_no);

-- -----------------------------------------------------------
-- order_info (주문 품목) - 구 order_items
-- 복합PK: (company_cd, plant_cd, order_no, order_sq, info_sq)
-- ord_partner_cd 추가 (신규 3/27)
-- BaseEntity 상속하지 않음
-- -----------------------------------------------------------
CREATE TABLE order_info (
    company_cd      INTEGER       NOT NULL  COMMENT '회사코드',
    plant_cd        INTEGER       NOT NULL  COMMENT '플랜트코드',
    order_no        VARCHAR(30)   NOT NULL  COMMENT '주문번호',
    order_sq        INTEGER       NOT NULL  COMMENT '주문순번',
    info_sq         INTEGER       NOT NULL  COMMENT '품목순번',
    category        VARCHAR(20)   NOT NULL
                    COMMENT 'PAPER|PRINT|FINISHING|BINDING|PURCHASE',
    composition     VARCHAR(50)   NULL  COMMENT '구성 (표지/본문 등, ERP 쿼리조회/셀렉트박스)',
    item_name       VARCHAR(100)  NULL  COMMENT '작업명 (작업명만 조회)',
    note            VARCHAR(200)  NULL  COMMENT '비고',
    quantity        INT           DEFAULT 1  COMMENT '수량(a)',
    unit_price      BIGINT        DEFAULT 0  COMMENT '단가(b)',
    subtotal        BIGINT        DEFAULT 0  COMMENT '소계(a*b)',
    ord_partner_cd  VARCHAR(20)   NULL       COMMENT '발주 거래처코드 (신규 3/27)',
    sort_order      INT           DEFAULT 0,

    PRIMARY KEY (company_cd, plant_cd, order_no, order_sq, info_sq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='주문 품목';

CREATE INDEX idx_order_info_dtl ON order_info (company_cd, plant_cd, order_no, order_sq);

-- -----------------------------------------------------------
-- order_dlv (주문 배송) - 신규 테이블
-- 복합PK: (company_cd, plant_cd, order_no, order_sq, dlv_sq)
-- -----------------------------------------------------------
CREATE TABLE order_dlv (
    company_cd      INTEGER       NOT NULL  COMMENT '회사코드',
    plant_cd        INTEGER       NOT NULL  COMMENT '플랜트코드',
    order_no        VARCHAR(30)   NOT NULL  COMMENT '주문번호',
    order_sq        INTEGER       NOT NULL  COMMENT '주문순번',
    dlv_sq          INTEGER       NOT NULL  COMMENT '배송순번',
    dlv_dt          DATE          NULL      COMMENT '배송일자',
    dlv_qty         INT           DEFAULT 0 COMMENT '배송수량',
    dlv_addr        VARCHAR(500)  NULL      COMMENT '배송주소',
    note            TEXT          NULL      COMMENT '비고',
    status_cd       VARCHAR(30)   DEFAULT 'PENDING' COMMENT '배송상태',
    created_at      DATETIME      NOT NULL,
    updated_at      DATETIME      NOT NULL,

    PRIMARY KEY (company_cd, plant_cd, order_no, order_sq, dlv_sq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='주문 배송';

CREATE INDEX idx_order_dlv_dtl ON order_dlv (company_cd, plant_cd, order_no, order_sq);

-- -----------------------------------------------------------
-- file_attachments (파일 첨부 - spec 12.5)
-- -----------------------------------------------------------
CREATE TABLE file_attachments (
    id              BIGINT        AUTO_INCREMENT PRIMARY KEY,
    entity_type     VARCHAR(30)   NOT NULL  COMMENT 'ORDER_DTL 등',
    entity_id       VARCHAR(100)  NOT NULL  COMMENT '연결 엔티티 복합키 (JSON 또는 구분자)',
    original_name   VARCHAR(255)  NOT NULL  COMMENT '원본 파일명',
    stored_name     VARCHAR(255)  NOT NULL  COMMENT '저장 파일명 (UUID)',
    file_path       VARCHAR(500)  NOT NULL  COMMENT '저장 경로',
    file_size       BIGINT        NULL      COMMENT '파일 크기 (bytes)',
    content_type    VARCHAR(100)  NULL      COMMENT 'MIME 타입',
    created_at      DATETIME      NOT NULL,
    created_by      VARCHAR(20)   NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='파일 첨부';

CREATE INDEX idx_file_entity ON file_attachments (entity_type, entity_id);
```

- [ ] **1.2** Verify migration runs. Confirm 6 tables: order_mst, order_dtl, order_info, order_dlv, file_attachments, sequence_numbers.

### Acceptance Criteria
- 모든 테이블 복합PK 적용 (order_mst/dtl/info/dlv). FK 없음 (비정규화).
- order_dlv 신규 테이블 생성 확인.
- partner_cd/partner_nm/customer_nm 비정규화 컬럼 확인.
- wrk_fg, erp_no, sales_dept_cd, ord_partner_cd 등 신규 컬럼 확인.
- 인덱스 정상 생성.

---

## Task 2: 주문번호 생성 (동시성 처리)

> SequenceNumber entity + SequenceNumberGenerator service.
> SELECT FOR UPDATE로 행 잠금 후 last_seq 증가.
> **변경:** Format: ~~O{YYMMDD}-{dept4}-{seq5}~~ → GSM{YYYY}{MMDD}{시퀀스5자리} (예: GSM2026040600001)

**Files:**
- `sm-module-api/src/main/java/com/tara/sm/common/entity/SequenceNumber.java`
- `sm-module-api/src/main/java/com/tara/sm/common/repository/SequenceNumberRepository.java`
- `sm-module-api/src/main/java/com/tara/sm/common/util/SequenceNumberGenerator.java`

### Steps

- [ ] **2.1** Create entity `sm-module-api/src/main/java/com/tara/sm/common/entity/SequenceNumber.java`

```java
package com.tara.sm.common.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;

@Entity
@Table(name = "sequence_numbers")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SequenceNumber {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "seq_type", nullable = false, length = 20)
    private String seqType;

    @Column(name = "seq_date", nullable = false)
    private LocalDate seqDate;

    @Column(name = "dept_code", length = 4)
    private String deptCode;

    @Column(name = "last_seq")
    private Integer lastSeq = 0;

    public SequenceNumber(String seqType, LocalDate seqDate, String deptCode) {
        this.seqType = seqType;
        this.seqDate = seqDate;
        this.deptCode = deptCode;
        this.lastSeq = 0;
    }

    public int incrementAndGet() {
        return ++this.lastSeq;
    }
}
```

- [ ] **2.2** Create repository with `@Lock(PESSIMISTIC_WRITE)` = SELECT FOR UPDATE

```java
package com.tara.sm.common.repository;

import com.tara.sm.common.entity.SequenceNumber;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDate;
import java.util.Optional;

public interface SequenceNumberRepository extends JpaRepository<SequenceNumber, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM SequenceNumber s WHERE s.seqType = :type AND s.seqDate = :date AND s.deptCode = :dept")
    Optional<SequenceNumber> findForUpdate(
        @Param("type") String type,
        @Param("date") LocalDate date,
        @Param("dept") String dept
    );

    // Overload for types without dept (PO, PRE_SALES)
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM SequenceNumber s WHERE s.seqType = :type AND s.seqDate = :date AND s.deptCode IS NULL")
    Optional<SequenceNumber> findForUpdateNoDept(
        @Param("type") String type,
        @Param("date") LocalDate date
    );
}
```

- [ ] **2.3** Create generator service (**주문번호 규칙 변경**)

```java
package com.tara.sm.common.util;

import com.tara.sm.common.entity.SequenceNumber;
import com.tara.sm.common.repository.SequenceNumberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

@Service
@RequiredArgsConstructor
public class SequenceNumberGenerator {

    private final SequenceNumberRepository seqRepository;
    private static final DateTimeFormatter YYYY = DateTimeFormatter.ofPattern("yyyy");
    private static final DateTimeFormatter MMDD = DateTimeFormatter.ofPattern("MMdd");

    /**
     * 주문번호: GSM{YYYY}{MMDD}{시퀀스5자리}
     * 예: GSM2026040600001
     *
     * 변경전: O{YYMMDD}-{dept4}-{seq5} (e.g. O260303-0040-00001)
     * 변경후: GSM{YYYY}{MMDD}{seq5} (e.g. GSM2026040600001)
     * - 부서코드 제외, 연도 4자리, 구분자 없음
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public String generateOrderNo() {
        LocalDate today = LocalDate.now();
        int seq = nextSeqNoDept("ORDER", today);
        return String.format("GSM%s%s%05d",
            today.format(YYYY), today.format(MMDD), seq);
    }

    /** 발주번호: PO{YYMMDD}-{seq3} */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public String generatePoNo() {
        LocalDate today = LocalDate.now();
        int seq = nextSeqNoDept("PO", today);
        return String.format("PO%s-%03d",
            today.format(DateTimeFormatter.ofPattern("yyMMdd")), seq);
    }

    // generateUntactNo, generatePreSalesNo ... similar pattern

    private int nextSeq(String type, LocalDate date, String dept) {
        SequenceNumber sn = seqRepository.findForUpdate(type, date, dept)
            .orElseGet(() -> seqRepository.save(new SequenceNumber(type, date, dept)));
        return sn.incrementAndGet();
    }

    private int nextSeqNoDept(String type, LocalDate date) {
        SequenceNumber sn = seqRepository.findForUpdateNoDept(type, date)
            .orElseGet(() -> seqRepository.save(new SequenceNumber(type, date, null)));
        return sn.incrementAndGet();
    }
}
```

### Acceptance Criteria
- SELECT FOR UPDATE + REQUIRES_NEW로 동시성 보장.
- **변경된 포맷:** ~~O260303-0040-00001~~ → GSM2026040600001
- 부서코드 파라미터 제거, 연도 4자리, 구분자 없음.

---

## Task 3: 주문 Backend (Entity, DTO, Service, Controller)

> OrderMst/OrderDtl/OrderInfo/OrderDlv entities. OrderService: list(QueryDSL+ERP통합), create(일괄), update, changeStatus.
> Amount calc per spec 12.10. Controller per spec 5.4.
> **변경:** 복합PK 엔티티, 비정규화, 6단계 상태, order_dlv 추가, 수정 제한 로직 변경

**Files:**
- `sm-module-api/src/main/java/com/tara/sm/order/entity/OrderMst.java`
- `sm-module-api/src/main/java/com/tara/sm/order/entity/OrderDtl.java`
- `sm-module-api/src/main/java/com/tara/sm/order/entity/OrderInfo.java`
- `sm-module-api/src/main/java/com/tara/sm/order/entity/OrderDlv.java`
- `sm-module-api/src/main/java/com/tara/sm/order/entity/OrderStatus.java`
- `sm-module-api/src/main/java/com/tara/sm/order/entity/WorkType.java`
- `sm-module-api/src/main/java/com/tara/sm/order/dto/OrderDto.java`
- `sm-module-api/src/main/java/com/tara/sm/order/repository/OrderMstRepository.java`
- `sm-module-api/src/main/java/com/tara/sm/order/repository/OrderQueryRepository.java`
- `sm-module-api/src/main/java/com/tara/sm/order/service/OrderService.java`
- `sm-module-api/src/main/java/com/tara/sm/order/controller/OrderController.java`

### Steps

- [ ] **3.1** Create status/type constants (**상태 6단계 확장**)

```java
package com.tara.sm.order.entity;

/**
 * 주문 상태 (6단계)
 * 변경전: PENDING → OUTSOURCE_PO → SHIPPED → SALES_REGISTERED
 * 변경후: PENDING → CONFIRMED → PO_COMPLETE → SHIP_COMPLETE → SALES_WAIT → SALES_CONFIRMED
 */
public final class OrderStatus {
    public static final String PENDING        = "PENDING";         // 주문접수
    public static final String CONFIRMED      = "CONFIRMED";       // 주문확정
    public static final String PO_COMPLETE    = "PO_COMPLETE";     // 발주완료
    public static final String SHIP_COMPLETE  = "SHIP_COMPLETE";   // 발송완료
    public static final String SALES_WAIT     = "SALES_WAIT";      // 매출대기
    public static final String SALES_CONFIRMED = "SALES_CONFIRMED"; // 매출확정
    private OrderStatus() {}
}
```

```java
package com.tara.sm.order.entity;

public final class WorkType {
    public static final String OUTSOURCE = "OUTSOURCE";
    public static final String PACKAGE = "PACKAGE";
    public static final String PND = "PND";
    public static final String PURCHASE = "PURCHASE";  // 구매 추가
    public static final String POD = "POD";
    private WorkType() {}
}
```

- [ ] **3.2** Create `OrderMst.java` entity (**복합PK, 비정규화**)

```java
package com.tara.sm.order.entity;

import com.tara.sm.common.audit.BaseEntity;
import jakarta.persistence.*;
import lombok.*;
import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "order_mst")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
@IdClass(OrderMst.OrderMstId.class)
public class OrderMst extends BaseEntity {

    /** 복합PK */
    @Data @NoArgsConstructor @AllArgsConstructor
    public static class OrderMstId implements Serializable {
        private Integer companyCd;
        private Integer plantCd;
        private String orderNo;
    }

    @Id @Column(name = "company_cd") private Integer companyCd;
    @Id @Column(name = "plant_cd") private Integer plantCd;
    @Id @Column(name = "order_no", length = 30) private String orderNo;

    @Column(name = "order_title", nullable = false, length = 200)
    private String orderTitle;

    // 비정규화 필드 (FK 제거)
    @Column(name = "partner_cd", length = 20)
    private String partnerCd;

    @Column(name = "partner_nm", length = 100)
    private String partnerNm;

    @Column(name = "customer_nm", length = 100)
    private String customerNm;

    @Column(name = "sales_dept_cd")
    private Integer salesDeptCd;  // 신규 3/26

    @Column(name = "sales_emp_no", length = 20)
    private String salesEmpNo;  // 사번변경 3/26

    @Column(name = "rcv_emp_no", length = 20)
    private String rcvEmpNo;

    @Column(name = "rcv_branch", length = 50)
    private String rcvBranch;

    @Column(name = "tax_type_cd", length = 20)
    @Builder.Default
    private String taxTypeCd = "TAXABLE";

    @Column(name = "status_cd", length = 30)
    @Builder.Default
    private String statusCd = OrderStatus.PENDING;

    @Column(name = "request_dt")
    private LocalDateTime requestDt;

    @Column(name = "received_dt", nullable = false)
    private LocalDate receivedDt;

    @Column(name = "due_dt")
    private LocalDate dueDt;

    @Column(name = "note", columnDefinition = "TEXT")
    private String note;

    @Column(name = "total_amt")
    @Builder.Default
    private Long totalAmt = 0L;

    @Column(name = "erp_order_no", length = 30)
    private String erpOrderNo;

    @Column(name = "erp_sync_status", length = 20)
    private String erpSyncStatus;

    @Column(name = "wrk_fg", length = 10)
    @Builder.Default
    private String wrkFg = "202";  // 신규 3/26: 202국내/400품질/401샘플

    @Column(name = "erp_no", length = 30)
    private String erpNo;  // 신규 3/26

    @OneToMany(mappedBy = "orderMst", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("orderSq ASC")
    @Builder.Default
    private List<OrderDtl> dtls = new ArrayList<>();

    // --- Domain methods ---

    /** 작업 추가 (양방향 관계 설정) */
    public void addDtl(OrderDtl dtl) {
        this.dtls.add(dtl);
        dtl.setOrderMst(this);
        dtl.setCompanyCd(this.companyCd);
        dtl.setPlantCd(this.plantCd);
        dtl.setOrderNo(this.orderNo);
    }

    /** 전체 금액 재계산 (spec 12.10) */
    public void recalculateTotal() {
        this.totalAmt = dtls.stream()
            .mapToLong(OrderDtl::getPaymentAmount)
            .sum();
    }

    /**
     * 상태 변경 (6단계 전이 규칙)
     * PENDING → CONFIRMED → PO_COMPLETE → SHIP_COMPLETE → SALES_WAIT → SALES_CONFIRMED
     * 확정 후 취소 가능 (CONFIRMED → PENDING)
     */
    public void changeStatus(String newStatus) {
        this.statusCd = newStatus;
    }
}
```

- [ ] **3.3** Create `OrderDtl.java` entity (**복합PK, 세부품목명, 작업별 상태**)

```java
package com.tara.sm.order.entity;

import jakarta.persistence.*;
import lombok.*;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "order_dtl")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
@IdClass(OrderDtl.OrderDtlId.class)
public class OrderDtl {

    /** 복합PK */
    @Data @NoArgsConstructor @AllArgsConstructor
    public static class OrderDtlId implements Serializable {
        private Integer companyCd;
        private Integer plantCd;
        private String orderNo;
        private Integer orderSq;
    }

    @Id @Column(name = "company_cd") private Integer companyCd;
    @Id @Column(name = "plant_cd") private Integer plantCd;
    @Id @Column(name = "order_no", length = 30) private String orderNo;
    @Id @Column(name = "order_sq") private Integer orderSq;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumns({
        @JoinColumn(name = "company_cd", referencedColumnName = "company_cd", insertable = false, updatable = false),
        @JoinColumn(name = "plant_cd", referencedColumnName = "plant_cd", insertable = false, updatable = false),
        @JoinColumn(name = "order_no", referencedColumnName = "order_no", insertable = false, updatable = false)
    })
    private OrderMst orderMst;

    @Column(name = "work_type", nullable = false, length = 20)
    private String workType;

    /** 세부품목명 (구 작업명 work_name, 명명변경 4/6) */
    @Column(name = "work_name", nullable = false, length = 200)
    private String workName;

    @Column(name = "quantity") @Builder.Default
    private Integer quantity = 1;

    @Column(name = "note", columnDefinition = "TEXT")
    private String note;

    @Column(name = "work_amount") @Builder.Default
    private Long workAmount = 0L;

    @Column(name = "delivery_fee") @Builder.Default
    private Long deliveryFee = 0L;

    @Column(name = "design_fee") @Builder.Default
    private Long designFee = 0L;

    @Column(name = "discount") @Builder.Default
    private Long discount = 0L;

    @Column(name = "payment_amount") @Builder.Default
    private Long paymentAmount = 0L;

    /** 작업별 상태 (신규) */
    @Column(name = "status_cd", length = 30)
    @Builder.Default
    private String statusCd = OrderStatus.PENDING;

    @Column(name = "sort_order") @Builder.Default
    private Integer sortOrder = 0;

    @OneToMany(mappedBy = "orderDtl", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("infoSq ASC")
    @Builder.Default
    private List<OrderInfo> infos = new ArrayList<>();

    @OneToMany(mappedBy = "orderDtl", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("dlvSq ASC")
    @Builder.Default
    private List<OrderDlv> dlvs = new ArrayList<>();

    // --- Domain methods ---

    public void addInfo(OrderInfo info) {
        this.infos.add(info);
        info.setOrderDtl(this);
        info.setCompanyCd(this.companyCd);
        info.setPlantCd(this.plantCd);
        info.setOrderNo(this.orderNo);
        info.setOrderSq(this.orderSq);
    }

    public void addDlv(OrderDlv dlv) {
        this.dlvs.add(dlv);
        dlv.setOrderDtl(this);
        dlv.setCompanyCd(this.companyCd);
        dlv.setPlantCd(this.plantCd);
        dlv.setOrderNo(this.orderNo);
        dlv.setOrderSq(this.orderSq);
    }

    /**
     * 금액 재계산 (spec 12.10):
     *   workAmount = SUM(infos.subtotal) * quantity
     *   paymentAmount = workAmount + deliveryFee + designFee - discount
     */
    public void recalculate() {
        long infosTotal = infos.stream().mapToLong(OrderInfo::getSubtotal).sum();
        this.workAmount = infosTotal * this.quantity;
        this.paymentAmount = this.workAmount + this.deliveryFee + this.designFee - this.discount;
    }
}
```

- [ ] **3.4** Create `OrderInfo.java` entity (**복합PK, BaseEntity 미상속, ord_partner_cd 추가**)

```java
package com.tara.sm.order.entity;

import jakarta.persistence.*;
import lombok.*;
import java.io.Serializable;

/**
 * 주문 품목 (구 OrderItem)
 * 주의: BaseEntity를 상속하지 않음
 */
@Entity
@Table(name = "order_info")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
@IdClass(OrderInfo.OrderInfoId.class)
public class OrderInfo {

    /** 복합PK */
    @Data @NoArgsConstructor @AllArgsConstructor
    public static class OrderInfoId implements Serializable {
        private Integer companyCd;
        private Integer plantCd;
        private String orderNo;
        private Integer orderSq;
        private Integer infoSq;
    }

    @Id @Column(name = "company_cd") private Integer companyCd;
    @Id @Column(name = "plant_cd") private Integer plantCd;
    @Id @Column(name = "order_no", length = 30) private String orderNo;
    @Id @Column(name = "order_sq") private Integer orderSq;
    @Id @Column(name = "info_sq") private Integer infoSq;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumns({
        @JoinColumn(name = "company_cd", referencedColumnName = "company_cd", insertable = false, updatable = false),
        @JoinColumn(name = "plant_cd", referencedColumnName = "plant_cd", insertable = false, updatable = false),
        @JoinColumn(name = "order_no", referencedColumnName = "order_no", insertable = false, updatable = false),
        @JoinColumn(name = "order_sq", referencedColumnName = "order_sq", insertable = false, updatable = false)
    })
    private OrderDtl orderDtl;

    @Column(name = "category", nullable = false, length = 20)
    private String category; // PAPER, PRINT, FINISHING, BINDING, PURCHASE(구매 추가)

    @Column(name = "composition", length = 50)
    private String composition;  // ERP 쿼리조회/셀렉트박스

    @Column(name = "item_name", length = 100)
    private String itemName;  // 작업명 (작업명만 조회)

    @Column(name = "note", length = 200)
    private String note;

    @Column(name = "quantity") @Builder.Default
    private Integer quantity = 1;

    @Column(name = "unit_price") @Builder.Default
    private Long unitPrice = 0L;

    @Column(name = "subtotal") @Builder.Default
    private Long subtotal = 0L;

    /** 발주 거래처코드 (신규 3/27) */
    @Column(name = "ord_partner_cd", length = 20)
    private String ordPartnerCd;

    @Column(name = "sort_order") @Builder.Default
    private Integer sortOrder = 0;

    /** subtotal = quantity * unitPrice */
    public void recalculate() {
        this.subtotal = (long) this.quantity * this.unitPrice;
    }
}
```

- [ ] **3.5** Create `OrderDlv.java` entity (**신규 테이블**)

```java
package com.tara.sm.order.entity;

import jakarta.persistence.*;
import lombok.*;
import java.io.Serializable;
import java.time.LocalDate;

/**
 * 주문 배송 (신규 테이블)
 * 복합PK: (company_cd, plant_cd, order_no, order_sq, dlv_sq)
 */
@Entity
@Table(name = "order_dlv")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
@IdClass(OrderDlv.OrderDlvId.class)
public class OrderDlv {

    @Data @NoArgsConstructor @AllArgsConstructor
    public static class OrderDlvId implements Serializable {
        private Integer companyCd;
        private Integer plantCd;
        private String orderNo;
        private Integer orderSq;
        private Integer dlvSq;
    }

    @Id @Column(name = "company_cd") private Integer companyCd;
    @Id @Column(name = "plant_cd") private Integer plantCd;
    @Id @Column(name = "order_no", length = 30) private String orderNo;
    @Id @Column(name = "order_sq") private Integer orderSq;
    @Id @Column(name = "dlv_sq") private Integer dlvSq;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumns({
        @JoinColumn(name = "company_cd", referencedColumnName = "company_cd", insertable = false, updatable = false),
        @JoinColumn(name = "plant_cd", referencedColumnName = "plant_cd", insertable = false, updatable = false),
        @JoinColumn(name = "order_no", referencedColumnName = "order_no", insertable = false, updatable = false),
        @JoinColumn(name = "order_sq", referencedColumnName = "order_sq", insertable = false, updatable = false)
    })
    private OrderDtl orderDtl;

    @Column(name = "dlv_dt")
    private LocalDate dlvDt;

    @Column(name = "dlv_qty")
    @Builder.Default
    private Integer dlvQty = 0;

    @Column(name = "dlv_addr", length = 500)
    private String dlvAddr;

    @Column(name = "note", columnDefinition = "TEXT")
    private String note;

    @Column(name = "status_cd", length = 30)
    @Builder.Default
    private String statusCd = "PENDING";
}
```

- [ ] **3.6** Create DTOs `sm-module-api/src/main/java/com/tara/sm/order/dto/OrderDto.java` (**복합PK 키 구조 반영**)

```java
package com.tara.sm.order.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class OrderDto {

    // === Request DTOs ===

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class CreateRequest {
        @NotNull  private Integer companyCd;
        @NotNull  private Integer plantCd;
        @NotBlank private String orderTitle;
        private String partnerCd;
        private String partnerNm;     // 비정규화
        private String customerNm;    // 비정규화
        private Integer salesDeptCd;  // 영업부서코드
        private String salesEmpNo;    // 영업담당자 사번
        private String rcvBranch;     // 영업부서 (명명변경)
        private String taxTypeCd;
        private LocalDateTime requestDt;
        @NotNull  private LocalDate receivedDt;
        private LocalDate dueDt;
        private String note;
        private String wrkFg;         // 업무구분: 202국내/400품질/401샘플
        @Valid @NotEmpty
        private List<DtlRequest> dtls;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class DtlRequest {
        @NotBlank private String workType;
        @NotBlank private String workName;  // 세부품목명
        private Integer quantity;
        private String note;
        private Long deliveryFee;
        private Long designFee;
        private Long discount;
        @Valid private List<InfoRequest> infos;
        @Valid private List<DlvRequest> dlvs;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class InfoRequest {
        @NotBlank private String category;  // PAPER|PRINT|FINISHING|BINDING|PURCHASE
        private String composition;  // ERP 쿼리조회/셀렉트박스
        private String itemName;     // 작업명 (작업명만 조회)
        private String note;
        private Integer quantity;
        private Long unitPrice;
        private String ordPartnerCd; // 발주 거래처코드 (신규 3/27)
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class DlvRequest {
        private LocalDate dlvDt;
        private Integer dlvQty;
        private String dlvAddr;
        private String note;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class UpdateRequest {
        private String orderTitle;
        private String partnerCd;
        private String partnerNm;
        private String customerNm;
        private Integer salesDeptCd;
        private String salesEmpNo;
        private String rcvBranch;
        private String taxTypeCd;
        private LocalDateTime requestDt;
        private LocalDate receivedDt;
        private LocalDate dueDt;
        private String note;
        private String wrkFg;
        @Valid private List<DtlRequest> dtls;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class StatusRequest {
        @NotBlank private String statusCd;
    }

    /** 매출등록 요청 (신규) */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class SalesRegisterRequest {
        @NotBlank private String salesTitle;     // 결제명
        private String partnerCd;                // 거래처
        private Long totalOrderAmt;              // 총주문금액
        private Long preSalesDeduction;          // 선매출차감
        private Long finalPaymentAmt;            // 최종결제금액
        @NotBlank private String paymentMethod;  // 카드/현금
        @NotEmpty private List<OrderDtlKey> orderDtlKeys; // 선택된 주문번호-시퀀스 목록
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class OrderDtlKey {
        private Integer companyCd;
        private Integer plantCd;
        private String orderNo;
        private Integer orderSq;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class SearchCondition {
        private LocalDate startDate;
        private LocalDate endDate;
        private String statusCd;
        private String workType;
        private String keyword;
        private Boolean includeErp;  // ERP 주문 포함 여부
        private int page;
        private int size;
    }

    // === Response DTOs ===
    // All use @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder

    // ListItem: companyCd, plantCd, orderNo, orderTitle, partnerNm, customerNm,
    //   rcvBranch, salesEmpNo, workType, totalAmt, statusCd, receivedDt,
    //   erpOrderNo (ERP주문 표시용), workName (세부품목명 = 주문번호의 제목)

    // Detail: all ListItem fields + partnerCd, salesDeptCd,
    //   taxTypeCd, requestDt, dueDt, note, wrkFg, erpNo,
    //   createdAt, List<DtlDetail> dtls

    // DtlDetail: orderSq, workType, workName(세부품목명), quantity, note,
    //   workAmount, deliveryFee, designFee, discount, paymentAmount,
    //   statusCd, sortOrder, List<InfoDetail> infos, List<DlvDetail> dlvs,
    //   List<FileInfo> files

    // InfoDetail: infoSq, category, composition, itemName, note,
    //   quantity, unitPrice, subtotal, ordPartnerCd, sortOrder

    // DlvDetail: dlvSq, dlvDt, dlvQty, dlvAddr, note, statusCd

    // FileInfo: id, originalName, fileSize, contentType
}
```

- [ ] **3.7** Create `OrderMstRepository.java` (**복합PK**)

```java
package com.tara.sm.order.repository;

import com.tara.sm.order.entity.OrderMst;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface OrderMstRepository extends JpaRepository<OrderMst, OrderMst.OrderMstId> {
    Optional<OrderMst> findByCompanyCdAndPlantCdAndOrderNoAndDeletedFalse(
        Integer companyCd, Integer plantCd, String orderNo);
}
```

- [ ] **3.8** Create `OrderQueryRepository.java` (**QueryDSL 동적 검색, ERP 주문 통합**)

```java
package com.tara.sm.order.repository;

import com.querydsl.core.BooleanBuilder;
import com.querydsl.core.types.Projections;
import com.querydsl.jpa.impl.JPAQueryFactory;
import com.tara.sm.order.dto.OrderDto;
import com.tara.sm.order.entity.QOrderMst;
import com.tara.sm.order.entity.QOrderDtl;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;
import java.util.List;

@Repository
@RequiredArgsConstructor
public class OrderQueryRepository {

    private final JPAQueryFactory queryFactory;

    /**
     * SM모듈 작성건 + ERP 주문 모두 표시
     * 주문번호의 제목 = 세부품목명 (주문명 x)
     */
    public Page<OrderDto.ListItem> search(OrderDto.SearchCondition cond, Pageable pageable) {
        QOrderMst o  = QOrderMst.orderMst;
        QOrderDtl d  = QOrderDtl.orderDtl;

        BooleanBuilder where = new BooleanBuilder().and(o.deleted.isFalse());

        if (cond.getStartDate() != null)
            where.and(o.receivedDt.goe(cond.getStartDate()));
        if (cond.getEndDate() != null)
            where.and(o.receivedDt.loe(cond.getEndDate()));
        if (StringUtils.hasText(cond.getStatusCd()))
            where.and(o.statusCd.eq(cond.getStatusCd()));
        if (StringUtils.hasText(cond.getKeyword())) {
            String kw = "%" + cond.getKeyword() + "%";
            where.and(o.orderNo.like(kw)
                .or(o.partnerNm.like(kw))
                .or(o.customerNm.like(kw))
                .or(o.rcvBranch.like(kw)));
        }
        // ERP 주문 포함/제외 필터
        // ... cond.getIncludeErp() 기반 조건

        List<OrderDto.ListItem> content = queryFactory
            .select(Projections.bean(OrderDto.ListItem.class,
                o.companyCd, o.plantCd, o.orderNo, o.orderTitle,
                o.partnerNm, o.customerNm,
                o.rcvBranch, o.salesEmpNo,
                o.totalAmt, o.statusCd, o.receivedDt,
                o.erpOrderNo
            ))
            .from(o)
            .where(where)
            .orderBy(o.receivedDt.desc(), o.orderNo.desc())
            .offset(pageable.getOffset())
            .limit(pageable.getPageSize())
            .fetch();

        long total = queryFactory.select(o.count()).from(o)
            .where(where).fetchOne();

        return new PageImpl<>(content, pageable, total);
    }
}
```

- [ ] **3.9** Create `OrderService.java` (**비정규화, 6단계 상태, 수정 제한 변경**)

```java
package com.tara.sm.order.service;

import com.tara.sm.common.exception.BusinessException;
import com.tara.sm.common.util.SequenceNumberGenerator;
import com.tara.sm.order.dto.OrderDto;
import com.tara.sm.order.entity.*;
import com.tara.sm.order.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.concurrent.atomic.AtomicInteger;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrderService {

    private final OrderMstRepository orderMstRepository;
    private final OrderQueryRepository orderQueryRepository;
    private final SequenceNumberGenerator seqGenerator;

    /** 주문 목록 (QueryDSL) - SM모듈 + ERP 주문 통합 */
    public Page<OrderDto.ListItem> list(OrderDto.SearchCondition cond) {
        return orderQueryRepository.search(cond, PageRequest.of(cond.getPage(), cond.getSize()));
    }

    /** 주문 상세 */
    public OrderDto.Detail getDetail(Integer companyCd, Integer plantCd, String orderNo) {
        OrderMst order = findOrThrow(companyCd, plantCd, orderNo);
        return toDetail(order);
    }

    /**
     * 주문 등록 (일괄: 주문 + 작업 + 품목 + 배송)
     * 주문번호: GSM{YYYY}{MMDD}{시퀀스5자리} 자동생성
     */
    @Transactional
    public OrderDto.Detail create(OrderDto.CreateRequest req) {
        String orderNo = seqGenerator.generateOrderNo();

        OrderMst order = OrderMst.builder()
            .companyCd(req.getCompanyCd())
            .plantCd(req.getPlantCd())
            .orderNo(orderNo)
            .orderTitle(req.getOrderTitle())
            .partnerCd(req.getPartnerCd())
            .partnerNm(req.getPartnerNm())       // 비정규화
            .customerNm(req.getCustomerNm())     // 비정규화
            .salesDeptCd(req.getSalesDeptCd())
            .salesEmpNo(req.getSalesEmpNo())
            .rcvBranch(req.getRcvBranch())
            .taxTypeCd(req.getTaxTypeCd() != null ? req.getTaxTypeCd() : "TAXABLE")
            .requestDt(req.getRequestDt())
            .receivedDt(req.getReceivedDt())
            .dueDt(req.getDueDt())
            .note(req.getNote())
            .wrkFg(req.getWrkFg() != null ? req.getWrkFg() : "202")
            .build();

        // Build dtls & infos & dlvs (spec 12.10 amount calc)
        AtomicInteger dtlIdx = new AtomicInteger(1);
        for (OrderDto.DtlRequest dr : req.getDtls()) {
            OrderDtl dtl = OrderDtl.builder()
                .orderSq(dtlIdx.getAndIncrement())
                .workType(dr.getWorkType())
                .workName(dr.getWorkName())  // 세부품목명
                .quantity(dr.getQuantity() != null ? dr.getQuantity() : 1)
                .note(dr.getNote())
                .deliveryFee(dr.getDeliveryFee() != null ? dr.getDeliveryFee() : 0L)
                .designFee(dr.getDesignFee() != null ? dr.getDesignFee() : 0L)
                .discount(dr.getDiscount() != null ? dr.getDiscount() : 0L)
                .build();

            if (dr.getInfos() != null) {
                AtomicInteger infoIdx = new AtomicInteger(1);
                for (OrderDto.InfoRequest ir : dr.getInfos()) {
                    OrderInfo info = OrderInfo.builder()
                        .infoSq(infoIdx.getAndIncrement())
                        .category(ir.getCategory())
                        .composition(ir.getComposition())
                        .itemName(ir.getItemName())
                        .note(ir.getNote())
                        .quantity(ir.getQuantity() != null ? ir.getQuantity() : 1)
                        .unitPrice(ir.getUnitPrice() != null ? ir.getUnitPrice() : 0L)
                        .ordPartnerCd(ir.getOrdPartnerCd())
                        .build();
                    info.recalculate();
                    dtl.addInfo(info);
                }
            }
            if (dr.getDlvs() != null) {
                AtomicInteger dlvIdx = new AtomicInteger(1);
                for (OrderDto.DlvRequest dlvReq : dr.getDlvs()) {
                    OrderDlv dlv = OrderDlv.builder()
                        .dlvSq(dlvIdx.getAndIncrement())
                        .dlvDt(dlvReq.getDlvDt())
                        .dlvQty(dlvReq.getDlvQty())
                        .dlvAddr(dlvReq.getDlvAddr())
                        .note(dlvReq.getNote())
                        .build();
                    dtl.addDlv(dlv);
                }
            }
            dtl.recalculate();
            order.addDtl(dtl);
        }
        order.recalculateTotal();

        orderMstRepository.save(order);
        return toDetail(order);
    }

    /**
     * 주문 수정 (상태별 수정 제한)
     * 매출완료(SALES_CONFIRMED) 이전까지: 회사명/고객명/별도사업/세무구분/영업담당자 수정 가능
     * 매출완료 이후: 수정 불가
     *
     * [알려진 버그] 주문수정 시 success 반환되지만 실제 수정 안됨
     */
    @Transactional
    public OrderDto.Detail update(Integer companyCd, Integer plantCd, String orderNo,
                                   OrderDto.UpdateRequest req) {
        OrderMst order = findOrThrow(companyCd, plantCd, orderNo);

        if (OrderStatus.SALES_CONFIRMED.equals(order.getStatusCd())) {
            throw new BusinessException("ORDER_READONLY", "매출확정 주문은 수정 불가");
        }

        // 매출완료 이전까지 수정 가능 필드: 회사명/고객명/별도사업/세무구분/영업담당자
        if (req.getPartnerCd() != null)  order.setPartnerCd(req.getPartnerCd());
        if (req.getPartnerNm() != null)  order.setPartnerNm(req.getPartnerNm());
        if (req.getCustomerNm() != null) order.setCustomerNm(req.getCustomerNm());
        if (req.getTaxTypeCd() != null)  order.setTaxTypeCd(req.getTaxTypeCd());
        if (req.getSalesEmpNo() != null) order.setSalesEmpNo(req.getSalesEmpNo());
        if (req.getSalesDeptCd() != null) order.setSalesDeptCd(req.getSalesDeptCd());

        // PENDING/CONFIRMED 상태에서만 전체 수정 가능
        boolean fullEdit = OrderStatus.PENDING.equals(order.getStatusCd())
                        || OrderStatus.CONFIRMED.equals(order.getStatusCd());

        if (fullEdit) {
            if (req.getOrderTitle() != null) order.setOrderTitle(req.getOrderTitle());
            if (req.getRequestDt() != null)  order.setRequestDt(req.getRequestDt());
            if (req.getReceivedDt() != null) order.setReceivedDt(req.getReceivedDt());
            if (req.getDueDt() != null)      order.setDueDt(req.getDueDt());
            if (req.getNote() != null)       order.setNote(req.getNote());
            if (req.getWrkFg() != null)      order.setWrkFg(req.getWrkFg());

            // Replace dtls if provided
            if (req.getDtls() != null) {
                order.getDtls().clear();
                // ... same pattern as create() for building dtls/infos/dlvs
                // Rebuild, recalculate, addDtl
                order.recalculateTotal();
            }
        }

        return toDetail(order);
    }

    /**
     * 상태 변경 (6단계 전이)
     * PENDING → CONFIRMED → PO_COMPLETE → SHIP_COMPLETE → SALES_WAIT → SALES_CONFIRMED
     * 확정 후 취소 가능 (CONFIRMED → PENDING)
     */
    @Transactional
    public void changeStatus(Integer companyCd, Integer plantCd, String orderNo, String newStatus) {
        OrderMst order = findOrThrow(companyCd, plantCd, orderNo);
        order.changeStatus(newStatus);
    }

    /**
     * 매출등록 (N건 선택 → 하나의 매출로 묶기)
     * 체크박스로 선택된 주문번호-시퀀스 N개를 묶어 하나의 매출로 등록
     */
    @Transactional
    public void registerSales(OrderDto.SalesRegisterRequest req) {
        // 선택된 주문건들의 상태를 SALES_CONFIRMED로 변경
        // 매출 데이터 생성 (SalesMst/SalesDtl)
        // ...
    }

    // --- Private helpers ---

    private OrderMst findOrThrow(Integer companyCd, Integer plantCd, String orderNo) {
        return orderMstRepository.findByCompanyCdAndPlantCdAndOrderNoAndDeletedFalse(
                companyCd, plantCd, orderNo)
            .orElseThrow(() -> new BusinessException("ORDER_NOT_FOUND", "주문을 찾을 수 없습니다."));
    }

    // --- Mapping helpers: toDetail, toDtlDetail, toInfoDetail, toDlvDetail ---
    // Map OrderMst → OrderDto.Detail (all fields + dtls list)
    // Map OrderDtl → DtlDetail (all fields + infos list + dlvs list + files)
    // Map OrderInfo → InfoDetail (all fields incl. ordPartnerCd)
    // Map OrderDlv → DlvDetail (all fields)
    // Pattern: builder with null-safe navigation (비정규화이므로 FK 조인 불필요)
}
```

- [ ] **3.10** Create `OrderController.java` (**복합PK 경로, 매출등록 엔드포인트 추가**)

```java
package com.tara.sm.order.controller;

import com.tara.sm.common.dto.ApiResponse;
import com.tara.sm.order.dto.OrderDto;
import com.tara.sm.order.service.OrderService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;

@Tag(name = "Order", description = "주문관리 API (spec 5.4)")
@RestController
@RequestMapping("/api/orders")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;

    @Operation(summary = "주문 목록 조회 (SM + ERP 통합)")
    @GetMapping
    public ApiResponse<Page<OrderDto.ListItem>> list(
            @RequestParam(required = false) LocalDate startDate,
            @RequestParam(required = false) LocalDate endDate,
            @RequestParam(required = false) String statusCd,
            @RequestParam(required = false) String workType,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Boolean includeErp,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        OrderDto.SearchCondition cond = OrderDto.SearchCondition.builder()
            .startDate(startDate).endDate(endDate)
            .statusCd(statusCd).workType(workType).keyword(keyword)
            .includeErp(includeErp)
            .page(page).size(size).build();
        return ApiResponse.success(orderService.list(cond));
    }

    @Operation(summary = "주문 상세 (복합PK)")
    @GetMapping("/{companyCd}/{plantCd}/{orderNo}")
    public ApiResponse<OrderDto.Detail> detail(
            @PathVariable Integer companyCd,
            @PathVariable Integer plantCd,
            @PathVariable String orderNo) {
        return ApiResponse.success(orderService.getDetail(companyCd, plantCd, orderNo));
    }

    @Operation(summary = "주문 등록 (일괄) - 주문번호 GSM 자동생성")
    @PostMapping
    public ApiResponse<OrderDto.Detail> create(@Valid @RequestBody OrderDto.CreateRequest request) {
        return ApiResponse.success(orderService.create(request));
    }

    @Operation(summary = "주문 수정 (복합PK)")
    @PutMapping("/{companyCd}/{plantCd}/{orderNo}")
    public ApiResponse<OrderDto.Detail> update(
            @PathVariable Integer companyCd,
            @PathVariable Integer plantCd,
            @PathVariable String orderNo,
            @Valid @RequestBody OrderDto.UpdateRequest request) {
        return ApiResponse.success(orderService.update(companyCd, plantCd, orderNo, request));
    }

    @Operation(summary = "주문 상태 변경 (6단계)")
    @PatchMapping("/{companyCd}/{plantCd}/{orderNo}/status")
    public ApiResponse<Void> changeStatus(
            @PathVariable Integer companyCd,
            @PathVariable Integer plantCd,
            @PathVariable String orderNo,
            @Valid @RequestBody OrderDto.StatusRequest request) {
        orderService.changeStatus(companyCd, plantCd, orderNo, request.getStatusCd());
        return ApiResponse.success(null);
    }

    @Operation(summary = "매출등록 (N건 선택 → 하나의 매출)")
    @PostMapping("/sales-register")
    public ApiResponse<Void> registerSales(@Valid @RequestBody OrderDto.SalesRegisterRequest request) {
        orderService.registerSales(request);
        return ApiResponse.success(null);
    }

    // GET /api/orders/export → Excel export (uses same SearchCondition)
    // ... similar pattern with SheetJS or Apache POI
}
```

### Acceptance Criteria
- OrderMst→OrderDtl→OrderInfo→OrderDlv cascade persist/remove (복합PK 기반)
- 금액 자동계산: info.subtotal = qty * unitPrice, dtl.paymentAmount per spec 12.10, order.totalAmt = SUM(dtls)
- QueryDSL 동적 검색 (기간/상태/키워드) + ERP 주문 통합 표시
- 6단계 상태 전이: PENDING → CONFIRMED → PO_COMPLETE → SHIP_COMPLETE → SALES_WAIT → SALES_CONFIRMED
- 수정 제한: 매출완료(SALES_CONFIRMED) 이전까지 회사명/고객명/세무구분/영업담당자 수정 가능
- 매출등록 API: N건 선택 → 하나의 매출로 묶기
- **[알려진 버그]** 주문수정 시 success 반환되지만 실제 수정 안됨
- API 엔드포인트 spec 5.4 준수 (복합PK 경로 파라미터)

---

## Task 4: 파일첨부 Backend

> FileAttachment entity, FileService(upload/download/delete), Controller.
> Local storage, UUID naming, 50MB max.

**Files:**
- `sm-module-api/src/main/java/com/tara/sm/common/entity/FileAttachment.java`
- `sm-module-api/src/main/java/com/tara/sm/common/repository/FileAttachmentRepository.java`
- `sm-module-api/src/main/java/com/tara/sm/common/service/FileService.java`
- `sm-module-api/src/main/java/com/tara/sm/common/controller/FileController.java`

### Steps

- [ ] **4.1** Create `FileAttachment.java`

```java
package com.tara.sm.common.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "file_attachments")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
public class FileAttachment {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "entity_type", nullable = false, length = 30)
    private String entityType; // ORDER_DTL 등

    @Column(name = "entity_id", nullable = false, length = 100)
    private String entityId; // 복합키 (JSON 또는 구분자)

    @Column(name = "original_name", nullable = false)
    private String originalName;

    @Column(name = "stored_name", nullable = false)
    private String storedName; // UUID

    @Column(name = "file_path", nullable = false, length = 500)
    private String filePath;

    @Column(name = "file_size")
    private Long fileSize;

    @Column(name = "content_type", length = 100)
    private String contentType;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "created_by", length = 20)
    private String createdBy;

    @PrePersist
    protected void onCreate() { this.createdAt = LocalDateTime.now(); }
}
```

- [ ] **4.2** Create repository

```java
package com.tara.sm.common.repository;

import com.tara.sm.common.entity.FileAttachment;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface FileAttachmentRepository extends JpaRepository<FileAttachment, Long> {
    List<FileAttachment> findByEntityTypeAndEntityId(String entityType, String entityId);
}
```

- [ ] **4.3** Create `FileService.java`

```java
package com.tara.sm.common.service;

import com.tara.sm.common.entity.FileAttachment;
import com.tara.sm.common.exception.BusinessException;
import com.tara.sm.common.repository.FileAttachmentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.nio.file.*;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class FileService {

    private final FileAttachmentRepository fileRepo;

    @Value("${file.upload-dir:./uploads}")
    private String uploadDir;

    private static final long MAX_SIZE = 50 * 1024 * 1024; // 50MB

    @Transactional
    public FileAttachment upload(MultipartFile file, String entityType, String entityId) throws IOException {
        if (file.getSize() > MAX_SIZE)
            throw new BusinessException("FILE_TOO_LARGE", "50MB 초과");

        String storedName = UUID.randomUUID() + "_" + file.getOriginalFilename();
        Path dir = Paths.get(uploadDir, entityType.toLowerCase());
        Files.createDirectories(dir);
        Path target = dir.resolve(storedName);
        Files.copy(file.getInputStream(), target, StandardCopyOption.REPLACE_EXISTING);

        FileAttachment attachment = FileAttachment.builder()
            .entityType(entityType).entityId(entityId)
            .originalName(file.getOriginalFilename())
            .storedName(storedName)
            .filePath(target.toString())
            .fileSize(file.getSize())
            .contentType(file.getContentType())
            .build();
        return fileRepo.save(attachment);
    }

    public Resource download(Long id) throws IOException {
        FileAttachment f = fileRepo.findById(id)
            .orElseThrow(() -> new BusinessException("FILE_NOT_FOUND", "파일 없음"));
        return new UrlResource(Paths.get(f.getFilePath()).toUri());
    }

    @Transactional
    public void delete(Long id) throws IOException {
        FileAttachment f = fileRepo.findById(id)
            .orElseThrow(() -> new BusinessException("FILE_NOT_FOUND", "파일 없음"));
        Files.deleteIfExists(Paths.get(f.getFilePath()));
        fileRepo.delete(f);
    }
}
```

- [ ] **4.4** Create `FileController.java`

```java
package com.tara.sm.common.controller;

import com.tara.sm.common.dto.ApiResponse;
import com.tara.sm.common.entity.FileAttachment;
import com.tara.sm.common.service.FileService;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@Tag(name = "File", description = "파일첨부 API (spec 12.5)")
@RestController
@RequestMapping("/api/files")
@RequiredArgsConstructor
public class FileController {

    private final FileService fileService;

    @PostMapping("/upload")
    public ApiResponse<FileAttachment> upload(
            @RequestParam MultipartFile file,
            @RequestParam String entityType,
            @RequestParam String entityId) throws Exception {
        return ApiResponse.success(fileService.upload(file, entityType, entityId));
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<Resource> download(@PathVariable Long id) throws Exception {
        Resource resource = fileService.download(id);
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_OCTET_STREAM)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + resource.getFilename() + "\"")
            .body(resource);
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) throws Exception {
        fileService.delete(id);
        return ApiResponse.success(null);
    }
}
```

### Acceptance Criteria
- Upload stores file with UUID name, returns FileAttachment metadata
- Download streams file as octet-stream
- Delete removes DB record + physical file
- 50MB limit enforced
- entityId는 String으로 변경 (복합PK 지원)

---

## Task 5: 주문목록 Frontend (OrderListPage)

> DateRange + keyword + status/workType filters + 체크박스 선택 + 매출등록 모달 + 엑셀다운로드 + DataTable.
> SM모듈 작성건 + ERP 주문 모두 표시. Row click → /orders/{companyCd}/{plantCd}/{orderNo}
> **변경:** 체크박스 N건 선택→매출등록, 6단계 상태, 주문번호 제목=세부품목명, 엑셀다운로드

**Files:**
- `sm-module-web/src/api/order.api.ts`
- `sm-module-web/src/types/order.ts`
- `sm-module-web/src/pages/order/OrderListPage.tsx`

### Steps

- [ ] **5.1** Create order types `sm-module-web/src/types/order.ts`

```typescript
// --- Enums (6단계 상태) ---
export const ORDER_STATUS = {
  PENDING: '주문접수',
  CONFIRMED: '주문확정',
  PO_COMPLETE: '발주완료',
  SHIP_COMPLETE: '발송완료',
  SALES_WAIT: '매출대기',
  SALES_CONFIRMED: '매출확정',
} as const;

export const WORK_TYPE = {
  OUTSOURCE: '외주', PACKAGE: '패키지', PND: 'P&D',
  PURCHASE: '구매', POD: 'POD',
} as const;

// --- DTO types (복합PK 기반) ---
export interface OrderListItem {
  companyCd: number; plantCd: number;
  orderNo: string; orderTitle: string;
  partnerNm: string; customerNm: string;
  rcvBranch: string; salesEmpNo: string;
  workType: string; totalAmt: number;
  statusCd: string; receivedDt: string;
  erpOrderNo: string | null;  // ERP 주문 표시용
  workName: string;  // 세부품목명 (주문번호의 제목)
}

export interface OrderDetail {
  companyCd: number; plantCd: number;
  orderNo: string; orderTitle: string;
  partnerCd: string; partnerNm: string;
  customerNm: string;
  salesDeptCd: number; salesEmpNo: string;
  rcvEmpNo: string; rcvBranch: string;
  taxTypeCd: string; statusCd: string;
  requestDt: string; receivedDt: string;
  dueDt: string; note: string;
  totalAmt: number; wrkFg: string;
  erpOrderNo: string | null; erpNo: string | null;
  createdAt: string;
  dtls: DtlDetail[];
}

export interface DtlDetail {
  orderSq: number; workType: string;
  workName: string;  // 세부품목명
  quantity: number; note: string;
  workAmount: number; deliveryFee: number;
  designFee: number; discount: number;
  paymentAmount: number; statusCd: string;
  sortOrder: number;
  infos: InfoDetail[];
  dlvs: DlvDetail[];
  files: FileInfo[];
}

export interface InfoDetail {
  infoSq: number; category: string; composition: string;
  itemName: string; note: string;
  quantity: number; unitPrice: number;
  subtotal: number; ordPartnerCd: string | null;
  sortOrder: number;
}

export interface DlvDetail {
  dlvSq: number; dlvDt: string;
  dlvQty: number; dlvAddr: string;
  note: string; statusCd: string;
}

export interface FileInfo {
  id: number; originalName: string;
  fileSize: number; contentType: string;
}

// CreateRequest, DtlRequest, InfoRequest, DlvRequest ...
// mirror backend DTOs (복합PK 기반)
export interface OrderCreateRequest {
  companyCd: number; plantCd: number;
  orderTitle: string;
  partnerCd?: string; partnerNm?: string;
  customerNm?: string;
  salesDeptCd?: number; salesEmpNo?: string;
  rcvBranch?: string; taxTypeCd?: string;
  requestDt?: string; receivedDt: string;
  dueDt?: string; note?: string;
  wrkFg?: string;
  dtls: DtlRequest[];
}

export interface DtlRequest {
  workType: string; workName: string; quantity?: number;
  note?: string; deliveryFee?: number; designFee?: number;
  discount?: number;
  infos: InfoRequest[];
  dlvs?: DlvRequest[];
}

export interface InfoRequest {
  category: string; composition?: string;
  itemName?: string; note?: string;
  quantity?: number; unitPrice?: number;
  ordPartnerCd?: string;
}

export interface DlvRequest {
  dlvDt?: string; dlvQty?: number;
  dlvAddr?: string; note?: string;
}

// 매출등록 요청
export interface SalesRegisterRequest {
  salesTitle: string;
  partnerCd?: string;
  totalOrderAmt?: number;
  preSalesDeduction?: number;
  finalPaymentAmt?: number;
  paymentMethod: string;  // 카드/현금
  orderDtlKeys: OrderDtlKey[];
}

export interface OrderDtlKey {
  companyCd: number; plantCd: number;
  orderNo: string; orderSq: number;
}

export interface OrderSearchParams {
  startDate?: string; endDate?: string;
  statusCd?: string; workType?: string;
  keyword?: string; includeErp?: boolean;
  page: number; size: number;
}
```

- [ ] **5.2** Create API layer `sm-module-web/src/api/order.api.ts`

```typescript
import client from './client';
import type {
  OrderListItem, OrderDetail, OrderCreateRequest,
  OrderSearchParams, SalesRegisterRequest
} from '@/types/order';

const BASE = '/api/orders';

export const orderApi = {
  list: (params: OrderSearchParams) =>
    client.get(BASE, { params }),

  detail: (companyCd: number, plantCd: number, orderNo: string) =>
    client.get<{ data: OrderDetail }>(`${BASE}/${companyCd}/${plantCd}/${orderNo}`),

  create: (data: OrderCreateRequest) =>
    client.post(BASE, data),

  update: (companyCd: number, plantCd: number, orderNo: string, data: Partial<OrderCreateRequest>) =>
    client.put(`${BASE}/${companyCd}/${plantCd}/${orderNo}`, data),

  changeStatus: (companyCd: number, plantCd: number, orderNo: string, statusCd: string) =>
    client.patch(`${BASE}/${companyCd}/${plantCd}/${orderNo}/status`, { statusCd }),

  registerSales: (data: SalesRegisterRequest) =>
    client.post(`${BASE}/sales-register`, data),

  exportExcel: (params: OrderSearchParams) =>
    client.get(`${BASE}/export`, { params, responseType: 'blob' }),
};
```

- [ ] **5.3** Create `OrderListPage.tsx` (**체크박스 N건 선택, 매출등록 모달, 세부품목명 표시**)

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button, Select, Input, DatePicker, Space, Table, Tag, Modal, Form, Radio, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { orderApi } from '@/api/order.api';
import { ORDER_STATUS, WORK_TYPE } from '@/types/order';
import type { OrderSearchParams, OrderListItem, SalesRegisterRequest, OrderDtlKey } from '@/types/order';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

export default function OrderListPage() {
  const navigate = useNavigate();
  const [params, setParams] = useState<OrderSearchParams>({
    page: 0, size: 20,
  });
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [selectedRows, setSelectedRows] = useState<OrderListItem[]>([]);
  const [salesModalOpen, setSalesModalOpen] = useState(false);
  const [salesForm] = Form.useForm();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['orders', params],
    queryFn: () => orderApi.list(params),
  });

  const salesMutation = useMutation({
    mutationFn: (data: SalesRegisterRequest) => orderApi.registerSales(data),
    onSuccess: () => { message.success('매출이 등록되었습니다.'); setSalesModalOpen(false); refetch(); },
  });

  const columns = [
    { title: '#', render: (_: any, __: any, i: number) => params.page * params.size + i + 1, width: 50 },
    {
      /** 주문번호의 제목 = 세부품목명 (주문명 x) */
      title: '주문번호/세부품목명', dataIndex: 'orderNo',
      render: (_: string, r: OrderListItem) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.orderNo}</div>
          <div style={{ color: '#666', fontSize: 12 }}>{r.workName}</div>
        </div>
      ),
    },
    { title: '거래처명', dataIndex: 'partnerNm' },
    { title: '고객명', dataIndex: 'customerNm' },
    { title: '영업부서', dataIndex: 'rcvBranch' },
    { title: '영업담당자', dataIndex: 'salesEmpNo' },
    { title: '작업처', dataIndex: 'workType',
      render: (v: string) => WORK_TYPE[v as keyof typeof WORK_TYPE] || v },
    { title: '금액', dataIndex: 'totalAmt',
      render: (v: number) => v?.toLocaleString() + '원' },
    { title: '상태', dataIndex: 'statusCd',
      render: (v: string) => <Tag>{ORDER_STATUS[v as keyof typeof ORDER_STATUS] || v}</Tag> },
    { title: '접수일', dataIndex: 'receivedDt' },
    { title: 'ERP', dataIndex: 'erpOrderNo',
      render: (v: string | null) => v ? <Tag color="blue">ERP</Tag> : null },
  ];

  const handleExcel = async () => {
    const blob = await orderApi.exportExcel(params);
    // ... download blob as file
  };

  const handleSalesRegister = () => {
    if (selectedRows.length === 0) {
      message.warning('매출등록할 주문을 선택해주세요.');
      return;
    }
    setSalesModalOpen(true);
  };

  const onSalesSubmit = async () => {
    const values = await salesForm.validateFields();
    const orderDtlKeys: OrderDtlKey[] = selectedRows.map(r => ({
      companyCd: r.companyCd, plantCd: r.plantCd,
      orderNo: r.orderNo, orderSq: 1, // 실제로는 시퀀스별 선택
    }));
    salesMutation.mutate({
      ...values,
      orderDtlKeys,
    });
  };

  return (
    <div>
      {/* Search bar */}
      <Space wrap style={{ marginBottom: 16 }}>
        <RangePicker
          onChange={(dates) => setParams(p => ({
            ...p,
            startDate: dates?.[0]?.format('YYYY-MM-DD'),
            endDate: dates?.[1]?.format('YYYY-MM-DD'),
          }))}
        />
        <Select
          placeholder="주문상태" allowClear style={{ width: 140 }}
          options={Object.entries(ORDER_STATUS).map(([k, v]) => ({ value: k, label: v }))}
          onChange={(v) => setParams(p => ({ ...p, statusCd: v }))}
        />
        <Select
          placeholder="작업처" allowClear style={{ width: 120 }}
          options={Object.entries(WORK_TYPE).map(([k, v]) => ({ value: k, label: v }))}
          onChange={(v) => setParams(p => ({ ...p, workType: v }))}
        />
        <Input.Search
          placeholder="주문번호, 고객명, 거래처명" allowClear style={{ width: 280 }}
          onSearch={(v) => setParams(p => ({ ...p, keyword: v, page: 0 }))}
        />
        <Button type="primary" onClick={handleSalesRegister}>매출등록</Button>
        <Button icon={<DownloadOutlined />} onClick={handleExcel}>엑셀</Button>
      </Space>

      {/* Table (체크박스 N건 선택) */}
      <Table
        columns={columns}
        dataSource={data?.data?.data?.content}
        rowKey={(r) => `${r.companyCd}-${r.plantCd}-${r.orderNo}`}
        loading={isLoading}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys, rows) => {
            setSelectedRowKeys(keys as string[]);
            setSelectedRows(rows);
          },
        }}
        onRow={(record) => ({
          onClick: () => navigate(`/orders/${record.companyCd}/${record.plantCd}/${record.orderNo}`),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          current: params.page + 1,
          pageSize: params.size,
          total: data?.data?.data?.totalElements,
          onChange: (p, s) => setParams(prev => ({ ...prev, page: p - 1, size: s })),
        }}
      />

      {/* 매출등록 모달 */}
      <Modal
        title="매출등록"
        open={salesModalOpen}
        onOk={onSalesSubmit}
        onCancel={() => setSalesModalOpen(false)}
        confirmLoading={salesMutation.isPending}
      >
        <Form form={salesForm} layout="vertical">
          <Form.Item label="결제명" name="salesTitle" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="거래처" name="partnerCd">
            <Input />
          </Form.Item>
          <Form.Item label="총주문금액" name="totalOrderAmt">
            <Input type="number" />
          </Form.Item>
          <Form.Item label="선매출차감" name="preSalesDeduction">
            <Input type="number" />
          </Form.Item>
          <Form.Item label="최종결제금액" name="finalPaymentAmt">
            <Input type="number" />
          </Form.Item>
          <Form.Item label="결제수단" name="paymentMethod" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio value="CARD">카드</Radio>
              <Radio value="CASH">현금</Radio>
            </Radio.Group>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
```

### Acceptance Criteria
- Filters: DateRange, status (6 options), workType (5 options incl. 구매), keyword
- SM모듈 작성건 + ERP 주문 모두 표시
- 주문번호의 제목 = 세부품목명 (주문명 x)
- 체크박스로 N건 선택 → 매출등록 모달 (결제명, 거래처, 총주문금액, 선매출차감, 최종결제금액, 결제수단)
- Row click navigates to /orders/{companyCd}/{plantCd}/{orderNo}
- Pagination syncs with API
- 엑셀다운로드 기능

---

## Task 6: 주문등록 Frontend (OrderCreatePage)

> 주문정보탭 + 작업정보탭(dynamic tabs, 품목 grid, amount summary).
> useFieldArray for nested dtls/infos. React Hook Form + Zod validation.
> **변경:** 영업담당자 디폴트, 접수지점→영업부서 명명변경, 세무구분 ERP 조회, 주문번호 GSM 자동생성,
>   주문확정/취소, 세부품목명 명명변경, 작업사양복사/작업복사, 구분에 구매 추가, 구성 ERP 쿼리조회,
>   외주발주서 팝업, 외주발주처리 불가

**Files:**
- `sm-module-web/src/pages/order/OrderCreatePage.tsx`
- `sm-module-web/src/pages/order/components/OrderInfoStep.tsx`
- `sm-module-web/src/pages/order/components/WorkInfoStep.tsx`
- `sm-module-web/src/pages/order/components/ItemGrid.tsx`
- `sm-module-web/src/pages/order/components/AmountSummary.tsx`
- `sm-module-web/src/pages/order/schema.ts`

### Steps

- [ ] **6.1** Create Zod schema `sm-module-web/src/pages/order/schema.ts` (**복합PK, 신규 필드**)

```typescript
import { z } from 'zod';

export const dlvSchema = z.object({
  dlvDt: z.string().optional(),
  dlvQty: z.coerce.number().min(0).default(0),
  dlvAddr: z.string().optional(),
  note: z.string().optional(),
});

export const infoSchema = z.object({
  category: z.string().min(1),
  composition: z.string().optional(),  // ERP 쿼리조회/셀렉트박스
  itemName: z.string().optional(),     // 작업명 (작업명만 조회)
  note: z.string().optional(),
  quantity: z.coerce.number().min(0).default(1),
  unitPrice: z.coerce.number().min(0).default(0),
  ordPartnerCd: z.string().optional(), // 발주 거래처코드
});

export const dtlSchema = z.object({
  workType: z.string().min(1),
  workName: z.string().min(1),   // 세부품목명 (구 작업명)
  quantity: z.coerce.number().min(1).default(1),
  note: z.string().optional(),
  deliveryFee: z.coerce.number().default(0),
  designFee: z.coerce.number().default(0),
  discount: z.coerce.number().default(0),
  infos: z.array(infoSchema).min(1),
  dlvs: z.array(dlvSchema).optional(),
});

export const orderSchema = z.object({
  companyCd: z.number(),
  plantCd: z.number(),
  orderTitle: z.string().min(1, '주문명 필수'),
  partnerCd: z.string().optional(),
  partnerNm: z.string().optional(),
  customerNm: z.string().optional(),
  salesDeptCd: z.number().optional(),
  salesEmpNo: z.string().optional(),
  rcvBranch: z.string().optional(),   // 영업부서 (명명변경)
  taxTypeCd: z.string().default('TAXABLE'),
  requestDt: z.string().optional(),
  receivedDt: z.string().min(1, '접수일자 필수'),
  dueDt: z.string().optional(),
  note: z.string().optional(),
  wrkFg: z.string().default('202'),   // 업무구분
  dtls: z.array(dtlSchema).min(1, '작업 최소 1개'),
});

export type OrderFormValues = z.infer<typeof orderSchema>;
```

- [ ] **6.2** Create `OrderCreatePage.tsx` (**주문확정/취소, 외주발주서 팝업, 복합PK**)

```tsx
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Tabs, Button, message, Space, Modal } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { orderApi } from '@/api/order.api';
import { orderSchema, type OrderFormValues } from './schema';
import OrderInfoStep from './components/OrderInfoStep';
import WorkInfoStep from './components/WorkInfoStep';

export default function OrderCreatePage() {
  const { companyCd, plantCd, orderNo } = useParams<{
    companyCd: string; plantCd: string; orderNo: string;
  }>();
  const navigate = useNavigate();
  const isEdit = !!orderNo;
  const [activeTab, setActiveTab] = useState('order-info');
  const [viewMode, setViewMode] = useState(isEdit);
  const [poPopupVisible, setPoPopupVisible] = useState(false); // 외주발주서 팝업

  const methods = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      taxTypeCd: 'TAXABLE',
      receivedDt: new Date().toISOString().slice(0, 10),
      wrkFg: '202',
      dtls: [{ workType: 'OUTSOURCE', workName: '', quantity: 1,
                deliveryFee: 0, designFee: 0, discount: 0, infos: [] }],
    },
  });

  // Load existing order for edit/view mode
  const { data: orderData } = useQuery({
    queryKey: ['order', companyCd, plantCd, orderNo],
    queryFn: () => orderApi.detail(Number(companyCd), Number(plantCd), orderNo!),
    enabled: isEdit,
    onSuccess: (res) => {
      const d = res.data.data;
      methods.reset({
        companyCd: d.companyCd, plantCd: d.plantCd,
        orderTitle: d.orderTitle,
        partnerCd: d.partnerCd, partnerNm: d.partnerNm,
        customerNm: d.customerNm,
        salesDeptCd: d.salesDeptCd, salesEmpNo: d.salesEmpNo,
        rcvBranch: d.rcvBranch, taxTypeCd: d.taxTypeCd,
        requestDt: d.requestDt, receivedDt: d.receivedDt,
        dueDt: d.dueDt, note: d.note, wrkFg: d.wrkFg,
        dtls: d.dtls.map(dtl => ({
          workType: dtl.workType, workName: dtl.workName,
          quantity: dtl.quantity, note: dtl.note,
          deliveryFee: dtl.deliveryFee, designFee: dtl.designFee,
          discount: dtl.discount,
          infos: dtl.infos.map(info => ({
            category: info.category, composition: info.composition,
            itemName: info.itemName, note: info.note,
            quantity: info.quantity, unitPrice: info.unitPrice,
            ordPartnerCd: info.ordPartnerCd,
          })),
          dlvs: dtl.dlvs?.map(dlv => ({
            dlvDt: dlv.dlvDt, dlvQty: dlv.dlvQty,
            dlvAddr: dlv.dlvAddr, note: dlv.note,
          })),
        })),
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: OrderFormValues) => orderApi.create(data as any),
    onSuccess: () => { message.success('주문이 등록되었습니다.'); navigate('/orders'); },
  });

  const updateMutation = useMutation({
    mutationFn: (data: OrderFormValues) =>
      orderApi.update(Number(companyCd), Number(plantCd), orderNo!, data as any),
    onSuccess: () => { message.success('주문이 수정되었습니다.'); navigate('/orders'); },
  });

  const onSubmit = methods.handleSubmit((data) => {
    isEdit ? updateMutation.mutate(data) : createMutation.mutate(data);
  });

  // 주문확정/취소 기능
  const confirmMutation = useMutation({
    mutationFn: () => orderApi.changeStatus(Number(companyCd), Number(plantCd), orderNo!, 'CONFIRMED'),
    onSuccess: () => { message.success('주문이 확정되었습니다.'); },
  });

  const cancelConfirmMutation = useMutation({
    mutationFn: () => orderApi.changeStatus(Number(companyCd), Number(plantCd), orderNo!, 'PENDING'),
    onSuccess: () => { message.success('주문확정이 취소되었습니다.'); },
  });

  // 상태별 수정 제한
  const orderStatus = orderData?.data?.data?.statusCd;
  // 매출완료(SALES_CONFIRMED) 이후 수정 불가
  const isReadonly = orderStatus === 'SALES_CONFIRMED';
  // 매출완료 이전까지: 회사명/고객명/별도사업/세무구분/영업담당자 수정 가능
  const isPartialEdit = orderStatus && !['PENDING', 'CONFIRMED'].includes(orderStatus)
                        && orderStatus !== 'SALES_CONFIRMED';

  return (
    <FormProvider {...methods}>
      <div>
        {/* Header with mode toggle + 확정/취소 */}
        <Space style={{ marginBottom: 16 }}>
          {isEdit && viewMode && !isReadonly && (
            <Button type="primary" onClick={() => setViewMode(false)}>수정</Button>
          )}
          {isEdit && orderStatus === 'PENDING' && (
            <Button type="primary" onClick={() => confirmMutation.mutate()}
              loading={confirmMutation.isPending}>주문확정</Button>
          )}
          {isEdit && orderStatus === 'CONFIRMED' && (
            <Button danger onClick={() => cancelConfirmMutation.mutate()}
              loading={cancelConfirmMutation.isPending}>확정취소</Button>
          )}
          {/* 외주발주처리는 이 메뉴에서 안됨 - 별도 메뉴로 안내 */}
          {isEdit && (
            <Button onClick={() => setPoPopupVisible(true)}>외주발주서 보기</Button>
          )}
        </Space>

        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          { key: 'order-info', label: '주문정보',
            children: <OrderInfoStep
              disabled={viewMode || isReadonly}
              partialEdit={isPartialEdit}
              status={orderStatus} /> },
          { key: 'work-info', label: '작업정보',
            children: <WorkInfoStep disabled={viewMode || isReadonly} /> },
        ]} />

        {/* Footer buttons */}
        {!viewMode && !isReadonly && (
          <Space style={{ marginTop: 16 }}>
            {activeTab === 'work-info' && (
              <Button onClick={() => setActiveTab('order-info')}>이전</Button>
            )}
            {activeTab === 'order-info' && (
              <Button type="primary" onClick={() => setActiveTab('work-info')}>다음</Button>
            )}
            {activeTab === 'work-info' && (
              <Button type="primary" onClick={onSubmit}
                loading={createMutation.isPending || updateMutation.isPending}>
                {isEdit ? '수정' : '등록'}
              </Button>
            )}
          </Space>
        )}

        {/* 외주발주서 팝업 */}
        <Modal
          title="외주발주서"
          open={poPopupVisible}
          onCancel={() => setPoPopupVisible(false)}
          width={800}
          footer={null}
        >
          {/* 외주발주서 내용 표시 */}
        </Modal>
      </div>
    </FormProvider>
  );
}
```

- [ ] **6.3** Create `OrderInfoStep.tsx` (**영업담당자 디폴트, 영업부서 자동반영, 세무구분 ERP 조회, GSM 주문번호**)

```tsx
import { useFormContext } from 'react-hook-form';
import { Form, Input, DatePicker, Select } from 'antd';
import { useQuery } from '@tanstack/react-query';
// Assume SearchPopup is a shared component from Phase 1
// Assume erpLookupApi for ERP 기준정보 조회
import type { OrderFormValues } from '../schema';

/**
 * 세무구분: ERP 기준정보 쿼리 조회
 * (폴백: 하드코딩 목록)
 */
const TAX_TYPES_FALLBACK = [
  { value: 'TAXABLE', label: '과세매출' },
  { value: 'ZERO_RATE', label: '영세매출' },
  { value: 'EXEMPT', label: '면세매출' },
  { value: 'INDIVIDUAL', label: '건별매출' },
  { value: 'CARD', label: '카드매출' },
];

const WRK_FG_OPTIONS = [
  { value: '202', label: '국내 (202)' },
  { value: '400', label: '품질 (400)' },
  { value: '401', label: '샘플 (401)' },
];

interface Props {
  disabled: boolean;
  partialEdit?: boolean;  // 매출완료 이전 부분수정 모드
  status?: string;
}

export default function OrderInfoStep({ disabled, partialEdit, status }: Props) {
  const { register, setValue, watch, formState: { errors } } = useFormContext<OrderFormValues>();

  // 세무구분 ERP 쿼리 조회
  // const { data: taxTypes } = useQuery({ queryKey: ['erp-tax-types'], queryFn: ... });
  // const taxTypeOptions = taxTypes ?? TAX_TYPES_FALLBACK;

  /**
   * 영업담당자 선택 시 부서 자동반영
   * 접수지점 → "영업부서" 명명변경
   */
  const handleSalesEmpSelect = (empNo: string, deptCd: number, deptNm: string) => {
    setValue('salesEmpNo', empNo);
    setValue('salesDeptCd', deptCd);
    setValue('rcvBranch', deptNm);  // 영업부서 자동반영
  };

  // 매출완료 이전까지 수정 가능한 필드: 회사명/고객명/별도사업/세무구분/영업담당자
  const alwaysEditable = !disabled || partialEdit;

  return (
    <Form layout="vertical" disabled={disabled && !partialEdit}>
      {/* 주문번호: GSM+연도+월일+시퀀스 자동생성 (서버에서 생성, 읽기전용 표시) */}
      {status && (
        <Form.Item label="주문번호">
          <Input disabled value={watch('orderNo' as any)} />
        </Form.Item>
      )}

      <Form.Item label="주문명" required validateStatus={errors.orderTitle ? 'error' : ''}>
        <Input {...register('orderTitle')}
          disabled={disabled && !partialEdit ? true : partialEdit ? true : false} />
      </Form.Item>

      {/* 영업담당자: 로그인 사용자 디폴트 */}
      <Form.Item label="영업담당자">
        {/* SearchPopup → handleSalesEmpSelect */}
        {/* 영업담당자 선택 시 영업부서 자동반영 */}
        <Input disabled={!alwaysEditable} />
      </Form.Item>

      {/* 영업부서 (구 접수지점) - 영업담당자 선택 시 자동반영 */}
      <Form.Item label="영업부서">
        <Input {...register('rcvBranch')} disabled />
      </Form.Item>

      {/* 거래처 (비정규화) */}
      <Form.Item label="거래처(회사명)">
        {/* SearchPopup → setValue('partnerCd', ...), setValue('partnerNm', ...) */}
        <Input disabled={!alwaysEditable} />
      </Form.Item>

      {/* 고객명 (비정규화) */}
      <Form.Item label="고객명">
        <Input {...register('customerNm')} disabled={!alwaysEditable} />
      </Form.Item>

      {/* 세무구분: ERP 기준정보 쿼리 조회 */}
      <Form.Item label="세무구분">
        <Select options={TAX_TYPES_FALLBACK}
          onChange={v => setValue('taxTypeCd', v)}
          disabled={!alwaysEditable} />
      </Form.Item>

      {/* 업무구분: 202국내/400품질/401샘플 */}
      <Form.Item label="업무구분">
        <Select options={WRK_FG_OPTIONS}
          onChange={v => setValue('wrkFg', v)}
          disabled={disabled} />
      </Form.Item>

      {/* requestDt, receivedDt, dueDt: DatePicker → setValue */}
      {/* note: Input.TextArea → register('note') */}
      {/* ... similar pattern for remaining fields */}
    </Form>
  );
}
```

- [ ] **6.4** Create `WorkInfoStep.tsx` (**작업사양복사, 작업복사, 세부품목명 명명변경, 구매 추가**)

```tsx
import { useFormContext, useFieldArray } from 'react-hook-form';
import { Tabs, Button, Input, Select, Upload, Space, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, CopyOutlined } from '@ant-design/icons';
import ItemGrid from './ItemGrid';
import AmountSummary from './AmountSummary';
import { WORK_TYPE } from '@/types/order';
import type { OrderFormValues } from '../schema';

interface Props { disabled: boolean; }

export default function WorkInfoStep({ disabled }: Props) {
  const { control, register, watch, getValues } = useFormContext<OrderFormValues>();
  const { fields: dtls, append, remove } = useFieldArray({ control, name: 'dtls' });

  const addDtl = () => append({
    workType: 'OUTSOURCE', workName: '', quantity: 1,
    deliveryFee: 0, designFee: 0, discount: 0, infos: [],
  });

  /** 작업복사: 현재 작업 탭의 전체 데이터를 복사하여 새 탭 생성 */
  const copyDtl = (idx: number) => {
    const src = getValues(`dtls.${idx}`);
    append({ ...src, workName: src.workName + ' (복사)' });
  };

  /** 작업사양복사: 현재 작업의 품목(infos) 사양만 복사하여 새 탭 생성 */
  const copySpecs = (idx: number) => {
    const src = getValues(`dtls.${idx}`);
    append({
      workType: src.workType, workName: '', quantity: 1,
      deliveryFee: 0, designFee: 0, discount: 0,
      infos: src.infos.map(info => ({ ...info, quantity: 1, unitPrice: 0 })),
    });
  };

  const tabItems = dtls.map((w, idx) => ({
    key: String(idx),
    label: (
      <Space>
        {`작업 ${idx + 1}`}
        {!disabled && dtls.length > 1 && (
          <DeleteOutlined onClick={(e) => { e.stopPropagation(); remove(idx); }} />
        )}
      </Space>
    ),
    children: (
      <div>
        {/* Work fields */}
        <Space wrap style={{ marginBottom: 16 }}>
          {/* 구분: 구매 추가됨 */}
          <Select
            style={{ width: 140 }}
            options={Object.entries(WORK_TYPE).map(([k, v]) => ({ value: k, label: v }))}
            onChange={(v) => { /* setValue(`dtls.${idx}.workType`, v) */ }}
            disabled={disabled}
          />
          {/* 세부품목명 (구 작업명) - 작업명은 작업명만 조회 (PPT 참조) */}
          <Input placeholder="세부품목명"
            {...register(`dtls.${idx}.workName`)} disabled={disabled} />
          <Input type="number" placeholder="제작부수(B)" style={{ width: 120 }}
            {...register(`dtls.${idx}.quantity`, { valueAsNumber: true })} disabled={disabled} />
        </Space>

        {/* 작업사양복사 / 작업복사 버튼 */}
        {!disabled && (
          <Space style={{ marginBottom: 8 }}>
            <Tooltip title="작업사양만 복사 (품목 구성만)">
              <Button icon={<CopyOutlined />} onClick={() => copySpecs(idx)}>작업사양복사</Button>
            </Tooltip>
            <Tooltip title="작업 전체 복사">
              <Button icon={<CopyOutlined />} onClick={() => copyDtl(idx)}>작업복사</Button>
            </Tooltip>
          </Space>
        )}

        {/* File upload */}
        <Upload disabled={disabled}><Button disabled={disabled}>파일첨부</Button></Upload>
        <Input.TextArea placeholder="기타사항" {...register(`dtls.${idx}.note`)} disabled={disabled} />

        {/* Items grid (infos) */}
        <ItemGrid dtlIndex={idx} disabled={disabled} />

        {/* Amount summary */}
        <AmountSummary dtlIndex={idx} disabled={disabled} />
      </div>
    ),
  }));

  return (
    <div>
      {!disabled && <Button icon={<PlusOutlined />} onClick={addDtl} style={{ marginBottom: 8 }}>작업 추가</Button>}
      <Tabs type="card" items={tabItems} />
    </div>
  );
}
```

- [ ] **6.5** Create `ItemGrid.tsx` (**구분에 구매 추가, 구성 ERP 쿼리조회/셀렉트박스, 작업명만 조회**)

```tsx
import { useFormContext, useFieldArray } from 'react-hook-form';
import { Table, Button, Select, Input, Space } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { OrderFormValues } from '../schema';

/** 구분: 구매 추가 */
const CATEGORIES = [
  { value: 'PAPER', label: '용지' },
  { value: 'PRINT', label: '인쇄' },
  { value: 'FINISHING', label: '후가공' },
  { value: 'BINDING', label: '제본' },
  { value: 'PURCHASE', label: '구매' },
];

interface Props { dtlIndex: number; disabled: boolean; }

export default function ItemGrid({ dtlIndex, disabled }: Props) {
  const { control, register, watch, setValue } = useFormContext<OrderFormValues>();
  const { fields, append, remove } = useFieldArray({
    control, name: `dtls.${dtlIndex}.infos`,
  });

  const addInfo = () => append({
    category: 'PAPER', composition: '', itemName: '', note: '',
    quantity: 1, unitPrice: 0,
  });

  const columns = [
    { title: '구분', width: 100, render: (_: any, __: any, i: number) => (
      <Select options={CATEGORIES} style={{ width: 90 }}
        onChange={v => setValue(`dtls.${dtlIndex}.infos.${i}.category`, v)}
        disabled={disabled} />
    )},
    { title: '구성', render: (_: any, __: any, i: number) => (
      /** 구성: ERP 쿼리조회/셀렉트박스 */
      <Select
        showSearch allowClear
        style={{ width: '100%' }}
        placeholder="ERP 조회"
        // options from ERP query
        onChange={v => setValue(`dtls.${dtlIndex}.infos.${i}.composition`, v)}
        disabled={disabled}
      />
    )},
    { title: '작업명', render: (_: any, __: any, i: number) => (
      /** 작업명: 작업명만 조회 (PPT 참조) */
      <Input {...register(`dtls.${dtlIndex}.infos.${i}.itemName`)} disabled={disabled} />
    )},
    { title: '비고', render: (_: any, __: any, i: number) => (
      <Input {...register(`dtls.${dtlIndex}.infos.${i}.note`)} disabled={disabled} />
    )},
    { title: '수량(a)', width: 90, render: (_: any, __: any, i: number) => (
      <Input type="number" {...register(`dtls.${dtlIndex}.infos.${i}.quantity`, { valueAsNumber: true })} disabled={disabled} />
    )},
    { title: '단가(b)', width: 120, render: (_: any, __: any, i: number) => (
      <Input type="number" {...register(`dtls.${dtlIndex}.infos.${i}.unitPrice`, { valueAsNumber: true })} disabled={disabled} />
    )},
    { title: '소계(a*b)', width: 120, render: (_: any, __: any, i: number) => {
      const qty = watch(`dtls.${dtlIndex}.infos.${i}.quantity`) || 0;
      const price = watch(`dtls.${dtlIndex}.infos.${i}.unitPrice`) || 0;
      return <span>{(qty * price).toLocaleString()}</span>;
    }},
    { title: '', width: 40, render: (_: any, __: any, i: number) => (
      !disabled && <DeleteOutlined onClick={() => remove(i)} style={{ color: 'red' }} />
    )},
  ];

  return (
    <div style={{ marginTop: 16 }}>
      {!disabled && (
        <Space style={{ marginBottom: 8 }}>
          <Button icon={<PlusOutlined />} onClick={addInfo}>품목행 추가</Button>
          <Button onClick={() => { /* remove all */ }}>품목 초기화</Button>
        </Space>
      )}
      <Table columns={columns} dataSource={fields} rowKey="id" pagination={false} size="small" />
    </div>
  );
}
```

- [ ] **6.6** Create `AmountSummary.tsx` (spec 12.10 display)

```tsx
import { useFormContext } from 'react-hook-form';
import { Descriptions, Input } from 'antd';
import type { OrderFormValues } from '../schema';

interface Props { dtlIndex: number; disabled: boolean; }

export default function AmountSummary({ dtlIndex, disabled }: Props) {
  const { watch, register } = useFormContext<OrderFormValues>();
  const infos = watch(`dtls.${dtlIndex}.infos`) || [];
  const qty = watch(`dtls.${dtlIndex}.quantity`) || 1;
  const deliveryFee = watch(`dtls.${dtlIndex}.deliveryFee`) || 0;
  const designFee = watch(`dtls.${dtlIndex}.designFee`) || 0;
  const discount = watch(`dtls.${dtlIndex}.discount`) || 0;

  // spec 12.10: workAmount = SUM(infos.subtotal) * quantity
  const infosTotal = infos.reduce((sum: number, i: any) =>
    sum + (i.quantity || 0) * (i.unitPrice || 0), 0);
  const workAmount = infosTotal * qty;
  const beforeDiscount = workAmount + deliveryFee + designFee;
  const paymentAmount = beforeDiscount - discount;

  return (
    <Descriptions column={2} bordered size="small" style={{ marginTop: 16 }}>
      <Descriptions.Item label="작업금액(C=A*B)">{workAmount.toLocaleString()}</Descriptions.Item>
      <Descriptions.Item label="배송비(E)">
        <Input type="number" {...register(`dtls.${dtlIndex}.deliveryFee`, { valueAsNumber: true })} disabled={disabled} />
      </Descriptions.Item>
      <Descriptions.Item label="디자인비(F)">
        <Input type="number" {...register(`dtls.${dtlIndex}.designFee`, { valueAsNumber: true })} disabled={disabled} />
      </Descriptions.Item>
      <Descriptions.Item label="할인(H)">
        <Input type="number" {...register(`dtls.${dtlIndex}.discount`, { valueAsNumber: true })} disabled={disabled} />
      </Descriptions.Item>
      <Descriptions.Item label="결제금액(G-H)">
        <span style={{ color: 'red', fontWeight: 'bold', fontSize: 16 }}>
          {paymentAmount.toLocaleString()}원
        </span>
      </Descriptions.Item>
    </Descriptions>
  );
}
```

### Acceptance Criteria
- 2탭 폼: Tab1=주문정보, Tab2=작업정보
- 주문정보탭:
  - 영업담당자: 로그인 사용자 디폴트
  - 영업부서 (구 접수지점): 영업담당자 선택 시 자동반영
  - 세무구분: ERP 기준정보 쿼리 조회
  - 주문번호: GSM+연도+월일+시퀀스 자동생성 (서버)
  - 주문확정/취소 기능 (확정 후 취소 가능)
  - 외주발주처리는 이 메뉴에서 안됨
  - 매출완료 이전까지 회사명/고객명/별도사업/세무구분/영업담당자 수정 가능
  - 외주발주서 팝업
- 작업정보탭:
  - 작업사양복사, 작업복사 기능
  - 구분: 구매 추가
  - 구성: ERP 쿼리조회/셀렉트박스
  - 세부품목명 (구 작업명) 명명변경
  - 작업명은 작업명만 조회 (PPT 참조)
- Dynamic dtl tabs: add/remove dtls, each with infos grid
- Infos grid: add/remove rows, category select (구매 포함), auto subtotal calc
- Amount summary matches spec 12.10 formula
- Zod validation triggers on submit
- SearchPopup integration for 거래처/영업담당자 fields

---

## Task 7: 주문상세/수정 (Reuse OrderCreatePage)

> No new components. OrderCreatePage (Task 6) already handles view/edit via `useParams()`.
> This task is verification + fine-tuning of edit restrictions.
> **변경:** 복합PK 경로, 6단계 상태별 수정 제한, 매출완료 이전 부분수정

### Steps

- [ ] **7.1** Verify `OrderCreatePage` correctly detects mode via `useParams().orderNo`
- [ ] **7.2** Verify edit restriction matrix (**6단계 상태 기반**):

| 상태 | `viewMode` default | 수정 가능 필드 | 수정 button | 비고 |
|------|-------------------|---------------|-------------|------|
| PENDING (주문접수) | true (click 수정→false) | 전체 | Yes | 주문확정 버튼 표시 |
| CONFIRMED (주문확정) | true (click 수정→false) | 전체 | Yes | 확정취소 버튼 표시 |
| PO_COMPLETE (발주완료) | true (click 수정→false) | 회사명/고객명/세무구분/영업담당자 | Yes | 부분수정 |
| SHIP_COMPLETE (발송완료) | true (click 수정→false) | 회사명/고객명/세무구분/영업담당자 | Yes | 부분수정 |
| SALES_WAIT (매출대기) | true (click 수정→false) | 회사명/고객명/세무구분/영업담당자 | Yes | 부분수정 |
| SALES_CONFIRMED (매출확정) | true (locked) | NONE | Hidden | readonly |

- [ ] **7.3** Verify `OrderInfoStep` applies `partialEdit` flag (Task 6.3)
- [ ] **7.4** Verify view-mode header shows orderNo + status Tag + createdAt
- [ ] **7.5** Verify **[알려진 버그]** 주문수정 시 success 반환되지만 실제 수정 안됨 → 원인 파악 및 수정

### Acceptance Criteria
- `/orders/:companyCd/:plantCd/:orderNo` loads data in view mode.
- 6단계 상태별 수정 제한 적용.
- 매출완료(SALES_CONFIRMED) 이전까지 회사명/고객명/세무구분/영업담당자 수정 가능.
- **[알려진 버그]** 주문수정 시 success 반환되지만 실제 수정 안됨 → 해결 확인.

---

## Task 8: 라우팅

> /orders, /orders/create, /orders/:companyCd/:plantCd/:orderNo — add to React Router config.
> **변경:** 복합PK 기반 경로 파라미터

**Files:**
- `sm-module-web/src/routes/index.tsx` (or wherever routes are defined)

### Steps

- [ ] **8.1** Add order routes to the router config

```tsx
// In the routes array (inside ProtectedRoute/Layout wrapper):
import { lazy } from 'react';

const OrderListPage = lazy(() => import('@/pages/order/OrderListPage'));
const OrderCreatePage = lazy(() => import('@/pages/order/OrderCreatePage'));

// Add to route config:
{
  path: '/orders',
  children: [
    { index: true, element: <OrderListPage /> },
    { path: 'create', element: <OrderCreatePage /> },
    { path: ':companyCd/:plantCd/:orderNo', element: <OrderCreatePage /> },  // 복합PK 경로
  ],
},
```

- [ ] **8.2** Add sidebar/nav menu entry for 주문관리

```tsx
// In AppSidebar or nav config:
{ key: 'orders', label: '주문관리', children: [
  { key: '/orders', label: '주문목록' },
  { key: '/orders/create', label: '주문등록' },
]},
```

- [ ] **8.3** Verify navigation flow:
  - `/orders` → OrderListPage
  - `/orders/create` → OrderCreatePage (create mode, no params)
  - `/orders/1000/1000/GSM2026040600001` → OrderCreatePage (view/edit mode, 복합PK)
  - Row click in list → `navigate('/orders/${record.companyCd}/${record.plantCd}/${record.orderNo}')`

### Acceptance Criteria
- All 3 routes render correct components
- Lazy loading with `React.lazy` + `Suspense`
- Sidebar shows 주문관리 > 주문목록, 주문등록
- Navigation between list/create/detail works correctly (복합PK 경로)
