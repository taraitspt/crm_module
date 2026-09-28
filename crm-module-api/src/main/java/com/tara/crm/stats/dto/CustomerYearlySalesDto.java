package com.tara.crm.stats.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CustomerYearlySalesDto {
    @Builder.Default
    private List<Row> rows = new ArrayList<>();
    @Builder.Default
    private List<Option> departments = new ArrayList<>();
    @Builder.Default
    private List<Option> partners = new ArrayList<>();

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Row {
        private String partnerCd;
        private String partnerName;
        private String businessNo;
        private String departmentCd;
        private String departmentName;
        @Builder.Default
        private List<Long> monthlyAmounts = new ArrayList<>();
        private long totalAmount;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Option {
        private String value;
        private String label;
    }
}
