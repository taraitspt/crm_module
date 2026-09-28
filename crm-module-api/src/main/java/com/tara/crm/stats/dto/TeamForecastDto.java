package com.tara.crm.stats.dto;

import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TeamForecastDto {
    private int year;
    private int month;
    private List<DivisionForecast> divisions;

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class DivisionForecast {
        private String divisionName;       // 사업본부명 (그래픽스/PM/국내/해외)
        private Long forecastAmount;       // 예상매출
        private List<TeamDetail> teams;
    }

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class TeamDetail {
        private String teamName;           // 팀/파트명
        private Long pendingAmount;        // 접수중 금액
        private Long inProgressAmount;     // 진행중 금액
        private Long forecastAmount;       // 예상 합계
    }
}
