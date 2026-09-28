package com.tara.crm.stats.dto;

import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SalesTrendDto {
    private List<MonthlyAmount> monthlySales;
    private List<MonthlyAmount> trendLine;

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class MonthlyAmount {
        private String month;   // "2025-04", "2025-05", ...
        private Long amount;    // 매출 합계 (원)
    }
}
