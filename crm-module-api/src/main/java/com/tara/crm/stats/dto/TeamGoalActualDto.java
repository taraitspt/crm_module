package com.tara.crm.stats.dto;

import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TeamGoalActualDto {
    private int year;
    private List<DivisionGoalActual> divisions;

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class DivisionGoalActual {
        private String divisionName;
        private List<MonthlyGoalActual> monthly;
        private Long yearlyGoal;
        private Long yearlyActual;
        private Double yearlyRate;          // 달성률 %
    }

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class MonthlyGoalActual {
        private int month;
        private Long goal;
        private Long actual;
        private Double rate;                // 달성률 %
    }
}
