package com.tara.crm.info.dto;

import lombok.*;
import java.util.List;

public class GoalDto {

    /** 파트 목표 1행 (deptCd 기준) */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class PartGoalItem {
        private String deptCd;
        private String deptNm;
        private Long goalAmt;
    }

    /** AM 목표 1행 (salesEmpId 기준) */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class AmGoalItem {
        private String salesEmpId;
        private String empNm;
        private String deptNm;
        private Long goalAmt;
    }

    /** 월별 목표 (목표/내부/외부)
     *  시트 #5 0511_2 — 입력은 goalAmt + innerAmt 두 개이고 outerAmt 는 (goalAmt - innerAmt) 자동.
     *  과거 정책(innerAmt + outerAmt = goalAmt 자동) 과 반대 방향이라 응답·요청 모두 goalAmt 포함. */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class MonthGoal {
        private String planMm;
        private Long goalAmt;
        private Long innerAmt;
        private Long outerAmt;
    }

    /** AM 연간 목표 (12개월) */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class AmGoalYearlyItem {
        private String salesEmpId;
        private String empNm;
        private String deptCd;
        private String deptNm;
        private List<MonthGoal> months;
        /** ODTY_CD='200' 이면 파트장. 프론트에서 자동계산(부서목표 - 일반담당자 합계)에 사용 */
        private boolean partLeader;
    }

    /** 파트 목표 일괄 저장 요청 */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class SavePartGoalsRequest {
        private String planYy;
        private String planMm;
        private List<PartGoalItem> goals;
    }

    /** AM 목표 일괄 저장 요청 */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class SaveAmGoalsRequest {
        private String planYy;
        private String planMm;
        private List<AmGoalItem> goals;
    }

    /** AM 연간 목표 저장 요청 */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class SaveAmGoalYearlyRequest {
        private String planYy;
        private Integer plantCd;
        private List<AmGoalYearlyItem> goals;
    }
}
