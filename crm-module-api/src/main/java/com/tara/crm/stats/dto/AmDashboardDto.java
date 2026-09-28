package com.tara.crm.stats.dto;

import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AmDashboardDto {
    private Integer year;
    private Integer month;
    private List<AmRow> rows;

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class AmRow {
        private String amName;
        private String teamName;
        private String partName;
        private String rowType;       // "item" | "team" | "hq"

        // 월 실적 (총실적)
        private Long monthGoal;
        private Long monthActual;
        private Double monthRate;

        // 누적 (총실적)
        private Long cumulativeGoal;
        private Long cumulativeActual;
        private Double cumulativeRate;

        // 전년
        private Long prevYearActual;
        private Double yoyRate;
        private Long yoyDiff;

        // 내부 실적
        private Long innerMonthGoal;
        private Long innerMonthActual;
        private Double innerMonthRate;
        private Long innerCumulativeGoal;
        private Long innerCumulativeActual;
        private Double innerCumulativeRate;
        private Long innerPrevYearActual;
        private Double innerYoyRate;

        // 외부 실적
        private Long outerMonthGoal;
        private Long outerMonthActual;
        private Double outerMonthRate;
        private Long outerCumulativeGoal;
        private Long outerCumulativeActual;
        private Double outerCumulativeRate;
        private Long outerPrevYearActual;
        private Double outerYoyRate;
    }
}
