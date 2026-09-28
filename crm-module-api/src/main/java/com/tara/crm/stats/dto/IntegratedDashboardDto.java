package com.tara.crm.stats.dto;

import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IntegratedDashboardDto {
    private Integer year;
    private Integer month;
    private List<IntegratedRow> rows;
    /**
     * 이 응답이 이미 '전체 부서' 기준인지 (role 스코프·본부/팀/파트 필터가 하나도 안 걸림).
     * 대시보드가 요약카드(부서스코프)와 차트(전체부서)로 같은 무거운 집계를 2번 호출하는데,
     * 전체 권한 사용자는 두 응답이 동일하다 → 프론트가 이 플래그를 보고 2번째 호출을 생략한다.
     */
    private Boolean scopeAll;

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class IntegratedRow {
        private String orgName;
        private String rowType;       // "item" | "team" | "hq"

        // 월 실적 (총실적)
        private Long monthGoal;
        private Long monthActual;
        private Double monthRate;

        // 누적 (총실적)
        private Long cumulativeGoal;
        private Long cumulativeActual;
        private Double cumulativeRate;
        private Long cumulativePrevYearActual;   // 전년 동기간(1~월) 누적 실적

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
        private Long innerCumulativePrevYearActual;
        private Long innerPrevYearActual;
        private Double innerYoyRate;

        // 외부 실적
        private Long outerMonthGoal;
        private Long outerMonthActual;
        private Double outerMonthRate;
        private Long outerCumulativeGoal;
        private Long outerCumulativeActual;
        private Double outerCumulativeRate;
        private Long outerCumulativePrevYearActual;
        private Long outerPrevYearActual;
        private Double outerYoyRate;
    }
}
