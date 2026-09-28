package com.tara.crm.info.dto;

import lombok.*;
import java.time.LocalDateTime;
import java.util.List;

public class BizOwnerDto {

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class ListItem {
        private Long id;
        private String partnerCd;
        private String companyName;
        private String bizNo;
        private String bizType;
        private String bizItem;
        private String address;
        private String ceoNm;
        private Integer deptCd;
        private String departmentName;
        /** 시트 R411 — 등록일/수정일 노출. */
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        /** 시트 R411 — 주문 테이블 조인하여 최근 주문일(연월일). */
        private java.time.LocalDate latestOrderDate;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Detail {
        private Long id;
        private Integer companyCd;
        private String partnerCd;
        private String companyName;
        private String bizNo;
        private String bizType;
        private String bizItem;
        private String address;
        private String representativeName;
        private String representativeEmail;
        private String representativePhone;
        private Integer deptCd;
        private String departmentName;
        private LocalDateTime createdAt;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class CreateRequest {
        private String partnerCd;
        private String companyName;
        private String bizNo;
        private String bizType;
        private String bizItem;
        private String address;
        private String representativeName;
        private String representativeEmail;
        private String representativePhone;
        private Integer deptCd;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class UpdateRequest {
        private String partnerCd;
        private String companyName;
        private String bizNo;
        private String bizType;
        private String bizItem;
        private String address;
        private String representativeName;
        private String representativeEmail;
        private String representativePhone;
        private Integer deptCd;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class SearchCondition {
        private Integer plantCd;
        private Integer deptCd;
        private String keyword;
        private int page;
        private int size;
        // ── 서버 페이징 (2026-09-01) ──
        /** 헤더 정렬 컬럼 id — Oracle 컬럼에 매핑되는 것만 지원(MySQL override 컬럼 제외). */
        private String sortField;
        /** asc | desc */
        private String sortDir;
        /** 헤더 컬럼 필터 (텍스트 전용) */
        private List<ColumnFilter> colFilters;
    }

    /** 헤더 컬럼 필터 — 매출목록과 동일 구조(사업자관리는 전 컬럼 텍스트). */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class ColumnFilter {
        private String colId;
        /** CONTAINS | EQUALS | NOT_CONTAINS */
        private String op;
        private List<String> values;
        private Boolean excludeBlank;
    }
}
