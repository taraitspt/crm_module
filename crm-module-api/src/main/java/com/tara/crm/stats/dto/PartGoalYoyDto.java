package com.tara.crm.stats.dto;

import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PartGoalYoyDto {
    private int year;
    private List<PartYoyRow> parts;

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class PartYoyRow {
        private String partName;
        private Long prevYearActual;       // 전년 실적
        private Long currentGoal;          // 금년 목표
        private Long currentActual;        // 금년 실적
        private Double goalRate;           // 목표 달성률 %
        private Double yoyRate;            // 전년대비 증감률 %
    }
}
