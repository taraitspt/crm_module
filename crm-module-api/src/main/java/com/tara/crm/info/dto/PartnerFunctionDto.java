package com.tara.crm.info.dto;

import lombok.*;

public class PartnerFunctionDto {

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class ListItem {
        private String companyCd;
        private String partnerCd;
        private String partnerNm;
        private String salesorgnCd;
        private String dischCd;
        private String prductgrpCd;
        private String prtnrFnCd;
        private String prtnrCd;
        private String partnerBpName;
        private String partnerBpDeptCd;
        private String partnerBpDeptName;
        private String defaultYn;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class SearchCondition {
        private String keyword;
        private String partnerCd;
        private String employeeNo;
        private int page;
        private int size;
        // ── 서버 페이징 (2026-09-01) ── 사업자관리/고객관리와 동일 구조.
        private String sortField;
        private String sortDir;
        private java.util.List<BizOwnerDto.ColumnFilter> colFilters;
    }
}
