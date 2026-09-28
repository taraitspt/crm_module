package com.tara.crm.stats.dto;

import lombok.*;

import java.util.ArrayList;
import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CustomerYearlySalesDetailDto {
    @Builder.Default private List<Row> rows = new ArrayList<>();
    @Builder.Default private List<Option> departments = new ArrayList<>();
    @Builder.Default private List<Option> partners = new ArrayList<>();
    @Builder.Default private List<Option> employees = new ArrayList<>();

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Row {
        private String partnerCd;
        private String partnerName;
        private String businessNo;
        private String departmentCd;
        private String departmentName;
        private String salesEmpNo;
        private String salesEmpName;
        private String inOutType;
        private String inOutLabel;
        private List<Long> monthlyAmounts;
        private Long totalAmount;
    }

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Option {
        private String value;
        private String label;
    }
}
