# Phase 6: 세금계산서 + 외부연동 구현 계획서

> **Updated:** 2026-04-07 — 실제 구현 상태 및 신규 요구사항 반영
>
> **주요 변경 이력:**
> - 세금계산서 발행/목록: 아직 화면개발 안됨
> - 더존 연동: ERP 전표 처리 방식 미확정
> - 깃고 연동: API 상세 사양 미정, 외주정산(Phase 5)에서 사용 예정
> - ERP 연동: Oracle DB 직접 조회 방식으로 구현됨 (ErpLookupController)
> - tax_no 필드가 sales_mst에 추가됨 (전자세금계산서번호)
> - 세금계산서발행 프로세스: 주문 N개 선택 → 세금계산서 발행 → ERP 전표 전달

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세금계산서 발행/목록, 더존 API 연동, 깃고 전자결재 연동, ERP 데이터 동기화

**Architecture:** tax 도메인 + integration 패키지. ERP Oracle 직접 조회(ErpLookupController). 외부 API 호출은 WebClient. Gitgo 연동 사양 미정.

**Tech Stack:** Spring Boot 3.x, WebClient, Oracle JDBC, @Scheduled | React 18, TypeScript, Ant Design

**Spec:** `docs/superpowers/specs/2026-03-18-sm-module-design.md` Section 4.5, 5.6, 6.6(세금계산서), 8.1, 8.2, 8.3

**구현 상태:** 세금계산서 발행/목록 화면 미구현. ERP Oracle 조회만 구현됨.

> **Oracle 연동 확정 (2026-04-07):**
> - ERP 연동: Oracle DB 직접 조회 방식으로 구현됨 (ErpLookupController, ErpPartnerRepository 등)
>   - OracleDataSourceConfig: oracle.enabled=true 조건부 로딩, HikariCP pool(max 5)
>   - 마스터 데이터: CI_PARTNER_MST, HR_EMP_MST, CI_ITEM, VW_MA_DEPT_MST 직접 조회
>   - 트랜잭션: SD_ORDER_MST/DTL_X20329, SD_BILL_MST, SD_DLV_MST 직접 조회
>   - 쓰기: SD_ORDER_MST/DTL_X20329, PP_PURORDER_MST_X20329 (SM→ERP)
> - 더존 연동: 미구현, 연동 방식 미확정 (REST API / DB 직접 / 파일 연동)
>   - sales_mst.tax_no에 전자세금계산서번호 저장 예정
> - 깃고 연동: 미구현, API 상세 사양 미정
>   - 외주정산등록에서 N건 체크 → 정산생성 팝업 → Gitgo API 전달
> - 동기화 스케줄러:
>   - 활성: 사원/부서 동기화 (매일 02:00), 배송상태 (1시간 주기)
>   - 비활성: 거래처/품목/주문/매출 동기화 (직접 조회 전환)

---

## Task 1: Flyway V6 - tax_invoices 테이블 마이그레이션 — 미구현

- [ ] **1.1** `sm-module-api/src/main/resources/db/migration/V6__create_tax_invoices.sql` 생성

```sql
-- V6__create_tax_invoices.sql
-- 세금계산서 테이블 + 연동 재시도 큐 테이블

CREATE TABLE tax_invoices (
    id              BIGINT          AUTO_INCREMENT PRIMARY KEY,
    department_id   BIGINT          NOT NULL,
    issue_datetime  DATETIME        NOT NULL,
    issue_no        VARCHAR(30)     UNIQUE,
    biz_no          VARCHAR(20)     NOT NULL        COMMENT '사업자번호',
    company_name    VARCHAR(100)    NOT NULL        COMMENT '회사명',
    manager_name    VARCHAR(50)                     COMMENT '담당자',
    total_amount    BIGINT          NOT NULL        COMMENT '합계액',
    supply_price    BIGINT          NOT NULL        COMMENT '공급가액',
    vat             BIGINT          NOT NULL        COMMENT '세액',
    status          ENUM('ISSUED','CANCELLED')              DEFAULT 'ISSUED'    COMMENT '발행상태',
    douzone_sync_status ENUM('PENDING','SYNCED','FAILED')   DEFAULT 'PENDING'   COMMENT '더존 연동 상태',
    order_id        BIGINT                                  COMMENT '관련 주문',
    deleted         BOOLEAN         DEFAULT FALSE,
    deleted_at      DATETIME,
    deleted_by      BIGINT,
    created_at      DATETIME        NOT NULL,
    updated_at      DATETIME        NOT NULL,
    created_by      BIGINT,
    updated_by      BIGINT,
    CONSTRAINT fk_tax_invoices_department   FOREIGN KEY (department_id)  REFERENCES departments(id),
    CONSTRAINT fk_tax_invoices_order        FOREIGN KEY (order_id)       REFERENCES orders(id),
    CONSTRAINT fk_tax_invoices_created_by   FOREIGN KEY (created_by)     REFERENCES users(id),
    CONSTRAINT fk_tax_invoices_updated_by   FOREIGN KEY (updated_by)     REFERENCES users(id),
    CONSTRAINT fk_tax_invoices_deleted_by   FOREIGN KEY (deleted_by)     REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='세금계산서';

-- 세금계산서 인덱스
CREATE INDEX idx_tax_invoices_department_issue ON tax_invoices (department_id, issue_datetime);
CREATE INDEX idx_tax_invoices_biz_no           ON tax_invoices (biz_no);
CREATE INDEX idx_tax_invoices_sync_status      ON tax_invoices (douzone_sync_status);

-- 외부 연동 재시도 큐 테이블
CREATE TABLE integration_retry_queue (
    id              BIGINT          AUTO_INCREMENT PRIMARY KEY,
    integration_type ENUM('DOUZONE','GITGO','ERP') NOT NULL COMMENT '연동 유형',
    entity_type     VARCHAR(50)     NOT NULL        COMMENT '대상 엔티티 유형 (TAX_INVOICE, SETTLEMENT 등)',
    entity_id       BIGINT          NOT NULL        COMMENT '대상 엔티티 ID',
    payload         JSON                            COMMENT '전송 데이터 (JSON)',
    retry_count     INT             DEFAULT 0       COMMENT '재시도 횟수',
    max_retries     INT             DEFAULT 3       COMMENT '최대 재시도 횟수',
    status          ENUM('PENDING','PROCESSING','SUCCESS','FAILED','DEAD_LETTER')
                                    DEFAULT 'PENDING' COMMENT '처리 상태',
    last_error      TEXT                            COMMENT '마지막 에러 메시지',
    next_retry_at   DATETIME                        COMMENT '다음 재시도 시각',
    created_at      DATETIME        NOT NULL,
    updated_at      DATETIME        NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='외부 연동 재시도 큐';

CREATE INDEX idx_retry_queue_status_next ON integration_retry_queue (status, next_retry_at);
CREATE INDEX idx_retry_queue_type_entity ON integration_retry_queue (integration_type, entity_type, entity_id);
```

- [ ] **1.2** 마이그레이션 실행 확인: `./gradlew flywayMigrate` 로 V6 적용 검증

---

## Task 2: TaxInvoice Backend (Entity, Service, Controller) — 미구현

### 2.1 Entity

- [ ] **2.1.1** `sm-module-api/src/main/java/com/tara/sm/tax/entity/TaxInvoice.java` 생성

```java
package com.tara.sm.tax.entity;

import com.tara.sm.common.audit.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "tax_invoices")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class TaxInvoice extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "department_id", nullable = false)
    private Long departmentId;

    @Column(name = "issue_datetime", nullable = false)
    private LocalDateTime issueDatetime;

    @Column(name = "issue_no", length = 30, unique = true)
    private String issueNo;

    @Column(name = "biz_no", nullable = false, length = 20)
    private String bizNo;

    @Column(name = "company_name", nullable = false, length = 100)
    private String companyName;

    @Column(name = "manager_name", length = 50)
    private String managerName;

    @Column(name = "total_amount", nullable = false)
    private Long totalAmount;

    @Column(name = "supply_price", nullable = false)
    private Long supplyPrice;

    @Column(name = "vat", nullable = false)
    private Long vat;

    @Enumerated(EnumType.STRING)
    @Column(name = "status")
    @Builder.Default
    private TaxInvoiceStatus status = TaxInvoiceStatus.ISSUED;

    @Enumerated(EnumType.STRING)
    @Column(name = "douzone_sync_status")
    @Builder.Default
    private SyncStatus douzoneSyncStatus = SyncStatus.PENDING;

    @Column(name = "order_id")
    private Long orderId;

    @Column(name = "deleted")
    @Builder.Default
    private Boolean deleted = false;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Column(name = "deleted_by")
    private Long deletedBy;

    public enum TaxInvoiceStatus {
        ISSUED, CANCELLED
    }

    public enum SyncStatus {
        PENDING, SYNCED, FAILED
    }

    public void markSynced(String issueNo) {
        this.issueNo = issueNo;
        this.douzoneSyncStatus = SyncStatus.SYNCED;
    }

    public void markFailed() {
        this.douzoneSyncStatus = SyncStatus.FAILED;
    }

    public void cancel() {
        this.status = TaxInvoiceStatus.CANCELLED;
    }
}
```

- [ ] **2.1.2** `sm-module-api/src/main/java/com/tara/sm/tax/entity/IntegrationRetryQueue.java` 생성

```java
package com.tara.sm.tax.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "integration_retry_queue")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class IntegrationRetryQueue {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "integration_type", nullable = false)
    private IntegrationType integrationType;

    @Column(name = "entity_type", nullable = false, length = 50)
    private String entityType;

    @Column(name = "entity_id", nullable = false)
    private Long entityId;

    @Column(name = "payload", columnDefinition = "JSON")
    private String payload;

    @Column(name = "retry_count")
    @Builder.Default
    private Integer retryCount = 0;

    @Column(name = "max_retries")
    @Builder.Default
    private Integer maxRetries = 3;

    @Enumerated(EnumType.STRING)
    @Column(name = "status")
    @Builder.Default
    private RetryStatus status = RetryStatus.PENDING;

    @Column(name = "last_error", columnDefinition = "TEXT")
    private String lastError;

    @Column(name = "next_retry_at")
    private LocalDateTime nextRetryAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public enum IntegrationType {
        DOUZONE, GITGO, ERP
    }

    public enum RetryStatus {
        PENDING, PROCESSING, SUCCESS, FAILED, DEAD_LETTER
    }

    public void incrementRetry(String errorMessage) {
        this.retryCount++;
        this.lastError = errorMessage;
        this.updatedAt = LocalDateTime.now();
        if (this.retryCount >= this.maxRetries) {
            this.status = RetryStatus.DEAD_LETTER;
        } else {
            this.status = RetryStatus.PENDING;
            // 지수 백오프: 1분, 4분, 9분 ...
            long delayMinutes = (long) Math.pow(this.retryCount, 2);
            this.nextRetryAt = LocalDateTime.now().plusMinutes(delayMinutes);
        }
    }

    public void markSuccess() {
        this.status = RetryStatus.SUCCESS;
        this.updatedAt = LocalDateTime.now();
    }

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }
}
```

### 2.2 Repository

- [ ] **2.2.1** `sm-module-api/src/main/java/com/tara/sm/tax/repository/TaxInvoiceRepository.java` 생성

```java
package com.tara.sm.tax.repository;

import com.tara.sm.tax.entity.TaxInvoice;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface TaxInvoiceRepository extends JpaRepository<TaxInvoice, Long> {

    @Query("""
        SELECT t FROM TaxInvoice t
        WHERE t.deleted = false
          AND (:departmentId IS NULL OR t.departmentId = :departmentId)
          AND t.issueDatetime BETWEEN :startDate AND :endDate
          AND (:keyword IS NULL OR t.companyName LIKE CONCAT('%', :keyword, '%')
               OR t.bizNo LIKE CONCAT('%', :keyword, '%')
               OR t.managerName LIKE CONCAT('%', :keyword, '%'))
    """)
    Page<TaxInvoice> findByFilters(
        @Param("departmentId") Long departmentId,
        @Param("startDate") LocalDateTime startDate,
        @Param("endDate") LocalDateTime endDate,
        @Param("keyword") String keyword,
        Pageable pageable
    );

    @Query("""
        SELECT t FROM TaxInvoice t
        WHERE t.deleted = false
          AND (:departmentId IS NULL OR t.departmentId = :departmentId)
          AND t.issueDatetime BETWEEN :startDate AND :endDate
          AND (:keyword IS NULL OR t.companyName LIKE CONCAT('%', :keyword, '%')
               OR t.bizNo LIKE CONCAT('%', :keyword, '%')
               OR t.managerName LIKE CONCAT('%', :keyword, '%'))
    """)
    List<TaxInvoice> findAllByFilters(
        @Param("departmentId") Long departmentId,
        @Param("startDate") LocalDateTime startDate,
        @Param("endDate") LocalDateTime endDate,
        @Param("keyword") String keyword
    );

    List<TaxInvoice> findByDouzoneSyncStatus(TaxInvoice.SyncStatus status);
}
```

- [ ] **2.2.2** `sm-module-api/src/main/java/com/tara/sm/tax/repository/IntegrationRetryQueueRepository.java` 생성

```java
package com.tara.sm.tax.repository;

import com.tara.sm.tax.entity.IntegrationRetryQueue;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface IntegrationRetryQueueRepository extends JpaRepository<IntegrationRetryQueue, Long> {

    @Query("""
        SELECT q FROM IntegrationRetryQueue q
        WHERE q.status = 'PENDING'
          AND q.nextRetryAt <= :now
          AND q.integrationType = :type
        ORDER BY q.nextRetryAt ASC
    """)
    List<IntegrationRetryQueue> findRetryableByType(
        @Param("type") IntegrationRetryQueue.IntegrationType type,
        @Param("now") LocalDateTime now
    );

    List<IntegrationRetryQueue> findByStatus(IntegrationRetryQueue.RetryStatus status);
}
```

### 2.3 DTO

- [ ] **2.3.1** `sm-module-api/src/main/java/com/tara/sm/tax/dto/TaxCandidateDto.java` 생성

```java
package com.tara.sm.tax.dto;

import lombok.*;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TaxCandidateDto {
    private Long orderId;
    private String branchName;
    private String orderNo;
    private String orderTitle;
    private String companyName;
    private String customerName;
    private Long orderAmount;
    private Long unpaidAmount;
}
```

- [ ] **2.3.2** `sm-module-api/src/main/java/com/tara/sm/tax/dto/TaxIssueRequestDto.java` 생성

```java
package com.tara.sm.tax.dto;

import jakarta.validation.constraints.NotEmpty;
import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
public class TaxIssueRequestDto {
    @NotEmpty(message = "발행 대상 주문을 선택해주세요.")
    private List<Long> orderIds;
}
```

- [ ] **2.3.3** `sm-module-api/src/main/java/com/tara/sm/tax/dto/TaxInvoiceDto.java` 생성

```java
package com.tara.sm.tax.dto;

import lombok.*;

import java.time.LocalDateTime;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TaxInvoiceDto {
    private Long id;
    private String departmentName;
    private LocalDateTime issueDatetime;
    private String issueNo;
    private String bizNo;
    private String companyName;
    private String managerName;
    private Long totalAmount;
    private Long supplyPrice;
    private Long vat;
    private String status;
    private String douzoneSyncStatus;
}
```

- [ ] **2.3.4** `sm-module-api/src/main/java/com/tara/sm/tax/dto/TaxInvoiceSearchDto.java` 생성

```java
package com.tara.sm.tax.dto;

import lombok.*;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TaxInvoiceSearchDto {
    private Long departmentId;

    @DateTimeFormat(pattern = "yyyy-MM-dd")
    private LocalDate startDate;

    @DateTimeFormat(pattern = "yyyy-MM-dd")
    private LocalDate endDate;

    private String keyword;
}
```

- [ ] **2.3.5** `sm-module-api/src/main/java/com/tara/sm/tax/dto/TaxInvoiceSummaryDto.java` 생성

```java
package com.tara.sm.tax.dto;

import lombok.*;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TaxInvoiceSummaryDto {
    private int totalCount;
    private Long totalAmount;
    private Long totalSupplyPrice;
    private Long totalVat;
}
```

### 2.4 Service

- [ ] **2.4.1** `sm-module-api/src/main/java/com/tara/sm/tax/service/TaxInvoiceService.java` 생성

```java
package com.tara.sm.tax.service;

import com.tara.sm.common.exception.BusinessException;
import com.tara.sm.tax.dto.*;
import com.tara.sm.tax.entity.IntegrationRetryQueue;
import com.tara.sm.tax.entity.TaxInvoice;
import com.tara.sm.tax.repository.IntegrationRetryQueueRepository;
import com.tara.sm.tax.repository.TaxInvoiceRepository;
import com.tara.sm.integration.douzone.DouzoneTaxClient;
import com.tara.sm.integration.douzone.dto.DouzoneInvoiceRequest;
import com.tara.sm.integration.douzone.dto.DouzoneInvoiceResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class TaxInvoiceService {

    private final TaxInvoiceRepository taxInvoiceRepository;
    private final IntegrationRetryQueueRepository retryQueueRepository;
    private final DouzoneTaxClient douzoneTaxClient;
    // OrderRepository, BusinessOwnerRepository 등 필요 시 주입

    /**
     * 세금계산서 발행 대상 주문 목록 조회
     * - status = SALES_REGISTERED && tax_type = TAXABLE
     * - 이미 세금계산서가 발행된 주문 제외
     */
    public List<TaxCandidateDto> getCandidates() {
        // TODO: OrderRepository에서 매출등록 완료 + 과세 + 미발행 건 조회
        // 아래는 구현 구조 예시
        /*
        return orderRepository.findTaxCandidates().stream()
            .map(order -> TaxCandidateDto.builder()
                .orderId(order.getId())
                .branchName(order.getReceiverBranch())
                .orderNo(order.getOrderNo())
                .orderTitle(order.getTitle())
                .companyName(order.getBusinessOwner().getCompanyName())
                .customerName(order.getCustomer().getName())
                .orderAmount(order.getTotalAmount())
                .unpaidAmount(calculateUnpaidAmount(order))
                .build())
            .toList();
        */
        return new ArrayList<>();
    }

    /**
     * 세금계산서 일괄 발행 (더존 연동)
     */
    @Transactional
    public List<TaxInvoiceDto> issueInvoices(TaxIssueRequestDto request) {
        List<TaxInvoiceDto> results = new ArrayList<>();

        for (Long orderId : request.getOrderIds()) {
            try {
                // 1) 주문 정보 조회 및 검증
                // Order order = orderRepository.findById(orderId)
                //     .orElseThrow(() -> new BusinessException("ORDER_NOT_FOUND", "주문을 찾을 수 없습니다."));

                // 2) 공급가액/세액 계산
                // long supplyPrice = Math.round(order.getTotalAmount() / 1.1);
                // long vat = order.getTotalAmount() - supplyPrice;

                // 3) TaxInvoice 엔티티 저장 (PENDING 상태)
                TaxInvoice invoice = TaxInvoice.builder()
                    // .departmentId(order.getDepartmentId())
                    .issueDatetime(LocalDateTime.now())
                    // .bizNo(order.getBusinessOwner().getBizNo())
                    // .companyName(order.getBusinessOwner().getCompanyName())
                    // .totalAmount(order.getTotalAmount())
                    // .supplyPrice(supplyPrice)
                    // .vat(vat)
                    .status(TaxInvoice.TaxInvoiceStatus.ISSUED)
                    .douzoneSyncStatus(TaxInvoice.SyncStatus.PENDING)
                    .orderId(orderId)
                    .build();

                invoice = taxInvoiceRepository.save(invoice);

                // 4) 더존 API 호출
                try {
                    DouzoneInvoiceResponse response = douzoneTaxClient.sendInvoice(
                        DouzoneInvoiceRequest.builder()
                            .bizNo(invoice.getBizNo())
                            .companyName(invoice.getCompanyName())
                            .managerName(invoice.getManagerName())
                            .supplyPrice(invoice.getSupplyPrice())
                            .vat(invoice.getVat())
                            .totalAmount(invoice.getTotalAmount())
                            .issueDate(invoice.getIssueDatetime())
                            .build()
                    );
                    invoice.markSynced(response.getIssueNo());
                } catch (Exception e) {
                    log.error("더존 연동 실패 - orderId: {}, error: {}", orderId, e.getMessage());
                    invoice.markFailed();
                    enqueueRetry(IntegrationRetryQueue.IntegrationType.DOUZONE,
                        "TAX_INVOICE", invoice.getId(), e.getMessage());
                }

                taxInvoiceRepository.save(invoice);

                results.add(toDto(invoice));
            } catch (Exception e) {
                log.error("세금계산서 발행 실패 - orderId: {}", orderId, e);
                throw new BusinessException("TAX_ISSUE_FAILED",
                    "세금계산서 발행 중 오류가 발생했습니다: " + e.getMessage());
            }
        }

        return results;
    }

    /**
     * 세금계산서 발행 목록 조회 (페이징)
     */
    public Page<TaxInvoiceDto> getInvoices(TaxInvoiceSearchDto search, Pageable pageable) {
        LocalDateTime startDateTime = search.getStartDate() != null
            ? search.getStartDate().atStartOfDay()
            : LocalDateTime.of(2000, 1, 1, 0, 0);
        LocalDateTime endDateTime = search.getEndDate() != null
            ? search.getEndDate().atTime(23, 59, 59)
            : LocalDateTime.of(2099, 12, 31, 23, 59);

        return taxInvoiceRepository.findByFilters(
            search.getDepartmentId(),
            startDateTime,
            endDateTime,
            search.getKeyword(),
            pageable
        ).map(this::toDto);
    }

    /**
     * 세금계산서 발행 목록 합계
     */
    public TaxInvoiceSummaryDto getInvoiceSummary(TaxInvoiceSearchDto search) {
        LocalDateTime startDateTime = search.getStartDate() != null
            ? search.getStartDate().atStartOfDay()
            : LocalDateTime.of(2000, 1, 1, 0, 0);
        LocalDateTime endDateTime = search.getEndDate() != null
            ? search.getEndDate().atTime(23, 59, 59)
            : LocalDateTime.of(2099, 12, 31, 23, 59);

        List<TaxInvoice> all = taxInvoiceRepository.findAllByFilters(
            search.getDepartmentId(), startDateTime, endDateTime, search.getKeyword()
        );

        return TaxInvoiceSummaryDto.builder()
            .totalCount(all.size())
            .totalAmount(all.stream().mapToLong(TaxInvoice::getTotalAmount).sum())
            .totalSupplyPrice(all.stream().mapToLong(TaxInvoice::getSupplyPrice).sum())
            .totalVat(all.stream().mapToLong(TaxInvoice::getVat).sum())
            .build();
    }

    /**
     * 엑셀 다운로드용 전체 목록
     */
    public List<TaxInvoiceDto> getInvoicesForExport(TaxInvoiceSearchDto search) {
        LocalDateTime startDateTime = search.getStartDate() != null
            ? search.getStartDate().atStartOfDay()
            : LocalDateTime.of(2000, 1, 1, 0, 0);
        LocalDateTime endDateTime = search.getEndDate() != null
            ? search.getEndDate().atTime(23, 59, 59)
            : LocalDateTime.of(2099, 12, 31, 23, 59);

        return taxInvoiceRepository.findAllByFilters(
            search.getDepartmentId(), startDateTime, endDateTime, search.getKeyword()
        ).stream().map(this::toDto).toList();
    }

    // ── Private helpers ──

    private void enqueueRetry(IntegrationRetryQueue.IntegrationType type,
                              String entityType, Long entityId, String error) {
        IntegrationRetryQueue retry = IntegrationRetryQueue.builder()
            .integrationType(type)
            .entityType(entityType)
            .entityId(entityId)
            .retryCount(0)
            .maxRetries(3)
            .status(IntegrationRetryQueue.RetryStatus.PENDING)
            .lastError(error)
            .nextRetryAt(LocalDateTime.now().plusMinutes(1))
            .build();
        retryQueueRepository.save(retry);
    }

    private TaxInvoiceDto toDto(TaxInvoice entity) {
        return TaxInvoiceDto.builder()
            .id(entity.getId())
            // .departmentName(departmentRepository.findById(entity.getDepartmentId()).getName())
            .issueDatetime(entity.getIssueDatetime())
            .issueNo(entity.getIssueNo())
            .bizNo(entity.getBizNo())
            .companyName(entity.getCompanyName())
            .managerName(entity.getManagerName())
            .totalAmount(entity.getTotalAmount())
            .supplyPrice(entity.getSupplyPrice())
            .vat(entity.getVat())
            .status(entity.getStatus().name())
            .douzoneSyncStatus(entity.getDouzoneSyncStatus().name())
            .build();
    }
}
```

### 2.5 Controller

- [ ] **2.5.1** `sm-module-api/src/main/java/com/tara/sm/tax/controller/TaxInvoiceController.java` 생성

```java
package com.tara.sm.tax.controller;

import com.tara.sm.common.dto.ApiResponse;
import com.tara.sm.tax.dto.*;
import com.tara.sm.tax.service.TaxInvoiceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/tax")
@RequiredArgsConstructor
@Tag(name = "세금계산서", description = "세금계산서 발행 및 조회 API")
public class TaxInvoiceController {

    private final TaxInvoiceService taxInvoiceService;

    @GetMapping("/candidates")
    @Operation(summary = "발행 대상 주문 목록", description = "세금계산서 발행 대상 주문 목록을 조회합니다.")
    public ResponseEntity<ApiResponse<List<TaxCandidateDto>>> getCandidates() {
        List<TaxCandidateDto> candidates = taxInvoiceService.getCandidates();
        return ResponseEntity.ok(ApiResponse.success(candidates));
    }

    @PostMapping("/issue")
    @Operation(summary = "세금계산서 발행", description = "선택한 주문에 대해 세금계산서를 일괄 발행합니다 (더존 연동).")
    public ResponseEntity<ApiResponse<List<TaxInvoiceDto>>> issueInvoices(
            @Valid @RequestBody TaxIssueRequestDto request) {
        List<TaxInvoiceDto> results = taxInvoiceService.issueInvoices(request);
        return ResponseEntity.ok(ApiResponse.success(results, "세금계산서가 발행되었습니다."));
    }

    @GetMapping("/invoices")
    @Operation(summary = "발행 목록 조회", description = "세금계산서 발행 목록을 조회합니다.")
    public ResponseEntity<ApiResponse<Page<TaxInvoiceDto>>> getInvoices(
            @ModelAttribute TaxInvoiceSearchDto search,
            @PageableDefault(size = 20) Pageable pageable) {
        Page<TaxInvoiceDto> invoices = taxInvoiceService.getInvoices(search, pageable);
        return ResponseEntity.ok(ApiResponse.success(invoices));
    }

    @GetMapping("/invoices/summary")
    @Operation(summary = "발행 목록 합계", description = "세금계산서 발행 목록의 합계를 조회합니다.")
    public ResponseEntity<ApiResponse<TaxInvoiceSummaryDto>> getInvoiceSummary(
            @ModelAttribute TaxInvoiceSearchDto search) {
        TaxInvoiceSummaryDto summary = taxInvoiceService.getInvoiceSummary(search);
        return ResponseEntity.ok(ApiResponse.success(summary));
    }

    @GetMapping("/invoices/export")
    @Operation(summary = "발행 목록 엑셀", description = "세금계산서 발행 목록을 엑셀로 다운로드합니다.")
    public ResponseEntity<ApiResponse<List<TaxInvoiceDto>>> exportInvoices(
            @ModelAttribute TaxInvoiceSearchDto search) {
        List<TaxInvoiceDto> data = taxInvoiceService.getInvoicesForExport(search);
        return ResponseEntity.ok(ApiResponse.success(data));
    }
}
```

---

## Task 3: 더존 연동 클라이언트 (DouzoneTaxClient) — 미구현 (ERP 전표 처리 방식 미확정)

- [ ] **3.1** `sm-module-api/src/main/java/com/tara/sm/integration/douzone/dto/DouzoneInvoiceRequest.java` 생성

```java
package com.tara.sm.integration.douzone.dto;

import lombok.*;

import java.time.LocalDateTime;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DouzoneInvoiceRequest {
    private String bizNo;
    private String companyName;
    private String managerName;
    private Long supplyPrice;
    private Long vat;
    private Long totalAmount;
    private LocalDateTime issueDate;
}
```

- [ ] **3.2** `sm-module-api/src/main/java/com/tara/sm/integration/douzone/dto/DouzoneInvoiceResponse.java` 생성

```java
package com.tara.sm.integration.douzone.dto;

import lombok.*;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DouzoneInvoiceResponse {
    private boolean success;
    private String issueNo;
    private String message;
    private String errorCode;
}
```

- [ ] **3.3** `sm-module-api/src/main/java/com/tara/sm/integration/douzone/DouzoneTaxClient.java` 생성

```java
package com.tara.sm.integration.douzone;

import com.tara.sm.integration.douzone.dto.DouzoneInvoiceRequest;
import com.tara.sm.integration.douzone.dto.DouzoneInvoiceResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.time.Duration;

@Component
@Slf4j
public class DouzoneTaxClient {

    private final WebClient webClient;

    public DouzoneTaxClient(
            @Value("${integration.douzone.base-url:https://api.douzone.com}") String baseUrl,
            @Value("${integration.douzone.api-key:}") String apiKey,
            @Value("${integration.douzone.timeout:30}") int timeoutSeconds) {
        this.webClient = WebClient.builder()
            .baseUrl(baseUrl)
            .defaultHeader("Authorization", "Bearer " + apiKey)
            .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
            .build();
    }

    /**
     * 세금계산서 발행 API 호출
     * 실패 시 WebClientResponseException 또는 RuntimeException 발생 -> 호출측에서 재시도 큐 등록
     */
    public DouzoneInvoiceResponse sendInvoice(DouzoneInvoiceRequest request) {
        log.info("더존 세금계산서 발행 요청: bizNo={}, totalAmount={}",
            request.getBizNo(), request.getTotalAmount());

        try {
            DouzoneInvoiceResponse response = webClient.post()
                .uri("/api/v1/tax-invoices")
                .bodyValue(request)
                .retrieve()
                .bodyToMono(DouzoneInvoiceResponse.class)
                .timeout(Duration.ofSeconds(30))
                .block();

            if (response == null || !response.isSuccess()) {
                String msg = response != null ? response.getMessage() : "응답 없음";
                log.error("더존 API 실패 응답: {}", msg);
                throw new RuntimeException("더존 세금계산서 발행 실패: " + msg);
            }

            log.info("더존 세금계산서 발행 성공: issueNo={}", response.getIssueNo());
            return response;

        } catch (WebClientResponseException e) {
            log.error("더존 API HTTP 에러: status={}, body={}",
                e.getStatusCode(), e.getResponseBodyAsString());
            throw new RuntimeException("더존 API 호출 실패 (HTTP " + e.getStatusCode() + ")", e);
        }
    }
}
```

- [ ] **3.4** `sm-module-api/src/main/java/com/tara/sm/integration/douzone/DouzoneRetryScheduler.java` 생성

```java
package com.tara.sm.integration.douzone;

import com.tara.sm.tax.entity.IntegrationRetryQueue;
import com.tara.sm.tax.entity.TaxInvoice;
import com.tara.sm.tax.repository.IntegrationRetryQueueRepository;
import com.tara.sm.tax.repository.TaxInvoiceRepository;
import com.tara.sm.integration.douzone.dto.DouzoneInvoiceRequest;
import com.tara.sm.integration.douzone.dto.DouzoneInvoiceResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class DouzoneRetryScheduler {

    private final IntegrationRetryQueueRepository retryQueueRepository;
    private final TaxInvoiceRepository taxInvoiceRepository;
    private final DouzoneTaxClient douzoneTaxClient;

    /**
     * 1분마다 더존 연동 재시도 큐 처리
     * - PENDING 상태 + next_retry_at <= 현재 시각인 건만 처리
     * - 최대 3회 재시도 후 DEAD_LETTER로 이관
     */
    @Scheduled(fixedDelay = 60_000) // 1분 간격
    @Transactional
    public void retryFailedDouzoneInvoices() {
        List<IntegrationRetryQueue> retries = retryQueueRepository.findRetryableByType(
            IntegrationRetryQueue.IntegrationType.DOUZONE,
            LocalDateTime.now()
        );

        if (retries.isEmpty()) return;

        log.info("더존 연동 재시도 처리 시작: {} 건", retries.size());

        for (IntegrationRetryQueue retry : retries) {
            retry.setStatus(IntegrationRetryQueue.RetryStatus.PROCESSING);
            retryQueueRepository.save(retry);

            try {
                TaxInvoice invoice = taxInvoiceRepository.findById(retry.getEntityId())
                    .orElse(null);

                if (invoice == null) {
                    log.warn("세금계산서를 찾을 수 없음: id={}", retry.getEntityId());
                    retry.markSuccess(); // 대상 없으므로 완료 처리
                    continue;
                }

                DouzoneInvoiceResponse response = douzoneTaxClient.sendInvoice(
                    DouzoneInvoiceRequest.builder()
                        .bizNo(invoice.getBizNo())
                        .companyName(invoice.getCompanyName())
                        .managerName(invoice.getManagerName())
                        .supplyPrice(invoice.getSupplyPrice())
                        .vat(invoice.getVat())
                        .totalAmount(invoice.getTotalAmount())
                        .issueDate(invoice.getIssueDatetime())
                        .build()
                );

                invoice.markSynced(response.getIssueNo());
                taxInvoiceRepository.save(invoice);
                retry.markSuccess();

                log.info("더존 재시도 성공: invoiceId={}, issueNo={}",
                    invoice.getId(), response.getIssueNo());

            } catch (Exception e) {
                log.error("더존 재시도 실패: retryId={}, attempt={}/{}",
                    retry.getId(), retry.getRetryCount() + 1, retry.getMaxRetries(), e);
                retry.incrementRetry(e.getMessage());

                if (retry.getStatus() == IntegrationRetryQueue.RetryStatus.DEAD_LETTER) {
                    log.error("더존 재시도 최대 횟수 초과 (DEAD_LETTER): retryId={}, entityId={}",
                        retry.getId(), retry.getEntityId());
                    // TODO: 관리자 알림 (이메일/슬랙 등)
                }
            }

            retryQueueRepository.save(retry);
        }
    }
}
```

- [ ] **3.5** `application.yml`에 더존 연동 설정 추가

```yaml
# application.yml 에 추가
integration:
  douzone:
    base-url: https://api.douzone.com
    api-key: ${DOUZONE_API_KEY:}
    timeout: 30
```

---

## Task 4: 깃고 연동 클라이언트 (GitgoApprovalClient) — 미구현 (API 상세 사양 미정)

- [ ] **4.1** `sm-module-api/src/main/java/com/tara/sm/integration/gitgo/dto/GitgoApprovalRequest.java` 생성

```java
package com.tara.sm.integration.gitgo.dto;

import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GitgoApprovalRequest {
    private String documentTitle;
    private String approvalType;    // "PURCHASE_SETTLEMENT"
    private List<SettlementItem> items;

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class SettlementItem {
        private String orderNo;
        private String poNo;
        private String vendorName;
        private Long amount;
        private String workName;
    }
}
```

- [ ] **4.2** `sm-module-api/src/main/java/com/tara/sm/integration/gitgo/dto/GitgoApprovalResponse.java` 생성

```java
package com.tara.sm.integration.gitgo.dto;

import lombok.*;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GitgoApprovalResponse {
    private boolean success;
    private String documentNo;   // 결재 문서번호
    private String message;
}
```

- [ ] **4.3** `sm-module-api/src/main/java/com/tara/sm/integration/gitgo/dto/GitgoWebhookPayload.java` 생성

```java
package com.tara.sm.integration.gitgo.dto;

import lombok.*;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GitgoWebhookPayload {
    private String documentNo;
    private String status;       // "APPROVED", "REJECTED"
    private String approverName;
    private String approvedAt;
    private String rejectReason;
}
```

- [ ] **4.4** `sm-module-api/src/main/java/com/tara/sm/integration/gitgo/GitgoApprovalClient.java` 생성

```java
package com.tara.sm.integration.gitgo;

import com.tara.sm.integration.gitgo.dto.GitgoApprovalRequest;
import com.tara.sm.integration.gitgo.dto.GitgoApprovalResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.time.Duration;

@Component
@Slf4j
public class GitgoApprovalClient {

    private final WebClient webClient;

    public GitgoApprovalClient(
            @Value("${integration.gitgo.base-url:https://api.gitgo.co.kr}") String baseUrl,
            @Value("${integration.gitgo.api-key:}") String apiKey,
            @Value("${integration.gitgo.timeout:30}") int timeoutSeconds) {
        this.webClient = WebClient.builder()
            .baseUrl(baseUrl)
            .defaultHeader("X-API-Key", apiKey)
            .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
            .build();
    }

    /**
     * 전자결재 요청
     */
    public GitgoApprovalResponse requestApproval(GitgoApprovalRequest request) {
        log.info("깃고 전자결재 요청: title={}, items={}건",
            request.getDocumentTitle(), request.getItems().size());

        try {
            GitgoApprovalResponse response = webClient.post()
                .uri("/api/v1/approvals")
                .bodyValue(request)
                .retrieve()
                .bodyToMono(GitgoApprovalResponse.class)
                .timeout(Duration.ofSeconds(30))
                .block();

            if (response == null || !response.isSuccess()) {
                String msg = response != null ? response.getMessage() : "응답 없음";
                log.error("깃고 API 실패 응답: {}", msg);
                throw new RuntimeException("깃고 전자결재 요청 실패: " + msg);
            }

            log.info("깃고 전자결재 요청 성공: documentNo={}", response.getDocumentNo());
            return response;

        } catch (WebClientResponseException e) {
            log.error("깃고 API HTTP 에러: status={}, body={}",
                e.getStatusCode(), e.getResponseBodyAsString());
            throw new RuntimeException("깃고 API 호출 실패 (HTTP " + e.getStatusCode() + ")", e);
        }
    }
}
```

- [ ] **4.5** `sm-module-api/src/main/java/com/tara/sm/integration/gitgo/GitgoWebhookController.java` 생성

```java
package com.tara.sm.integration.gitgo;

import com.tara.sm.common.dto.ApiResponse;
import com.tara.sm.integration.gitgo.dto.GitgoWebhookPayload;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/webhooks/gitgo")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "깃고 Webhook", description = "깃고 전자결재 콜백 수신")
public class GitgoWebhookController {

    // OutsourcingSettlementRepository 등 필요 시 주입

    /**
     * 깃고 전자결재 상태 콜백 수신
     * - 결재 승인: gitgo_sync_status -> SYNCED
     * - 결재 반려: gitgo_sync_status -> FAILED + 사유 기록
     */
    @PostMapping("/approval-callback")
    @Operation(summary = "결재 상태 콜백", description = "깃고에서 결재 승인/반려 시 호출되는 웹훅 엔드포인트")
    public ResponseEntity<ApiResponse<Void>> handleApprovalCallback(
            @RequestBody GitgoWebhookPayload payload) {

        log.info("깃고 웹훅 수신: documentNo={}, status={}",
            payload.getDocumentNo(), payload.getStatus());

        switch (payload.getStatus()) {
            case "APPROVED":
                // 정산건의 gitgo_sync_status -> SYNCED 변경
                // outsourcingSettlementRepository.findByGitgoDocumentNo(payload.getDocumentNo())
                //     .ifPresent(settlement -> {
                //         settlement.setGitgoSyncStatus(SyncStatus.SYNCED);
                //         outsourcingSettlementRepository.save(settlement);
                //     });
                log.info("깃고 결재 승인: documentNo={}", payload.getDocumentNo());
                break;

            case "REJECTED":
                // 정산건의 gitgo_sync_status -> FAILED 변경
                log.info("깃고 결재 반려: documentNo={}, reason={}",
                    payload.getDocumentNo(), payload.getRejectReason());
                break;

            default:
                log.warn("알 수 없는 깃고 상태: {}", payload.getStatus());
        }

        return ResponseEntity.ok(ApiResponse.success(null));
    }
}
```

- [ ] **4.6** `application.yml`에 깃고 연동 설정 추가

```yaml
# application.yml 에 추가
integration:
  gitgo:
    base-url: https://api.gitgo.co.kr
    api-key: ${GITGO_API_KEY:}
    timeout: 30
    webhook-secret: ${GITGO_WEBHOOK_SECRET:}
```

---

## Task 5: ERP 연동 클라이언트 — **구현됨** (Oracle DB 직접 조회, ErpLookupController)

- [ ] **5.1** `sm-module-api/src/main/java/com/tara/sm/integration/erp/dto/ErpOrderDto.java` 생성

```java
package com.tara.sm.integration.erp.dto;

import lombok.*;

import java.time.LocalDate;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ErpOrderDto {
    private String erpOrderId;
    private String orderNo;
    private String status;          // "SHIPPED", "CANCELLED" 등
    private LocalDate shippedDate;
    private String workTitle;
    private Long amount;
}
```

- [ ] **5.2** `sm-module-api/src/main/java/com/tara/sm/integration/erp/ErpSyncClient.java` 생성

```java
package com.tara.sm.integration.erp;

import com.tara.sm.integration.erp.dto.ErpOrderDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.time.Duration;
import java.time.LocalDate;
import java.util.Collections;
import java.util.List;

@Component
@Slf4j
public class ErpSyncClient {

    private final WebClient webClient;

    public ErpSyncClient(
            @Value("${integration.erp.base-url:http://erp.internal:8080}") String baseUrl,
            @Value("${integration.erp.api-key:}") String apiKey,
            @Value("${integration.erp.timeout:60}") int timeoutSeconds) {
        this.webClient = WebClient.builder()
            .baseUrl(baseUrl)
            .defaultHeader("Authorization", "Bearer " + apiKey)
            .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
            .build();
    }

    /**
     * ERP에서 발송완료(SHIPPED) 주문 목록 조회
     * @param since 조회 시작일
     */
    public List<ErpOrderDto> fetchShippedOrders(LocalDate since) {
        log.info("ERP 발송완료 주문 조회: since={}", since);

        try {
            List<ErpOrderDto> orders = webClient.get()
                .uri(uriBuilder -> uriBuilder
                    .path("/api/v1/orders/shipped")
                    .queryParam("since", since.toString())
                    .build())
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<List<ErpOrderDto>>() {})
                .timeout(Duration.ofSeconds(60))
                .block();

            log.info("ERP 발송완료 주문 {} 건 조회됨", orders != null ? orders.size() : 0);
            return orders != null ? orders : Collections.emptyList();

        } catch (WebClientResponseException e) {
            log.error("ERP API HTTP 에러: status={}, body={}",
                e.getStatusCode(), e.getResponseBodyAsString());
            return Collections.emptyList();
        } catch (Exception e) {
            log.error("ERP API 호출 실패", e);
            return Collections.emptyList();
        }
    }
}
```

- [ ] **5.3** `sm-module-api/src/main/java/com/tara/sm/integration/erp/ErpSyncScheduler.java` 생성

```java
package com.tara.sm.integration.erp;

import com.tara.sm.integration.erp.dto.ErpOrderDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class ErpSyncScheduler {

    private final ErpSyncClient erpSyncClient;
    // private final OrderRepository orderRepository;

    /**
     * 10분마다 ERP 발송완료 주문 동기화
     * - ERP에서 SHIPPED 상태인 주문 조회
     * - SM Module의 주문 상태를 SHIPPED로 업데이트
     */
    @Scheduled(fixedDelay = 600_000) // 10분 간격
    @Transactional
    public void syncShippedOrders() {
        log.info("ERP 주문 상태 동기화 시작");

        try {
            // 최근 7일간 발송완료 건 조회
            List<ErpOrderDto> shippedOrders = erpSyncClient.fetchShippedOrders(
                LocalDate.now().minusDays(7)
            );

            if (shippedOrders.isEmpty()) {
                log.info("동기화 대상 없음");
                return;
            }

            int syncCount = 0;
            for (ErpOrderDto erpOrder : shippedOrders) {
                try {
                    // SM Module 주문 조회 및 상태 업데이트
                    /*
                    orderRepository.findByOrderNo(erpOrder.getOrderNo())
                        .ifPresent(order -> {
                            if (order.getStatus() == OrderStatus.OUTSOURCE_PO) {
                                order.setStatus(OrderStatus.SHIPPED);
                                orderRepository.save(order);
                            }
                        });
                    */
                    syncCount++;
                } catch (Exception e) {
                    log.error("주문 동기화 실패: orderNo={}", erpOrder.getOrderNo(), e);
                }
            }

            log.info("ERP 주문 상태 동기화 완료: {}/{} 건", syncCount, shippedOrders.size());

        } catch (Exception e) {
            log.error("ERP 동기화 스케줄러 실행 실패", e);
        }
    }
}
```

- [ ] **5.4** `application.yml`에 ERP 연동 설정 추가

```yaml
# application.yml 에 추가
integration:
  erp:
    base-url: ${ERP_BASE_URL:http://erp.internal:8080}
    api-key: ${ERP_API_KEY:}
    timeout: 60
```

- [ ] **5.5** Scheduling 활성화: `SmModuleApplication.java`에 `@EnableScheduling` 추가 확인

```java
@SpringBootApplication
@EnableScheduling
public class SmModuleApplication {
    public static void main(String[] args) {
        SpringApplication.run(SmModuleApplication.class, args);
    }
}
```

---

## Task 6: 세금계산서발행 Frontend (TaxIssuePage.tsx) — 미구현

- [ ] **6.1** `sm-module-web/src/api/tax.api.ts` 생성

```typescript
import { apiClient } from './client';
import type { ApiResponse } from '../types/common';
import type {
  TaxCandidateDto,
  TaxInvoiceDto,
  TaxInvoiceSearchParams,
  TaxInvoiceSummaryDto,
  PageResponse,
} from '../types/tax';

/** 세금계산서 발행 대상 주문 목록 */
export const getTaxCandidates = () =>
  apiClient.get<ApiResponse<TaxCandidateDto[]>>('/api/tax/candidates');

/** 세금계산서 일괄 발행 */
export const issueTaxInvoices = (orderIds: number[]) =>
  apiClient.post<ApiResponse<TaxInvoiceDto[]>>('/api/tax/issue', { orderIds });

/** 세금계산서 발행 목록 조회 */
export const getTaxInvoices = (params: TaxInvoiceSearchParams) =>
  apiClient.get<ApiResponse<PageResponse<TaxInvoiceDto>>>('/api/tax/invoices', { params });

/** 세금계산서 발행 목록 합계 */
export const getTaxInvoiceSummary = (params: TaxInvoiceSearchParams) =>
  apiClient.get<ApiResponse<TaxInvoiceSummaryDto>>('/api/tax/invoices/summary', { params });

/** 세금계산서 발행 목록 엑셀 다운로드용 */
export const getTaxInvoicesForExport = (params: TaxInvoiceSearchParams) =>
  apiClient.get<ApiResponse<TaxInvoiceDto[]>>('/api/tax/invoices/export', { params });
```

- [ ] **6.2** `sm-module-web/src/types/tax.ts` 생성

```typescript
export interface TaxCandidateDto {
  orderId: number;
  branchName: string;
  orderNo: string;
  orderTitle: string;
  companyName: string;
  customerName: string;
  orderAmount: number;
  unpaidAmount: number;
}

export interface TaxInvoiceDto {
  id: number;
  departmentName: string;
  issueDatetime: string;
  issueNo: string;
  bizNo: string;
  companyName: string;
  managerName: string;
  totalAmount: number;
  supplyPrice: number;
  vat: number;
  status: 'ISSUED' | 'CANCELLED';
  douzoneSyncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
}

export interface TaxInvoiceSearchParams {
  departmentId?: number;
  startDate?: string;
  endDate?: string;
  keyword?: string;
  page?: number;
  size?: number;
}

export interface TaxInvoiceSummaryDto {
  totalCount: number;
  totalAmount: number;
  totalSupplyPrice: number;
  totalVat: number;
}
```

- [ ] **6.3** `sm-module-web/src/pages/sales/TaxIssuePage.tsx` 생성

```tsx
import React, { useState, useEffect } from 'react';
import { Button, Table, Checkbox, message, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { getTaxCandidates, issueTaxInvoices } from '../../api/tax.api';
import type { TaxCandidateDto } from '../../types/tax';
import PageLayout from '../../components/layout/PageLayout';

const { Title } = Typography;

const TaxIssuePage: React.FC = () => {
  const [candidates, setCandidates] = useState<TaxCandidateDto[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [loading, setLoading] = useState(false);
  const [issuing, setIssuing] = useState(false);

  // 발행 대상 목록 조회
  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const { data } = await getTaxCandidates();
      if (data.success) {
        setCandidates(data.data);
      }
    } catch (error) {
      message.error('발행 대상 목록 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, []);

  // 세금계산서 일괄 발행
  const handleIssue = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('발행할 주문을 선택해주세요.');
      return;
    }

    setIssuing(true);
    try {
      const orderIds = selectedRowKeys.map((key) => Number(key));
      const { data } = await issueTaxInvoices(orderIds);
      if (data.success) {
        message.success(`${data.data.length}건의 세금계산서가 발행되었습니다.`);
        setSelectedRowKeys([]);
        fetchCandidates(); // 목록 새로고침
      }
    } catch (error) {
      message.error('세금계산서 발행 중 오류가 발생했습니다.');
    } finally {
      setIssuing(false);
    }
  };

  const columns: ColumnsType<TaxCandidateDto> = [
    {
      title: '#',
      dataIndex: 'index',
      width: 50,
      render: (_: unknown, __: TaxCandidateDto, index: number) => index + 1,
    },
    {
      title: '지점명',
      dataIndex: 'branchName',
      width: 100,
    },
    {
      title: '주문번호 / 제목',
      key: 'orderInfo',
      render: (_: unknown, record: TaxCandidateDto) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.orderNo}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{record.orderTitle}</div>
        </div>
      ),
    },
    {
      title: '회사명',
      dataIndex: 'companyName',
      width: 150,
    },
    {
      title: '고객명',
      dataIndex: 'customerName',
      width: 100,
    },
    {
      title: '주문금액',
      dataIndex: 'orderAmount',
      width: 120,
      align: 'right',
      render: (val: number) => val?.toLocaleString() ?? '-',
    },
    {
      title: '미결제금액',
      dataIndex: 'unpaidAmount',
      width: 120,
      align: 'right',
      render: (val: number) => (
        <span style={{ color: val > 0 ? '#ff4d4f' : undefined }}>
          {val?.toLocaleString() ?? '-'}
        </span>
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  };

  return (
    <PageLayout
      title="세금계산서발행"
      breadcrumb={['매출관리', '세금계산서발행']}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button
          type="primary"
          onClick={handleIssue}
          loading={issuing}
          disabled={selectedRowKeys.length === 0}
        >
          세금계산서발행 ({selectedRowKeys.length}건)
        </Button>
      </div>

      <Table
        rowKey="orderId"
        columns={columns}
        dataSource={candidates}
        rowSelection={rowSelection}
        loading={loading}
        pagination={false}
        size="middle"
        bordered
        scroll={{ x: 800 }}
      />
    </PageLayout>
  );
};

export default TaxIssuePage;
```

---

## Task 7: 세금계산서 발행목록 Frontend (TaxIssueListPage.tsx) — 미구현

- [ ] **7.1** `sm-module-web/src/pages/sales/TaxIssueListPage.tsx` 생성

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Select, Input, Button, DatePicker, Space, Tag, Typography, message,
} from 'antd';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import {
  getTaxInvoices,
  getTaxInvoiceSummary,
  getTaxInvoicesForExport,
} from '../../api/tax.api';
import type { TaxInvoiceDto, TaxInvoiceSearchParams, TaxInvoiceSummaryDto } from '../../types/tax';
import PageLayout from '../../components/layout/PageLayout';
// import { exportToExcel } from '../../utils/excel'; // SheetJS 기반 엑셀 유틸

const { RangePicker } = DatePicker;
const { Text } = Typography;

const DEPARTMENT_OPTIONS = [
  { value: '', label: '전체보기' },
  { value: '1', label: '강남파트' },
  { value: '2', label: '여의도파트' },
  { value: '3', label: '서소문파트' },
];

const SYNC_STATUS_COLORS: Record<string, string> = {
  PENDING: 'orange',
  SYNCED: 'green',
  FAILED: 'red',
};

const SYNC_STATUS_LABELS: Record<string, string> = {
  PENDING: '대기',
  SYNCED: '완료',
  FAILED: '실패',
};

const TaxIssueListPage: React.FC = () => {
  // 검색 조건
  const [departmentId, setDepartmentId] = useState<string>('');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([
    dayjs().startOf('month'),
    dayjs(),
  ]);
  const [keyword, setKeyword] = useState('');

  // 데이터
  const [invoices, setInvoices] = useState<TaxInvoiceDto[]>([]);
  const [summary, setSummary] = useState<TaxInvoiceSummaryDto | null>(null);
  const [totalElements, setTotalElements] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  // 검색 파라미터 구성
  const buildSearchParams = useCallback((): TaxInvoiceSearchParams => ({
    departmentId: departmentId ? Number(departmentId) : undefined,
    startDate: dateRange[0]?.format('YYYY-MM-DD'),
    endDate: dateRange[1]?.format('YYYY-MM-DD'),
    keyword: keyword || undefined,
    page,
    size: pageSize,
  }), [departmentId, dateRange, keyword, page, pageSize]);

  // 목록 + 합계 조회
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildSearchParams();
      const [invoiceRes, summaryRes] = await Promise.all([
        getTaxInvoices(params),
        getTaxInvoiceSummary(params),
      ]);

      if (invoiceRes.data.success) {
        setInvoices(invoiceRes.data.data.content);
        setTotalElements(invoiceRes.data.data.totalElements);
      }
      if (summaryRes.data.success) {
        setSummary(summaryRes.data.data);
      }
    } catch (error) {
      message.error('목록 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [buildSearchParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 검색 버튼 클릭
  const handleSearch = () => {
    setPage(0);
    fetchData();
  };

  // 엑셀 다운로드
  const handleExport = async () => {
    try {
      const params = buildSearchParams();
      const { data } = await getTaxInvoicesForExport(params);
      if (data.success) {
        // exportToExcel(data.data, '세금계산서_발행목록');
        message.success('엑셀 다운로드가 시작됩니다.');
      }
    } catch (error) {
      message.error('엑셀 다운로드에 실패했습니다.');
    }
  };

  const columns: ColumnsType<TaxInvoiceDto> = [
    {
      title: '영업부서',
      dataIndex: 'departmentName',
      width: 100,
    },
    {
      title: '발행일시',
      dataIndex: 'issueDatetime',
      width: 150,
      render: (val: string) => val ? dayjs(val).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '발행번호',
      dataIndex: 'issueNo',
      width: 130,
    },
    {
      title: '사업자번호',
      dataIndex: 'bizNo',
      width: 120,
    },
    {
      title: '회사명',
      dataIndex: 'companyName',
      width: 150,
    },
    {
      title: '담당자',
      dataIndex: 'managerName',
      width: 80,
    },
    {
      title: '합계액',
      dataIndex: 'totalAmount',
      width: 120,
      align: 'right',
      render: (val: number) => val?.toLocaleString() ?? '-',
    },
    {
      title: '공급가액',
      dataIndex: 'supplyPrice',
      width: 120,
      align: 'right',
      render: (val: number) => val?.toLocaleString() ?? '-',
    },
    {
      title: '세액',
      dataIndex: 'vat',
      width: 100,
      align: 'right',
      render: (val: number) => val?.toLocaleString() ?? '-',
    },
    {
      title: '상태',
      dataIndex: 'status',
      width: 80,
      align: 'center',
      render: (val: string) => (
        <Tag color={val === 'ISSUED' ? 'blue' : 'default'}>
          {val === 'ISSUED' ? '발행' : '취소'}
        </Tag>
      ),
    },
    {
      title: '연동상태',
      dataIndex: 'douzoneSyncStatus',
      width: 80,
      align: 'center',
      render: (val: string) => (
        <Tag color={SYNC_STATUS_COLORS[val] || 'default'}>
          {SYNC_STATUS_LABELS[val] || val}
        </Tag>
      ),
    },
  ];

  return (
    <PageLayout
      title="세금계산서 발행목록"
      breadcrumb={['매출관리', '세금계산서 발행목록']}
    >
      {/* 검색 영역 */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select
          value={departmentId}
          onChange={setDepartmentId}
          options={DEPARTMENT_OPTIONS}
          style={{ width: 140 }}
          placeholder="부서"
        />
        <RangePicker
          value={dateRange}
          onChange={(dates) =>
            setDateRange(dates as [Dayjs | null, Dayjs | null])
          }
          format="YYYY-MM-DD"
        />
        <Input
          placeholder="회사명, 공급가액, 세액, 담당자명"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 280 }}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
          검색
        </Button>
        <div style={{ flex: 1 }} />
        <Button icon={<DownloadOutlined />} onClick={handleExport}>
          엑셀다운로드
        </Button>
      </div>

      {/* 테이블 */}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={invoices}
        loading={loading}
        size="middle"
        bordered
        scroll={{ x: 1200 }}
        pagination={{
          current: page + 1,
          pageSize,
          total: totalElements,
          showSizeChanger: true,
          showTotal: (total) => `총 ${total}건`,
          onChange: (p, s) => {
            setPage(p - 1);
            setPageSize(s);
          },
        }}
        summary={() =>
          summary ? (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={6} align="center">
                  <Text strong>총합계 ({summary.totalCount}건)</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="right">
                  <Text strong>{summary.totalAmount?.toLocaleString()}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="right">
                  <Text strong>{summary.totalSupplyPrice?.toLocaleString()}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={8} align="right">
                  <Text strong>{summary.totalVat?.toLocaleString()}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={9} colSpan={2} />
              </Table.Summary.Row>
            </Table.Summary>
          ) : null
        }
      />
    </PageLayout>
  );
};

export default TaxIssueListPage;
```

---

## Task 8: 라우팅 + 메뉴

- [ ] **8.1** `sm-module-web/src/routes/index.tsx` 에 라우트 추가

```tsx
// 기존 라우트 설정에 아래 추가

// 매출관리 > 세금계산서
import TaxIssuePage from '../pages/sales/TaxIssuePage';
import TaxIssueListPage from '../pages/sales/TaxIssueListPage';

// routes 배열에 추가:
{
  path: '/sales/tax/issue',
  element: <ProtectedRoute><TaxIssuePage /></ProtectedRoute>,
},
{
  path: '/sales/tax',
  element: <ProtectedRoute><TaxIssueListPage /></ProtectedRoute>,
},
```

- [ ] **8.2** `sm-module-web/src/components/layout/AppSidebar.tsx` (또는 `AppHeader.tsx`) 메뉴 항목 추가

```tsx
// 매출관리 서브메뉴에 아래 항목 추가:
{
  key: '/sales/tax/issue',
  label: '세금계산서발행',
},
{
  key: '/sales/tax',
  label: '세금계산서 발행목록',
},
```

- [ ] **8.3** Security 설정에서 웹훅 엔드포인트 인증 예외 처리 확인

```java
// SecurityConfig.java 에서 깃고 웹훅은 인증 불필요 (API Key 검증은 별도)
.requestMatchers("/api/webhooks/**").permitAll()
```

- [ ] **8.4** 통합 테스트: 세금계산서 발행 → 더존 연동 → 재시도 큐 → 목록 조회 E2E 확인

---

## 완료 기준

| 항목 | 검증 방법 |
|------|-----------|
| tax_invoices 테이블 생성 | Flyway V6 마이그레이션 성공 |
| integration_retry_queue 테이블 생성 | Flyway V6 마이그레이션 성공 |
| 세금계산서 발행 API | POST /api/tax/issue 호출 → TaxInvoice 저장 + 더존 API 호출 |
| 더존 연동 재시도 | 더존 실패 시 retry_queue 등록, 1분 후 자동 재시도 (최대 3회) |
| 깃고 웹훅 수신 | POST /api/webhooks/gitgo/approval-callback 정상 처리 |
| ERP 동기화 | @Scheduled 10분 간격 실행 + 주문 상태 SHIPPED 업데이트 |
| TaxIssuePage | 체크박스 선택 + 발행 버튼 동작 |
| TaxIssueListPage | 검색 + 페이징 + 합계행 + 엑셀 다운로드 |
| 라우팅 | /sales/tax/issue, /sales/tax 접근 가능 |
