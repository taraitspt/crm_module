package com.tara.crm.info.dto;

import lombok.*;

public class CustomerDto {

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class ListItem {
        private Long id;
        private String partnerCd;
        private String companyName;
        private String contactName;
        private String contactDept;
        private String contactPosition;
        private String contactEmail;
        private String contactPhone;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Detail {
        private Long id;
        private String partnerCd;
        private String companyName;
        private String contactName;
        private String contactDept;
        private String contactPosition;
        private String contactEmail;
        private String contactPhone;
        private String note;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class SaveRequest {
        private String partnerCd;
        private String companyName;
        private String contactName;
        private String contactDept;
        private String contactPosition;
        private String contactEmail;
        private String contactPhone;
        private String note;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class SearchCondition {
        private String keyword;
        private String partnerCd;
        private int page;
        private int size;
        // ── 서버 페이징 (2026-09-01) ── 사업자관리와 동일 구조.
        private String sortField;
        private String sortDir;
        private java.util.List<BizOwnerDto.ColumnFilter> colFilters;
    }
}
