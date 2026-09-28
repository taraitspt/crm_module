package com.tara.crm.stats.dto;

import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AmGoalYoyDto {
    private int year;
    private List<AmYoyRow> managers;

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class AmYoyRow {
        private String managerName;
        private String partName;
        private Long prevYearActual;
        private Long currentGoal;
        private Long currentActual;
        private Double goalRate;
        private Double yoyRate;
    }
}
