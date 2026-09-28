# Phase 2: 정보관리 구현 계획서

> **Updated:** 2026-04-07 — 실제 구현 상태, 신규 요구사항, Oracle 연동 확정 내용 반영
>
> **주요 변경 이력 (2026-03-26 ~ 2026-04-06):**
> - 사업자/고객 관리: CRUD → ERP Oracle 직접 조회 전용으로 변경
> - part_goals + am_goals → goal_mst 단일 테이블 (복합PK) 통합
> - business_owners: douzone_code/department_id FK 삭제, company_cd/partner_cd/dept_cd 추가, biz_type/biz_item VARCHAR(500)으로 변경
> - 공장셀렉트박스 추가 (1000:TPS, 2000:GRP, 3000:PM)
> - 고객관리 화면: 아직 미구현
>
> **Oracle 연동 확정 (2026-04-07):**
> - 사업자관리: `CI_PARTNER_MST` Oracle 직접 조회 (ErpPartnerRepository), USE_YN='Y' 필터
>   - 공장필터: DISCH_CD 컬럼 WHERE 조건 추가 필요 (현재 미반영)
>   - 매핑: PARTNER_CD→partnerCd, PARTNER_NM→companyName, BIZR_NO→bizNo, CEO_NM→representativeName
>   - 자동완성: BIZTP_NM(업태), BIZC_NM(종목) DISTINCT 조회
>   - MySQL 캐시: ErpMasterSyncService.syncPartners() (현재 비활성, 직접 조회 전환)
> - 고객관리: `CI_PARTNER_MST` 동일 테이블 (고객=거래처), ErpPartnerRepository 재사용
>   - 고객명: CEO_NM 또는 별도 고객 테이블 여부 확인 필요
> - 사원조회: `HR_EMP_MST` (ErpEmployeeRepository), COMPANY_CD='1000', HLOF_FG_CD='1'
> - 부서조회: `VW_MA_DEPT_MST` (ErpDepartmentRepository), COMPANY_CD='1000'
> - 품목조회: `CI_ITEM` (ErpItemRepository), USE_YN='Y'
> - API: GET /api/lookup/partners, /employees, /departments, /items
>
> **코드 분석 결과 (2026-04-07):**
> - 사업자관리: FE/BE 완성. **수정필요:** 공장셀렉트박스 UI 존재하나 Oracle DISCH_CD 미연동 → MA_PARTNERSA_INFO JOIN 추가 필요 (Small)
> - 고객관리: FE/BE 완성 (BizOwnerService 재사용). 동일하게 DISCH_CD 필터 필요 (Small)
> - 목표입력: FE/BE 완성 → **완료**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans

**Goal:** 사업자/고객 ERP 조회전용 + 목표 입력 CRUD 구현
**Architecture:** info 도메인 패키지. ERP Oracle 직접 조회 + MySQL 목표관리. Repository → Service → Controller.
**Tech Stack:** Spring Boot 3.x, JPA, QueryDSL, Oracle JDBC | React 18, Ant Design, TanStack Table
**Spec:** `docs/superpowers/specs/2026-03-18-sm-module-design.md` Section 4.2, 4.7, 5.3, 6.4

---

## Task 1: DB 스키마 - 정보관리 테이블

> ~~Flyway V2 마이그레이션~~ → V1 통합 스키마로 변경됨.
> business_owners (MySQL, ERP 캐시), goal_mst (MySQL, 복합PK) 테이블.
> customers는 ERP Oracle 직접 조회로 별도 MySQL 테이블 불필요.

### Steps

- [x] **1.1** `business_owners` 테이블 (ERP 데이터 캐시/조회용)

```sql
-- -----------------------------------------------------------
-- business_owners (사업자) - ERP Oracle에서 조회, READ-ONLY
-- 변경: douzone_code/department_id FK 삭제
-- 추가: company_cd, partner_cd, dept_cd (공장코드)
-- 변경: biz_type/biz_item VARCHAR(500)
-- -----------------------------------------------------------
CREATE TABLE business_owners (
    id                      BIGINT          AUTO_INCREMENT PRIMARY KEY,
    company_cd              INT             NULL            COMMENT '회사코드',
    partner_cd              VARCHAR(20)     NULL            COMMENT '거래처코드 (ERP)',
    company_name            VARCHAR(100)    NOT NULL        COMMENT '회사명',
    biz_no                  VARCHAR(20)     NULL            COMMENT '사업자번호',
    biz_type                VARCHAR(500)    NULL            COMMENT '업태',
    biz_item                VARCHAR(500)    NULL            COMMENT '종목',
    address                 VARCHAR(255)    NULL            COMMENT '주소',
    representative_name     VARCHAR(50)     NULL            COMMENT '대표자명',
    representative_email    VARCHAR(100)    NULL            COMMENT '대표자 이메일',
    representative_phone    VARCHAR(20)     NULL            COMMENT '대표자 연락처',
    dept_cd                 INT             NULL            COMMENT '공장코드 (1000:TPS, 2000:GRP, 3000:PM)',
    -- Audit (BaseEntity)
    created_at              DATETIME        NOT NULL,
    updated_at              DATETIME        NOT NULL,
    created_id              VARCHAR(20)     NULL,
    updated_id              VARCHAR(20)     NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_biz_owners_company_name ON business_owners (company_name);
CREATE INDEX idx_biz_owners_dept_cd      ON business_owners (dept_cd);

-- -----------------------------------------------------------
-- customers (고객) - ERP Oracle 직접 조회, MySQL 테이블 불필요
-- ErpLookupController / ErpPartnerRepository 통해 Oracle 조회
-- -----------------------------------------------------------
-- ※ customers MySQL 테이블 삭제됨. ERP Oracle 직접 조회로 변경.

-- -----------------------------------------------------------
-- goal_mst (목표관리) - part_goals + am_goals 통합
-- 복합PK: company_cd + plant_cd + plan_yy + plan_mm + dept_cd + sales_emp_id + field_cd
-- -----------------------------------------------------------
CREATE TABLE goal_mst (
    company_cd              INT             NOT NULL        COMMENT '회사코드',
    plant_cd                INT             NOT NULL        COMMENT '공장코드',
    plan_yy                 VARCHAR(4)      NOT NULL        COMMENT '계획연도',
    plan_mm                 VARCHAR(2)      NOT NULL        COMMENT '계획월',
    dept_cd                 VARCHAR(10)     NOT NULL        COMMENT '부서코드',
    sales_emp_id            VARCHAR(20)     NOT NULL        COMMENT '영업담당자ID',
    field_cd                VARCHAR(10)     NOT NULL        COMMENT '필드구분코드',
    goal_amt                BIGINT          NULL            COMMENT '목표금액',
    actual_amt              BIGINT          NULL            COMMENT '실적금액',
    note                    VARCHAR(500)    NULL            COMMENT '비고',
    -- Audit (BaseEntity)
    created_at              DATETIME        NOT NULL,
    updated_at              DATETIME        NOT NULL,
    created_id              VARCHAR(20)     NULL,
    updated_id              VARCHAR(20)     NULL,

    PRIMARY KEY (company_cd, plant_cd, plan_yy, plan_mm, dept_cd, sales_emp_id, field_cd)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [x] **1.2** ~~Flyway V2 마이그레이션~~ → V1 통합 스키마로 변경됨
- [x] **1.3** 테이블 확인: `SHOW CREATE TABLE business_owners; SHOW CREATE TABLE goal_mst;`

### Acceptance Criteria
- business_owners 테이블: company_cd, partner_cd, dept_cd 컬럼 존재 (douzone_code, department_id FK 삭제됨)
- ~~customers 테이블~~ → ERP Oracle 직접 조회로 대체
- ~~part_goals, am_goals~~ → goal_mst 단일 테이블로 통합 (7컬럼 복합PK)
- goal_mst에 goal_amt, actual_amt, note 컬럼 존재
- Audit 컬럼: created_at, updated_at, created_id(VARCHAR(20)), updated_id(VARCHAR(20))

---

## Task 2: 사업자 Backend (BusinessOwner)

> ~~CRUD + soft delete~~ → ERP Oracle 조회전용. Entity (MySQL 캐시), ErpPartnerRepository (Oracle 직접 조회), Service, Controller.
> 사업자 데이터는 ERP에서 등록 후 SM모듈에서 조회만 수행.

### Steps

- [ ] **2.1** Create directory structure

```bash
mkdir -p sm-module-api/src/main/java/com/tara/sm/info/entity
mkdir -p sm-module-api/src/main/java/com/tara/sm/info/repository
mkdir -p sm-module-api/src/main/java/com/tara/sm/info/dto
mkdir -p sm-module-api/src/main/java/com/tara/sm/info/mapper
mkdir -p sm-module-api/src/main/java/com/tara/sm/info/service
mkdir -p sm-module-api/src/main/java/com/tara/sm/info/controller
```

- [ ] **2.2** Create entity `sm-module-api/src/main/java/com/tara/sm/info/entity/BusinessOwner.java`

```java
package com.tara.sm.info.entity;

import com.tara.sm.common.audit.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "business_owners")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
public class BusinessOwner extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "company_cd")
    private Integer companyCd;           // 회사코드

    @Column(name = "partner_cd", length = 20)
    private String partnerCd;            // 거래처코드 (ERP)

    @Column(name = "company_name", nullable = false, length = 100)
    private String companyName;

    @Column(name = "biz_no", length = 20)
    private String bizNo;

    @Column(name = "biz_type", length = 500)  // 변경: 50→500
    private String bizType;

    @Column(name = "biz_item", length = 500)  // 변경: 50→500
    private String bizItem;

    @Column(length = 255)
    private String address;

    // 삭제됨: douzoneCode

    @Column(name = "representative_name", length = 50)
    private String representativeName;

    @Column(name = "representative_email", length = 100)
    private String representativeEmail;

    @Column(name = "representative_phone", length = 20)
    private String representativePhone;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id")
    private Department department;
}
```

- [ ] **2.3** Create DTOs `sm-module-api/src/main/java/com/tara/sm/info/dto/BizOwnerDto.java`

```java
package com.tara.sm.info.dto;

import lombok.*;
import java.time.LocalDateTime;

public class BizOwnerDto {

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class ListItem {
        private Long id;
        private String companyName;
        private String bizNo;
        private String bizType;
        private String bizItem;
        private String address;
        private String douzoneCode;
        private String departmentName;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Detail {
        private Long id;
        private Integer companyCd;          // 회사코드
        private String partnerCd;            // 거래처코드
        private String companyName;
        private String bizNo;
        private String bizType;              // VARCHAR(500)
        private String bizItem;              // VARCHAR(500)
        private String address;
        // 삭제: douzoneCode
        private String representativeName;
        private String representativeEmail;
        private String representativePhone;
        private Integer deptCd;              // 공장코드 (1000:TPS, 2000:GRP, 3000:PM)
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
    }

    // 삭제: CreateRequest - ERP에서 등록, SM모듈은 조회전용
    // 삭제: UpdateRequest - ERP에서 수정, SM모듈은 조회전용

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class SearchCondition {
        private Integer plantCd;            // 공장코드 필터 (기존 departmentId → plantCd)
        private String keyword;             // 회사명/사업자번호 검색
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class UpdateRequest {
        private String companyName;
        private String bizNo;
        private String bizType;
        private String bizItem;
        private String address;
        private String douzoneCode;
        private String representativeName;
        private String representativeEmail;
        private String representativePhone;
        private Long departmentId;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class SearchCondition {
        private Long departmentId;
        private String keyword;
        private int page;
        private int size;
    }
}
```

- [ ] **2.4** Create MapStruct mapper `sm-module-api/src/main/java/com/tara/sm/info/mapper/BizOwnerMapper.java`

```java
package com.tara.sm.info.mapper;

import com.tara.sm.info.dto.BizOwnerDto;
import com.tara.sm.info.entity.BusinessOwner;
import org.mapstruct.*;

@Mapper(componentModel = "spring")
public interface BizOwnerMapper {

    @Mapping(target = "departmentName", source = "department.name")
    BizOwnerDto.Detail toDetail(BusinessOwner entity);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "department", ignore = true)  // set in service
    BusinessOwner toEntity(BizOwnerDto.CreateRequest dto);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "department", ignore = true)
    @BeanMapping(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
    void updateEntity(BizOwnerDto.UpdateRequest dto, @MappingTarget BusinessOwner entity);
}
```

- [ ] **2.5** Create JPA repository `sm-module-api/src/main/java/com/tara/sm/info/repository/BusinessOwnerRepository.java`

```java
package com.tara.sm.info.repository;

import com.tara.sm.info.entity.BusinessOwner;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BusinessOwnerRepository extends JpaRepository<BusinessOwner, Long> {
    Optional<BusinessOwner> findByIdAndDeletedFalse(Long id);
    boolean existsByBizNoAndDeletedFalse(String bizNo);
}
```

- [ ] **2.6** Create QueryDSL repository `sm-module-api/src/main/java/com/tara/sm/info/repository/BizOwnerQueryRepository.java`

```java
package com.tara.sm.info.repository;

import com.querydsl.core.BooleanBuilder;
import com.querydsl.core.types.Projections;
import com.querydsl.jpa.impl.JPAQueryFactory;
import com.tara.sm.info.dto.BizOwnerDto;
import com.tara.sm.info.entity.QBusinessOwner;
import com.tara.sm.auth.entity.QDepartment;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import java.util.List;

@Repository
@RequiredArgsConstructor
public class BizOwnerQueryRepository {

    private final JPAQueryFactory queryFactory;

    public Page<BizOwnerDto.ListItem> search(BizOwnerDto.SearchCondition cond, Pageable pageable) {
        QBusinessOwner biz  = QBusinessOwner.businessOwner;
        QDepartment dept    = QDepartment.department;

        BooleanBuilder where = new BooleanBuilder();
        where.and(biz.deleted.isFalse());

        if (cond.getDepartmentId() != null) {
            where.and(biz.department.id.eq(cond.getDepartmentId()));
        }
        if (StringUtils.hasText(cond.getKeyword())) {
            String kw = "%" + cond.getKeyword() + "%";
            where.and(
                biz.companyName.like(kw)
                    .or(biz.bizNo.like(kw))
                    .or(biz.bizType.like(kw))
                    .or(biz.bizItem.like(kw))
            );
        }

        List<BizOwnerDto.ListItem> content = queryFactory
            .select(Projections.bean(BizOwnerDto.ListItem.class,
                biz.id,
                biz.companyName,
                biz.bizNo,
                biz.bizType,
                biz.bizItem,
                biz.address,
                biz.douzoneCode,
                dept.name.as("departmentName")
            ))
            .from(biz)
            .leftJoin(biz.department, dept)
            .where(where)
            .orderBy(biz.companyName.asc())
            .offset(pageable.getOffset())
            .limit(pageable.getPageSize())
            .fetch();

        long total = queryFactory
            .select(biz.count())
            .from(biz)
            .where(where)
            .fetchOne();

        return new PageImpl<>(content, pageable, total);
    }
}
```

- [ ] **2.7** Create service `sm-module-api/src/main/java/com/tara/sm/info/service/BizOwnerService.java`

```java
package com.tara.sm.info.service;

import com.tara.sm.auth.repository.DepartmentRepository;
import com.tara.sm.common.exception.BusinessException;
import com.tara.sm.common.exception.DuplicateResourceException;
import com.tara.sm.info.dto.BizOwnerDto;
import com.tara.sm.info.entity.BusinessOwner;
import com.tara.sm.info.mapper.BizOwnerMapper;
import com.tara.sm.info.repository.BizOwnerQueryRepository;
import com.tara.sm.info.repository.BusinessOwnerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BizOwnerService {

    private final BusinessOwnerRepository bizOwnerRepository;
    private final BizOwnerQueryRepository bizOwnerQueryRepository;
    private final DepartmentRepository departmentRepository;
    private final BizOwnerMapper bizOwnerMapper;

    /** 사업자 목록 (QueryDSL 동적 검색) */
    public Page<BizOwnerDto.ListItem> list(BizOwnerDto.SearchCondition cond) {
        Pageable pageable = PageRequest.of(cond.getPage(), cond.getSize());
        return bizOwnerQueryRepository.search(cond, pageable);
    }

    /** 사업자 상세 */
    public BizOwnerDto.Detail getDetail(Long id) {
        BusinessOwner entity = findByIdOrThrow(id);
        return bizOwnerMapper.toDetail(entity);
    }

    /** 사업자 등록 */
    @Transactional
    public BizOwnerDto.Detail create(BizOwnerDto.CreateRequest request) {
        // 사업자번호 중복 체크
        if (StringUtils.hasText(request.getBizNo())
                && bizOwnerRepository.existsByBizNoAndDeletedFalse(request.getBizNo())) {
            throw new DuplicateResourceException("이미 등록된 사업자번호입니다: " + request.getBizNo());
        }

        BusinessOwner entity = bizOwnerMapper.toEntity(request);

        if (request.getDepartmentId() != null) {
            entity.setDepartment(
                departmentRepository.getReferenceById(request.getDepartmentId()));
        }

        bizOwnerRepository.save(entity);
        return bizOwnerMapper.toDetail(entity);
    }

    /** 사업자 수정 */
    @Transactional
    public BizOwnerDto.Detail update(Long id, BizOwnerDto.UpdateRequest request) {
        BusinessOwner entity = findByIdOrThrow(id);

        // 사업자번호 변경 시 중복 체크
        if (StringUtils.hasText(request.getBizNo())
                && !request.getBizNo().equals(entity.getBizNo())
                && bizOwnerRepository.existsByBizNoAndDeletedFalse(request.getBizNo())) {
            throw new DuplicateResourceException("이미 등록된 사업자번호입니다: " + request.getBizNo());
        }

        bizOwnerMapper.updateEntity(request, entity);

        if (request.getDepartmentId() != null) {
            entity.setDepartment(
                departmentRepository.getReferenceById(request.getDepartmentId()));
        }

        return bizOwnerMapper.toDetail(entity);
    }

    /** 소프트 삭제 (연결된 주문 없을 때만 - spec 12.3) */
    @Transactional
    public void delete(Long id, Long deletedByUserId) {
        BusinessOwner entity = findByIdOrThrow(id);
        // TODO: 연결된 주문 존재 시 삭제 불가 검증 (Phase 3 이후 order 구현 시 추가)
        entity.softDelete(deletedByUserId);
    }

    private BusinessOwner findByIdOrThrow(Long id) {
        return bizOwnerRepository.findByIdAndDeletedFalse(id)
            .orElseThrow(() -> new BusinessException("BIZ_OWNER_NOT_FOUND",
                "사업자를 찾을 수 없습니다. id=" + id));
    }
}
```

- [ ] **2.8** Create controller `sm-module-api/src/main/java/com/tara/sm/info/controller/BizOwnerController.java`

```java
package com.tara.sm.info.controller;

import com.tara.sm.common.dto.ApiResponse;
import com.tara.sm.info.dto.BizOwnerDto;
import com.tara.sm.info.service.BizOwnerService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;

@Tag(name = "Info - 사업자관리", description = "사업자 CRUD API")
@RestController
@RequestMapping("/api/info/biz-owners")
@RequiredArgsConstructor
public class BizOwnerController {

    private final BizOwnerService bizOwnerService;

    @Operation(summary = "사업자 목록 조회")
    @GetMapping
    public ApiResponse<Page<BizOwnerDto.ListItem>> list(
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        BizOwnerDto.SearchCondition cond = BizOwnerDto.SearchCondition.builder()
                .departmentId(departmentId).keyword(keyword)
                .page(page).size(size).build();
        return ApiResponse.success(bizOwnerService.list(cond));
    }

    @Operation(summary = "사업자 상세 조회")
    @GetMapping("/{id}")
    public ApiResponse<BizOwnerDto.Detail> detail(@PathVariable Long id) {
        return ApiResponse.success(bizOwnerService.getDetail(id));
    }

    @Operation(summary = "사업자 등록")
    @PostMapping
    public ApiResponse<BizOwnerDto.Detail> create(@RequestBody BizOwnerDto.CreateRequest request) {
        return ApiResponse.success(bizOwnerService.create(request));
    }

    @Operation(summary = "사업자 수정")
    @PutMapping("/{id}")
    public ApiResponse<BizOwnerDto.Detail> update(
            @PathVariable Long id,
            @RequestBody BizOwnerDto.UpdateRequest request) {
        return ApiResponse.success(bizOwnerService.update(id, request));
    }
}
```

- [ ] **2.9** Build verify: `./gradlew compileJava`

### Acceptance Criteria
- BusinessOwner entity maps to business_owners table with all columns including representative_* fields
- MapStruct mapper auto-generates Detail/Entity conversion
- QueryDSL search supports departmentId filter + keyword (회사명, 사업자번호, 업태, 종목) per spec 6.4
- CRUD service with soft delete and biz_no duplicate validation
- REST endpoints: GET/POST/PUT on `/api/info/biz-owners`

---

## Task 3: 고객 Backend (Customer)

> Entity, Repository (QueryDSL), DTO, MapStruct Mapper, Service (CRUD + autocomplete), Controller.

### Steps

- [ ] **3.1** Create entity `sm-module-api/src/main/java/com/tara/sm/info/entity/Customer.java`

```java
package com.tara.sm.info.entity;

import com.tara.sm.common.audit.BaseEntity;
import com.tara.sm.auth.entity.User;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "customers")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
public class Customer extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "customer_type", length = 20)
    private String customerType;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "business_owner_id")
    private BusinessOwner businessOwner;

    @Column(nullable = false, length = 50)
    private String name;

    @Column(length = 50)
    private String branch;

    @Column(length = 20)
    private String phone;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "registered_by")
    private User registeredBy;
}
```

- [ ] **3.2** Create DTOs `sm-module-api/src/main/java/com/tara/sm/info/dto/CustomerDto.java`

```java
package com.tara.sm.info.dto;

import lombok.*;
import java.time.LocalDateTime;

public class CustomerDto {

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class ListItem {
        private Long id;
        private String customerType;
        private String businessOwnerName; // 회사명
        private String bizNo;             // 사업자번호
        private String name;              // 고객명
        private String branch;
        private String phone;
        private String registeredByName;  // 등록자명
        private LocalDateTime createdAt;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Detail {
        private Long id;
        private String customerType;
        private Long businessOwnerId;
        private String businessOwnerName;
        private String name;
        private String branch;
        private String phone;
        private Long registeredById;
        private String registeredByName;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class CreateRequest {
        private String customerType;
        private Long businessOwnerId;
        private String name;
        private String branch;
        private String phone;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class UpdateRequest {
        private String customerType;
        private Long businessOwnerId;
        private String name;
        private String branch;
        private String phone;
    }

    /** 자동완성 검색 결과용 경량 DTO */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class AutocompleteItem {
        private Long id;
        private String name;
        private String businessOwnerName;
        private String phone;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class SearchCondition {
        private Long departmentId;
        private String keyword;
        private int page;
        private int size;
    }
}
```

- [ ] **3.3** Create MapStruct mapper `sm-module-api/src/main/java/com/tara/sm/info/mapper/CustomerMapper.java`

```java
package com.tara.sm.info.mapper;

import com.tara.sm.info.dto.CustomerDto;
import com.tara.sm.info.entity.Customer;
import org.mapstruct.*;

@Mapper(componentModel = "spring")
public interface CustomerMapper {

    @Mapping(target = "businessOwnerId", source = "businessOwner.id")
    @Mapping(target = "businessOwnerName", source = "businessOwner.companyName")
    @Mapping(target = "registeredById", source = "registeredBy.id")
    @Mapping(target = "registeredByName", source = "registeredBy.name")
    CustomerDto.Detail toDetail(Customer entity);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "businessOwner", ignore = true)
    @Mapping(target = "registeredBy", ignore = true)
    Customer toEntity(CustomerDto.CreateRequest dto);
}
```

- [ ] **3.4** Create repositories

`sm-module-api/src/main/java/com/tara/sm/info/repository/CustomerRepository.java`:

```java
package com.tara.sm.info.repository;

import com.tara.sm.info.entity.Customer;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CustomerRepository extends JpaRepository<Customer, Long> {
    Optional<Customer> findByIdAndDeletedFalse(Long id);
}
```

`sm-module-api/src/main/java/com/tara/sm/info/repository/CustomerQueryRepository.java`:

```java
package com.tara.sm.info.repository;

import com.querydsl.core.BooleanBuilder;
import com.querydsl.core.types.Projections;
import com.querydsl.jpa.impl.JPAQueryFactory;
import com.tara.sm.info.dto.CustomerDto;
import com.tara.sm.info.entity.QCustomer;
import com.tara.sm.info.entity.QBusinessOwner;
import com.tara.sm.auth.entity.QUser;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import java.util.List;

@Repository
@RequiredArgsConstructor
public class CustomerQueryRepository {

    private final JPAQueryFactory queryFactory;

    /** 고객 목록 검색: 파트필터(사업자의 department_id) + 키워드(고객명, 회사명) */
    public Page<CustomerDto.ListItem> search(CustomerDto.SearchCondition cond, Pageable pageable) {
        QCustomer c      = QCustomer.customer;
        QBusinessOwner b = QBusinessOwner.businessOwner;
        QUser u          = new QUser("registeredByUser");

        BooleanBuilder where = new BooleanBuilder();
        where.and(c.deleted.isFalse());

        if (cond.getDepartmentId() != null) {
            where.and(b.department.id.eq(cond.getDepartmentId()));
        }
        if (StringUtils.hasText(cond.getKeyword())) {
            String kw = "%" + cond.getKeyword() + "%";
            where.and(c.name.like(kw).or(b.companyName.like(kw)));
        }

        List<CustomerDto.ListItem> content = queryFactory
            .select(Projections.bean(CustomerDto.ListItem.class,
                c.id, c.customerType,
                b.companyName.as("businessOwnerName"),
                b.bizNo,
                c.name, c.branch, c.phone,
                u.name.as("registeredByName"),
                c.createdAt
            ))
            .from(c)
            .leftJoin(c.businessOwner, b)
            .leftJoin(c.registeredBy, u)
            .where(where)
            .orderBy(c.name.asc())
            .offset(pageable.getOffset())
            .limit(pageable.getPageSize())
            .fetch();

        long total = queryFactory
            .select(c.count())
            .from(c)
            .leftJoin(c.businessOwner, b)
            .where(where)
            .fetchOne();

        return new PageImpl<>(content, pageable, total);
    }

    /** 자동완성 검색: 최소 2자, 상위 20건 반환 */
    public List<CustomerDto.AutocompleteItem> autocomplete(String keyword) {
        QCustomer c      = QCustomer.customer;
        QBusinessOwner b = QBusinessOwner.businessOwner;

        String kw = "%" + keyword + "%";

        return queryFactory
            .select(Projections.bean(CustomerDto.AutocompleteItem.class,
                c.id, c.name,
                b.companyName.as("businessOwnerName"),
                c.phone
            ))
            .from(c)
            .leftJoin(c.businessOwner, b)
            .where(c.deleted.isFalse()
                .and(c.name.like(kw).or(b.companyName.like(kw))))
            .orderBy(c.name.asc())
            .limit(20)
            .fetch();
    }
}
```

- [ ] **3.5** Create service `sm-module-api/src/main/java/com/tara/sm/info/service/CustomerService.java`

```java
package com.tara.sm.info.service;

import com.tara.sm.common.exception.BusinessException;
import com.tara.sm.info.dto.CustomerDto;
import com.tara.sm.info.entity.Customer;
import com.tara.sm.info.mapper.CustomerMapper;
import com.tara.sm.info.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CustomerService {

    private final CustomerRepository customerRepository;
    private final CustomerQueryRepository customerQueryRepository;
    private final BusinessOwnerRepository bizOwnerRepository;
    private final CustomerMapper customerMapper;

    public Page<CustomerDto.ListItem> list(CustomerDto.SearchCondition cond) {
        return customerQueryRepository.search(cond,
            PageRequest.of(cond.getPage(), cond.getSize()));
    }

    public CustomerDto.Detail getDetail(Long id) {
        return customerMapper.toDetail(findByIdOrThrow(id));
    }

    @Transactional
    public CustomerDto.Detail create(CustomerDto.CreateRequest request, Long currentUserId) {
        Customer entity = customerMapper.toEntity(request);

        if (request.getBusinessOwnerId() != null) {
            entity.setBusinessOwner(
                bizOwnerRepository.getReferenceById(request.getBusinessOwnerId()));
        }
        // registeredBy = 현재 로그인 사용자 (AuditorAware의 createdBy와 별도 - 명시적 등록자)
        // entity.setRegisteredBy(userRepository.getReferenceById(currentUserId));

        customerRepository.save(entity);
        return customerMapper.toDetail(entity);
    }

    @Transactional
    public CustomerDto.Detail update(Long id, CustomerDto.UpdateRequest request) {
        Customer entity = findByIdOrThrow(id);
        entity.setCustomerType(request.getCustomerType());
        entity.setName(request.getName());
        entity.setBranch(request.getBranch());
        entity.setPhone(request.getPhone());

        if (request.getBusinessOwnerId() != null) {
            entity.setBusinessOwner(
                bizOwnerRepository.getReferenceById(request.getBusinessOwnerId()));
        }

        return customerMapper.toDetail(entity);
    }

    /** 자동완성 검색 - 최소 2자 이상 (spec 5.3) */
    public List<CustomerDto.AutocompleteItem> autocomplete(String keyword) {
        if (keyword == null || keyword.length() < 2) {
            return List.of();
        }
        return customerQueryRepository.autocomplete(keyword);
    }

    @Transactional
    public void delete(Long id, Long deletedByUserId) {
        Customer entity = findByIdOrThrow(id);
        entity.softDelete(deletedByUserId);
    }

    private Customer findByIdOrThrow(Long id) {
        return customerRepository.findByIdAndDeletedFalse(id)
            .orElseThrow(() -> new BusinessException("CUSTOMER_NOT_FOUND",
                "고객을 찾을 수 없습니다. id=" + id));
    }
}
```

- [ ] **3.6** Create controller `sm-module-api/src/main/java/com/tara/sm/info/controller/CustomerController.java`

```java
package com.tara.sm.info.controller;

import com.tara.sm.common.dto.ApiResponse;
import com.tara.sm.info.dto.CustomerDto;
import com.tara.sm.info.service.CustomerService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Info - 고객관리", description = "고객 CRUD + 자동완성 API")
@RestController
@RequestMapping("/api/info/customers")
@RequiredArgsConstructor
public class CustomerController {

    private final CustomerService customerService;

    @Operation(summary = "고객 목록 조회")
    @GetMapping
    public ApiResponse<Page<CustomerDto.ListItem>> list(
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        CustomerDto.SearchCondition cond = CustomerDto.SearchCondition.builder()
                .departmentId(departmentId).keyword(keyword)
                .page(page).size(size).build();
        return ApiResponse.success(customerService.list(cond));
    }

    @Operation(summary = "고객 상세 조회")
    @GetMapping("/{id}")
    public ApiResponse<CustomerDto.Detail> detail(@PathVariable Long id) {
        return ApiResponse.success(customerService.getDetail(id));
    }

    @Operation(summary = "고객 등록")
    @PostMapping
    public ApiResponse<CustomerDto.Detail> create(@RequestBody CustomerDto.CreateRequest request) {
        // TODO: Extract currentUserId from SecurityContext
        return ApiResponse.success(customerService.create(request, null));
    }

    @Operation(summary = "고객 수정")
    @PutMapping("/{id}")
    public ApiResponse<CustomerDto.Detail> update(
            @PathVariable Long id,
            @RequestBody CustomerDto.UpdateRequest request) {
        return ApiResponse.success(customerService.update(id, request));
    }

    @Operation(summary = "고객 자동완성 검색 (최소 2자)")
    @GetMapping("/search")
    public ApiResponse<List<CustomerDto.AutocompleteItem>> search(
            @RequestParam String keyword) {
        return ApiResponse.success(customerService.autocomplete(keyword));
    }
}
```

### Acceptance Criteria
- Customer entity with FK to business_owners and users
- QueryDSL search supports departmentId (via business_owner's dept) + keyword (고객명, 회사명) per spec 6.4
- Autocomplete endpoint returns max 20 results, enforces min 2 chars per spec 5.3
- MapStruct mapper handles nested entity-to-DTO (businessOwner.companyName -> businessOwnerName)
- CRUD + soft delete

---

## Task 4: 목표관리 Backend (PartGoal, AmGoal)

> PartGoal, AmGoal entities + repos + GoalService (get/save by year,month) + Controller.
> 목표는 upsert 패턴: 없으면 insert, 있으면 update. 삭제 없음 (덮어쓰기 패턴).

### Steps

- [ ] **4.1** Create entities

`sm-module-api/src/main/java/com/tara/sm/info/entity/PartGoal.java`:

```java
package com.tara.sm.info.entity;

import com.tara.sm.auth.entity.Department;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "part_goals",
    uniqueConstraints = @UniqueConstraint(columnNames = {"department_id", "year", "month"}))
@EntityListeners(AuditingEntityListener.class)
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
public class PartGoal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id", nullable = false)
    private Department department;

    @Column(nullable = false)
    private Integer year;

    @Column(nullable = false)
    private Integer month;

    @Column(name = "target_amount")
    @Builder.Default
    private Long targetAmount = 0L;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
```

`sm-module-api/src/main/java/com/tara/sm/info/entity/AmGoal.java`:

```java
package com.tara.sm.info.entity;

import com.tara.sm.auth.entity.User;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "am_goals",
    uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "year", "month"}))
@EntityListeners(AuditingEntityListener.class)
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
public class AmGoal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private Integer year;

    @Column(nullable = false)
    private Integer month;

    @Column(name = "target_amount")
    @Builder.Default
    private Long targetAmount = 0L;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
```

- [ ] **4.2** Create repositories

`sm-module-api/src/main/java/com/tara/sm/info/repository/PartGoalRepository.java`:

```java
package com.tara.sm.info.repository;

import com.tara.sm.info.entity.PartGoal;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PartGoalRepository extends JpaRepository<PartGoal, Long> {
    List<PartGoal> findByYearAndMonth(Integer year, Integer month);
    Optional<PartGoal> findByDepartmentIdAndYearAndMonth(Long deptId, Integer year, Integer month);
}
```

`sm-module-api/src/main/java/com/tara/sm/info/repository/AmGoalRepository.java`:

```java
package com.tara.sm.info.repository;

import com.tara.sm.info.entity.AmGoal;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AmGoalRepository extends JpaRepository<AmGoal, Long> {
    List<AmGoal> findByYearAndMonth(Integer year, Integer month);
    Optional<AmGoal> findByUserIdAndYearAndMonth(Long userId, Integer year, Integer month);
}
```

- [ ] **4.3** Create DTOs `sm-module-api/src/main/java/com/tara/sm/info/dto/GoalDto.java`

```java
package com.tara.sm.info.dto;

import lombok.*;
import java.util.List;

public class GoalDto {

    /** 파트 목표 1행 */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class PartGoalItem {
        private Long departmentId;
        private String departmentName;
        private Long targetAmount;
    }

    /** AM 목표 1행 */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class AmGoalItem {
        private Long userId;
        private String userName;
        private String departmentName;
        private Long targetAmount;
    }

    /** 목표 일괄 저장 요청 */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class SavePartGoalsRequest {
        private Integer year;
        private Integer month;
        private List<PartGoalItem> goals;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class SaveAmGoalsRequest {
        private Integer year;
        private Integer month;
        private List<AmGoalItem> goals;
    }
}
```

- [ ] **4.4** Create service `sm-module-api/src/main/java/com/tara/sm/info/service/GoalService.java`

```java
package com.tara.sm.info.service;

import com.tara.sm.auth.repository.DepartmentRepository;
import com.tara.sm.auth.repository.UserRepository;
import com.tara.sm.info.dto.GoalDto;
import com.tara.sm.info.entity.AmGoal;
import com.tara.sm.info.entity.PartGoal;
import com.tara.sm.info.repository.AmGoalRepository;
import com.tara.sm.info.repository.PartGoalRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GoalService {

    private final PartGoalRepository partGoalRepository;
    private final AmGoalRepository amGoalRepository;
    private final DepartmentRepository departmentRepository;
    private final UserRepository userRepository;

    /** 파트 목표 조회 (year, month) */
    public List<GoalDto.PartGoalItem> getPartGoals(Integer year, Integer month) {
        return partGoalRepository.findByYearAndMonth(year, month).stream()
            .map(g -> GoalDto.PartGoalItem.builder()
                .departmentId(g.getDepartment().getId())
                .departmentName(g.getDepartment().getName())
                .targetAmount(g.getTargetAmount())
                .build())
            .collect(Collectors.toList());
    }

    /** 파트 목표 일괄 upsert */
    @Transactional
    public void savePartGoals(GoalDto.SavePartGoalsRequest request) {
        for (GoalDto.PartGoalItem item : request.getGoals()) {
            PartGoal goal = partGoalRepository
                .findByDepartmentIdAndYearAndMonth(
                    item.getDepartmentId(), request.getYear(), request.getMonth())
                .orElseGet(() -> PartGoal.builder()
                    .department(departmentRepository.getReferenceById(item.getDepartmentId()))
                    .year(request.getYear())
                    .month(request.getMonth())
                    .build());

            goal.setTargetAmount(item.getTargetAmount());
            partGoalRepository.save(goal);
        }
    }

    /** AM 목표 조회 */
    public List<GoalDto.AmGoalItem> getAmGoals(Integer year, Integer month) {
        return amGoalRepository.findByYearAndMonth(year, month).stream()
            .map(g -> GoalDto.AmGoalItem.builder()
                .userId(g.getUser().getId())
                .userName(g.getUser().getName())
                .departmentName(g.getUser().getDepartment() != null
                    ? g.getUser().getDepartment().getName() : null)
                .targetAmount(g.getTargetAmount())
                .build())
            .collect(Collectors.toList());
    }

    /** AM 목표 일괄 upsert */
    @Transactional
    public void saveAmGoals(GoalDto.SaveAmGoalsRequest request) {
        for (GoalDto.AmGoalItem item : request.getGoals()) {
            AmGoal goal = amGoalRepository
                .findByUserIdAndYearAndMonth(
                    item.getUserId(), request.getYear(), request.getMonth())
                .orElseGet(() -> AmGoal.builder()
                    .user(userRepository.getReferenceById(item.getUserId()))
                    .year(request.getYear())
                    .month(request.getMonth())
                    .build());

            goal.setTargetAmount(item.getTargetAmount());
            amGoalRepository.save(goal);
        }
    }
}
```

- [ ] **4.5** Create controller `sm-module-api/src/main/java/com/tara/sm/info/controller/GoalController.java`

```java
package com.tara.sm.info.controller;

import com.tara.sm.common.dto.ApiResponse;
import com.tara.sm.info.dto.GoalDto;
import com.tara.sm.info.service.GoalService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Info - 목표관리", description = "파트/AM 목표 조회 및 입력 API")
@RestController
@RequestMapping("/api/info")
@RequiredArgsConstructor
public class GoalController {

    private final GoalService goalService;

    @Operation(summary = "파트 목표 조회")
    @GetMapping("/part-goals")
    public ApiResponse<List<GoalDto.PartGoalItem>> getPartGoals(
            @RequestParam Integer year, @RequestParam Integer month) {
        return ApiResponse.success(goalService.getPartGoals(year, month));
    }

    @Operation(summary = "파트 목표 저장 (upsert)")
    @PutMapping("/part-goals")
    public ApiResponse<Void> savePartGoals(@RequestBody GoalDto.SavePartGoalsRequest request) {
        goalService.savePartGoals(request);
        return ApiResponse.success(null);
    }

    @Operation(summary = "AM 목표 조회")
    @GetMapping("/am-goals")
    public ApiResponse<List<GoalDto.AmGoalItem>> getAmGoals(
            @RequestParam Integer year, @RequestParam Integer month) {
        return ApiResponse.success(goalService.getAmGoals(year, month));
    }

    @Operation(summary = "AM 목표 저장 (upsert)")
    @PutMapping("/am-goals")
    public ApiResponse<Void> saveAmGoals(@RequestBody GoalDto.SaveAmGoalsRequest request) {
        goalService.saveAmGoals(request);
        return ApiResponse.success(null);
    }
}
```

### Acceptance Criteria
- PartGoal/AmGoal entities with UNIQUE constraints (department_id,year,month) and (user_id,year,month)
- Goals use upsert pattern: findByXxxAndYearAndMonth, create if absent, update targetAmount
- No soft delete on goals (overwrite pattern per spec)
- GET returns list of goals for year/month, PUT accepts batch save
- Endpoints match spec 5.3: `/api/info/part-goals`, `/api/info/am-goals`

---

## Task 5: 사업자관리 Frontend (BizOwnerPage)

> BizOwnerPage.tsx: 검색(파트 드롭다운 + 키워드) + DataTable + 행 클릭 모달(생성/수정 폼).
> API 함수, 타입 정의 포함.

### Steps

- [ ] **5.1** Create types `sm-module-web/src/types/info.ts`

```typescript
// === 사업자 ===
export interface BizOwnerListItem {
  id: number;
  companyName: string;
  bizNo: string;
  bizType: string;
  bizItem: string;
  address: string;
  douzoneCode: string;
  departmentName: string;
}

export interface BizOwnerDetail {
  id: number;
  companyName: string;
  bizNo: string;
  bizType: string;
  bizItem: string;
  address: string;
  douzoneCode: string;
  representativeName: string;
  representativeEmail: string;
  representativePhone: string;
  departmentId: number | null;
  departmentName: string;
  createdAt: string;
  updatedAt: string;
}

export interface BizOwnerForm {
  companyName: string;
  bizNo: string;
  bizType: string;
  bizItem: string;
  address: string;
  douzoneCode: string;
  representativeName: string;
  representativeEmail: string;
  representativePhone: string;
  departmentId: number | null;
}

// === 고객 ===
export interface CustomerListItem {
  id: number;
  customerType: string;
  businessOwnerName: string;
  bizNo: string;
  name: string;
  branch: string;
  phone: string;
  registeredByName: string;
  createdAt: string;
}

export interface CustomerDetail {
  id: number;
  customerType: string;
  businessOwnerId: number | null;
  businessOwnerName: string;
  name: string;
  branch: string;
  phone: string;
  registeredById: number | null;
  registeredByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerForm {
  customerType: string;
  businessOwnerId: number | null;
  name: string;
  branch: string;
  phone: string;
}

export interface CustomerAutocomplete {
  id: number;
  name: string;
  businessOwnerName: string;
  phone: string;
}

// === 목표 ===
export interface PartGoalItem {
  departmentId: number;
  departmentName: string;
  targetAmount: number;
}

export interface AmGoalItem {
  userId: number;
  userName: string;
  departmentName: string;
  targetAmount: number;
}
```

- [ ] **5.2** Create API layer `sm-module-web/src/api/info.api.ts`

```typescript
import client from './client';
import type { PageResponse } from '../types/common';
import type {
  BizOwnerListItem, BizOwnerDetail, BizOwnerForm,
  CustomerListItem, CustomerDetail, CustomerForm, CustomerAutocomplete,
  PartGoalItem, AmGoalItem,
} from '../types/info';

const BASE = '/api/info';

// --- 사업자 ---
export const bizOwnerApi = {
  list: (params: { departmentId?: number; keyword?: string; page?: number; size?: number }) =>
    client.get<PageResponse<BizOwnerListItem>>(`${BASE}/biz-owners`, { params }),

  detail: (id: number) =>
    client.get<BizOwnerDetail>(`${BASE}/biz-owners/${id}`),

  create: (data: BizOwnerForm) =>
    client.post<BizOwnerDetail>(`${BASE}/biz-owners`, data),

  update: (id: number, data: BizOwnerForm) =>
    client.put<BizOwnerDetail>(`${BASE}/biz-owners/${id}`, data),
};

// --- 고객 ---
export const customerApi = {
  list: (params: { departmentId?: number; keyword?: string; page?: number; size?: number }) =>
    client.get<PageResponse<CustomerListItem>>(`${BASE}/customers`, { params }),

  detail: (id: number) =>
    client.get<CustomerDetail>(`${BASE}/customers/${id}`),

  create: (data: CustomerForm) =>
    client.post<CustomerDetail>(`${BASE}/customers`, data),

  update: (id: number, data: CustomerForm) =>
    client.put<CustomerDetail>(`${BASE}/customers/${id}`, data),

  search: (keyword: string) =>
    client.get<CustomerAutocomplete[]>(`${BASE}/customers/search`, { params: { keyword } }),
};

// --- 목표 ---
export const goalApi = {
  getPartGoals: (year: number, month: number) =>
    client.get<PartGoalItem[]>(`${BASE}/part-goals`, { params: { year, month } }),

  savePartGoals: (data: { year: number; month: number; goals: PartGoalItem[] }) =>
    client.put<void>(`${BASE}/part-goals`, data),

  getAmGoals: (year: number, month: number) =>
    client.get<AmGoalItem[]>(`${BASE}/am-goals`, { params: { year, month } }),

  saveAmGoals: (data: { year: number; month: number; goals: AmGoalItem[] }) =>
    client.put<void>(`${BASE}/am-goals`, data),
};
```

- [ ] **5.3** Create page `sm-module-web/src/pages/info/BizOwnerPage.tsx`

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Select, Modal, Form, message, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { createColumnHelper } from '@tanstack/react-table';
import DataTable from '../../components/table/DataTable';
import PageLayout from '../../components/layout/PageLayout';
import { bizOwnerApi } from '../../api/info.api';
import type { BizOwnerListItem, BizOwnerForm } from '../../types/info';

const columnHelper = createColumnHelper<BizOwnerListItem>();

const columns = [
  columnHelper.accessor('companyName', { header: '회사명' }),
  columnHelper.accessor('bizNo',       { header: '사업자번호' }),
  columnHelper.accessor('bizType',     { header: '업태' }),
  columnHelper.accessor('bizItem',     { header: '종목' }),
  columnHelper.accessor('address',     { header: '주소' }),
  columnHelper.accessor('douzoneCode', { header: '더존코드' }),
  columnHelper.accessor('departmentName', { header: '담당파트' }),
];

export default function BizOwnerPage() {
  const queryClient = useQueryClient();
  const [departmentId, setDepartmentId] = useState<number | undefined>();
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm<BizOwnerForm>();

  // --- Query ---
  const { data, isLoading } = useQuery({
    queryKey: ['bizOwners', departmentId, keyword, page],
    queryFn: () => bizOwnerApi.list({ departmentId, keyword, page, size: 20 }),
  });

  // --- Mutations ---
  const saveMutation = useMutation({
    mutationFn: (values: BizOwnerForm) =>
      editingId
        ? bizOwnerApi.update(editingId, values)
        : bizOwnerApi.create(values),
    onSuccess: () => {
      message.success(editingId ? '수정되었습니다' : '등록되었습니다');
      queryClient.invalidateQueries({ queryKey: ['bizOwners'] });
      closeModal();
    },
  });

  // --- Handlers ---
  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = async (row: BizOwnerListItem) => {
    setEditingId(row.id);
    const detail = await bizOwnerApi.detail(row.id);
    form.setFieldsValue(detail);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    form.resetFields();
  };

  return (
    <PageLayout title="사업자관리" breadcrumb={['정보관리', '사업자관리']}>
      {/* 검색 영역 */}
      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder="파트 선택"
          allowClear
          style={{ width: 160 }}
          onChange={(v) => { setDepartmentId(v); setPage(0); }}
          options={[
            /* TODO: departments from API or store */
            { label: '전체', value: undefined },
          ]}
        />
        <Input.Search
          placeholder="회사명, 사업자번호, 업태, 종목"
          allowClear
          style={{ width: 300 }}
          onSearch={(v) => { setKeyword(v); setPage(0); }}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          신규 등록
        </Button>
      </Space>

      {/* 테이블 */}
      <DataTable
        columns={columns}
        data={data?.data?.content ?? []}
        loading={isLoading}
        pagination={{
          total: data?.data?.totalElements ?? 0,
          current: page + 1,
          pageSize: 20,
          onChange: (p) => setPage(p - 1),
        }}
        onRowClick={openEdit}
      />

      {/* 생성/수정 모달 */}
      <Modal
        title={editingId ? '사업자 수정' : '사업자 등록'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate(v)}>
          <Form.Item name="companyName" label="회사명" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="bizNo" label="사업자번호">
            <Input />
          </Form.Item>
          <Form.Item name="bizType" label="업태">
            <Input />
          </Form.Item>
          <Form.Item name="bizItem" label="종목">
            <Input />
          </Form.Item>
          <Form.Item name="address" label="주소">
            <Input />
          </Form.Item>
          <Form.Item name="douzoneCode" label="더존코드">
            <Input />
          </Form.Item>
          <Form.Item name="representativeName" label="대표자명">
            <Input />
          </Form.Item>
          <Form.Item name="representativeEmail" label="대표자 이메일">
            <Input />
          </Form.Item>
          <Form.Item name="representativePhone" label="대표자 연락처">
            <Input />
          </Form.Item>
          <Form.Item name="departmentId" label="담당 파트">
            <Select placeholder="파트 선택" allowClear
              options={[/* TODO: from API */]} />
          </Form.Item>
        </Form>
      </Modal>
    </PageLayout>
  );
}
```

### Acceptance Criteria
- Page renders search bar (dept dropdown + keyword) + DataTable + create/edit modal per spec 6.4
- Row click opens detail modal with edit form
- Form submit calls POST (create) or PUT (update) based on editingId
- React Query caching with invalidation on mutation success
- Type-safe API calls using info.api.ts

---

## Task 6: 고객관리 Frontend (CustomerPage)

> CustomerPage.tsx: 검색 + DataTable + 모달, SearchPopup으로 사업자 선택.

### Steps

- [ ] **6.1** Create search popup component `sm-module-web/src/components/form/BizOwnerSearchPopup.tsx`

```tsx
import { useState } from 'react';
import { Modal, Input, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { bizOwnerApi } from '../../api/info.api';
import type { BizOwnerListItem } from '../../types/info';

interface Props {
  open: boolean;
  onSelect: (biz: BizOwnerListItem) => void;
  onCancel: () => void;
}

export default function BizOwnerSearchPopup({ open, onSelect, onCancel }: Props) {
  const [keyword, setKeyword] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['bizOwnerPopup', keyword],
    queryFn: () => bizOwnerApi.list({ keyword, page: 0, size: 10 }),
    enabled: open && keyword.length >= 1,
  });

  const columns = [
    { title: '회사명', dataIndex: 'companyName', key: 'companyName' },
    { title: '사업자번호', dataIndex: 'bizNo', key: 'bizNo' },
    { title: '업태', dataIndex: 'bizType', key: 'bizType' },
  ];

  return (
    <Modal title="사업자 검색" open={open} onCancel={onCancel} footer={null} width={600}>
      <Input.Search
        placeholder="회사명 또는 사업자번호"
        onSearch={setKeyword}
        style={{ marginBottom: 12 }}
      />
      <Table
        columns={columns}
        dataSource={data?.data?.content ?? []}
        loading={isLoading}
        rowKey="id"
        size="small"
        pagination={false}
        onRow={(record) => ({
          onClick: () => { onSelect(record); },
          style: { cursor: 'pointer' },
        })}
      />
    </Modal>
  );
}
```

- [ ] **6.2** Create page `sm-module-web/src/pages/info/CustomerPage.tsx`

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Select, Modal, Form, message, Space } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { createColumnHelper } from '@tanstack/react-table';
import DataTable from '../../components/table/DataTable';
import PageLayout from '../../components/layout/PageLayout';
import BizOwnerSearchPopup from '../../components/form/BizOwnerSearchPopup';
import { customerApi } from '../../api/info.api';
import type { CustomerListItem, CustomerForm, BizOwnerListItem } from '../../types/info';
import dayjs from 'dayjs';

const columnHelper = createColumnHelper<CustomerListItem>();

const columns = [
  columnHelper.accessor('customerType',      { header: '구분' }),
  columnHelper.accessor('businessOwnerName',  { header: '회사명' }),
  columnHelper.accessor('name',              { header: '고객명' }),
  columnHelper.accessor('branch',            { header: '거래지점' }),
  columnHelper.accessor('phone',             { header: '연락처' }),
  columnHelper.accessor('registeredByName',  { header: '등록자' }),
  columnHelper.accessor('createdAt', {
    header: '등록일',
    cell: (info) => dayjs(info.getValue()).format('YYYY-MM-DD'),
  }),
];

export default function CustomerPage() {
  const queryClient = useQueryClient();
  const [departmentId, setDepartmentId] = useState<number | undefined>();
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [bizPopupOpen, setBizPopupOpen] = useState(false);
  const [selectedBizName, setSelectedBizName] = useState('');
  const [form] = Form.useForm<CustomerForm>();

  const { data, isLoading } = useQuery({
    queryKey: ['customers', departmentId, keyword, page],
    queryFn: () => customerApi.list({ departmentId, keyword, page, size: 20 }),
  });

  const saveMutation = useMutation({
    mutationFn: (values: CustomerForm) =>
      editingId
        ? customerApi.update(editingId, values)
        : customerApi.create(values),
    onSuccess: () => {
      message.success(editingId ? '수정되었습니다' : '등록되었습니다');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      closeModal();
    },
  });

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    setSelectedBizName('');
    setModalOpen(true);
  };

  const openEdit = async (row: CustomerListItem) => {
    setEditingId(row.id);
    const detail = await customerApi.detail(row.id);
    form.setFieldsValue(detail);
    setSelectedBizName(detail.businessOwnerName ?? '');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
  };

  const handleBizSelect = (biz: BizOwnerListItem) => {
    form.setFieldValue('businessOwnerId', biz.id);
    setSelectedBizName(biz.companyName);
    setBizPopupOpen(false);
  };

  return (
    <PageLayout title="고객관리" breadcrumb={['정보관리', '고객관리']}>
      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder="파트 선택" allowClear style={{ width: 160 }}
          onChange={(v) => { setDepartmentId(v); setPage(0); }}
          options={[{ label: '전체', value: undefined }]}
        />
        <Input.Search
          placeholder="고객명, 회사명"
          allowClear style={{ width: 300 }}
          onSearch={(v) => { setKeyword(v); setPage(0); }}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          신규 등록
        </Button>
      </Space>

      <DataTable
        columns={columns}
        data={data?.data?.content ?? []}
        loading={isLoading}
        pagination={{
          total: data?.data?.totalElements ?? 0,
          current: page + 1,
          pageSize: 20,
          onChange: (p) => setPage(p - 1),
        }}
        onRowClick={openEdit}
      />

      {/* 고객 생성/수정 모달 */}
      <Modal
        title={editingId ? '고객 수정' : '고객 등록'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate(v)}>
          <Form.Item name="customerType" label="구분">
            <Input />
          </Form.Item>
          <Form.Item label="사업자 (회사)">
            <Space>
              <Input value={selectedBizName} readOnly placeholder="사업자 선택" />
              <Button icon={<SearchOutlined />} onClick={() => setBizPopupOpen(true)} />
            </Space>
            <Form.Item name="businessOwnerId" noStyle><Input type="hidden" /></Form.Item>
          </Form.Item>
          <Form.Item name="name" label="고객명" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="branch" label="거래지점">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="연락처">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* 사업자 검색 팝업 */}
      <BizOwnerSearchPopup
        open={bizPopupOpen}
        onSelect={handleBizSelect}
        onCancel={() => setBizPopupOpen(false)}
      />
    </PageLayout>
  );
}
```

### Acceptance Criteria
- Search bar: dept dropdown + keyword (고객명, 회사명) per spec 6.4
- Table shows: 구분, 회사명, 고객명, 거래지점, 연락처, 등록자, 등록일
- Row click opens edit modal with current values
- BizOwnerSearchPopup modal for selecting 사업자 in create/edit form
- businessOwnerId stored as hidden field, display shows company name

---

## Task 7: 파트/AM 목표 Frontend (PartGoalPage, AmGoalPage)

> Year/month selector + editable grid + save button. Goals use upsert API.

### Steps

- [ ] **7.1** Create `sm-module-web/src/pages/info/PartGoalPage.tsx`

```tsx
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { DatePicker, Button, InputNumber, Table, message, Space } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import PageLayout from '../../components/layout/PageLayout';
import { goalApi } from '../../api/info.api';
import type { PartGoalItem } from '../../types/info';
import dayjs from 'dayjs';

export default function PartGoalPage() {
  const [date, setDate] = useState(dayjs());
  const year = date.year();
  const month = date.month() + 1;
  const [rows, setRows] = useState<PartGoalItem[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['partGoals', year, month],
    queryFn: () => goalApi.getPartGoals(year, month),
  });

  useEffect(() => {
    if (data) setRows(data.map((r) => ({ ...r })));
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => goalApi.savePartGoals({ year, month, goals: rows }),
    onSuccess: () => message.success('저장되었습니다'),
  });

  const updateAmount = (idx: number, value: number | null) => {
    setRows((prev) => prev.map((r, i) =>
      i === idx ? { ...r, targetAmount: value ?? 0 } : r));
  };

  const antColumns = [
    { title: '파트명', dataIndex: 'departmentName', key: 'departmentName' },
    {
      title: '목표금액',
      dataIndex: 'targetAmount',
      key: 'targetAmount',
      render: (_: number, __: PartGoalItem, idx: number) => (
        <InputNumber
          value={rows[idx]?.targetAmount}
          onChange={(v) => updateAmount(idx, v)}
          formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          parser={(v) => Number(v?.replace(/,/g, '') ?? 0)}
          style={{ width: 200 }}
        />
      ),
    },
  ];

  return (
    <PageLayout title="파트 목표 입력" breadcrumb={['정보관리', '파트 목표 입력']}>
      <Space style={{ marginBottom: 16 }}>
        <DatePicker
          picker="month"
          value={date}
          onChange={(d) => d && setDate(d)}
          format="YYYY년 MM월"
        />
        <Button type="primary" icon={<SaveOutlined />}
          loading={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}>
          저장
        </Button>
      </Space>

      <Table
        columns={antColumns}
        dataSource={rows}
        loading={isLoading}
        rowKey="departmentId"
        pagination={false}
        size="middle"
      />
    </PageLayout>
  );
}
```

- [ ] **7.2** Create `sm-module-web/src/pages/info/AmGoalPage.tsx`

```tsx
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { DatePicker, Button, InputNumber, Table, message, Space } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import PageLayout from '../../components/layout/PageLayout';
import { goalApi } from '../../api/info.api';
import type { AmGoalItem } from '../../types/info';
import dayjs from 'dayjs';

export default function AmGoalPage() {
  const [date, setDate] = useState(dayjs());
  const year = date.year();
  const month = date.month() + 1;
  const [rows, setRows] = useState<AmGoalItem[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['amGoals', year, month],
    queryFn: () => goalApi.getAmGoals(year, month),
  });

  useEffect(() => {
    if (data) setRows(data.map((r) => ({ ...r })));
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => goalApi.saveAmGoals({ year, month, goals: rows }),
    onSuccess: () => message.success('저장되었습니다'),
  });

  const updateAmount = (idx: number, value: number | null) => {
    setRows((prev) => prev.map((r, i) =>
      i === idx ? { ...r, targetAmount: value ?? 0 } : r));
  };

  const antColumns = [
    { title: '소속파트', dataIndex: 'departmentName', key: 'departmentName' },
    { title: 'AM명', dataIndex: 'userName', key: 'userName' },
    {
      title: '목표금액',
      dataIndex: 'targetAmount',
      key: 'targetAmount',
      render: (_: number, __: AmGoalItem, idx: number) => (
        <InputNumber
          value={rows[idx]?.targetAmount}
          onChange={(v) => updateAmount(idx, v)}
          formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          parser={(v) => Number(v?.replace(/,/g, '') ?? 0)}
          style={{ width: 200 }}
        />
      ),
    },
  ];

  return (
    <PageLayout title="AM 목표 입력" breadcrumb={['정보관리', 'AM 목표 입력']}>
      <Space style={{ marginBottom: 16 }}>
        <DatePicker
          picker="month"
          value={date}
          onChange={(d) => d && setDate(d)}
          format="YYYY년 MM월"
        />
        <Button type="primary" icon={<SaveOutlined />}
          loading={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}>
          저장
        </Button>
      </Space>

      <Table
        columns={antColumns}
        dataSource={rows}
        loading={isLoading}
        rowKey="userId"
        pagination={false}
        size="middle"
      />
    </PageLayout>
  );
}
```

### Acceptance Criteria
- Month picker (YYYY년 MM월) selects year/month and triggers data fetch
- Editable grid: InputNumber with comma formatting for each row's targetAmount
- Save button sends PUT with full list of goals (upsert on backend)
- PartGoalPage shows departmentName + targetAmount, AmGoalPage shows departmentName + userName + targetAmount
- Local state (rows) syncs with server data on fetch but allows in-place editing before save

---

## Task 8: 라우팅 + 메뉴

> 정보관리 4개 페이지 라우트 등록 + 사이드바/GNB 메뉴 항목 추가.

### Steps

- [ ] **8.1** Update route config `sm-module-web/src/routes/index.tsx`

Add the following routes inside the authenticated layout route:

```tsx
import BizOwnerPage from '../pages/info/BizOwnerPage';
import CustomerPage from '../pages/info/CustomerPage';
import PartGoalPage from '../pages/info/PartGoalPage';
import AmGoalPage from '../pages/info/AmGoalPage';

// Inside <Route element={<AppLayout />}> children:
<Route path="/info/biz-owners"  element={<BizOwnerPage />} />
<Route path="/info/customers"   element={<CustomerPage />} />
<Route path="/info/part-goals"  element={<PartGoalPage />} />
<Route path="/info/am-goals"    element={<AmGoalPage />} />
```

- [ ] **8.2** Update menu config `sm-module-web/src/components/layout/AppSidebar.tsx` (or `menuConfig.ts`)

Add the 정보관리 menu group:

```typescript
{
  key: 'info',
  label: '정보관리',
  children: [
    { key: '/info/biz-owners',  label: '사업자관리' },
    { key: '/info/customers',   label: '고객관리' },
    { key: '/info/part-goals',  label: '파트 목표 입력' },
    { key: '/info/am-goals',    label: 'AM 목표 입력' },
  ],
}
```

- [ ] **8.3** Verify navigation: Click each menu item and confirm the correct page renders
- [ ] **8.4** Verify breadcrumb displays correctly on each page

### Acceptance Criteria
- All 4 routes accessible: `/info/biz-owners`, `/info/customers`, `/info/part-goals`, `/info/am-goals`
- GNB/Sidebar shows "정보관리" group with 4 sub-items per spec 6.1, 11
- Protected routes (require authentication)
- Breadcrumb shows correct path (e.g., "정보관리 > 사업자관리")

---

## Summary

| Task | Backend/Frontend | Key Files | API Endpoints |
|------|-----------------|-----------|---------------|
| 1 | DB | `V2__create_info_tables.sql` | - |
| 2 | Backend | `BusinessOwner.java`, `BizOwnerService.java`, `BizOwnerController.java` | `GET/POST/PUT /api/info/biz-owners` |
| 3 | Backend | `Customer.java`, `CustomerService.java`, `CustomerController.java` | `GET/POST/PUT /api/info/customers`, `GET /api/info/customers/search` |
| 4 | Backend | `PartGoal.java`, `AmGoal.java`, `GoalService.java`, `GoalController.java` | `GET/PUT /api/info/part-goals`, `GET/PUT /api/info/am-goals` |
| 5 | Frontend | `info.ts`, `info.api.ts`, `BizOwnerPage.tsx` | - |
| 6 | Frontend | `CustomerPage.tsx`, `BizOwnerSearchPopup.tsx` | - |
| 7 | Frontend | `PartGoalPage.tsx`, `AmGoalPage.tsx` | - |
| 8 | Frontend | `routes/index.tsx`, `AppSidebar.tsx` | - |

**Dependency order:** Task 1 → Task 2/3/4 (parallel) → Task 5/6/7 (parallel) → Task 8
