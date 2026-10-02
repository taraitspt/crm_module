package com.tara.crm.deal.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 수주 추진(딜) DTO */
public class DealDto {

    /**
     * 파이프라인 단계와 기본 확률.
     * WON/LOST 는 종료 단계 — 가중 파이프라인 집계에서 제외한다.
     */
    @Getter
    public enum Stage {
        LEAD(10), QUALIFIED(25), QUOTE(50), NEGOTIATION(75), WON(100), LOST(0);

        private final int defaultProbability;

        Stage(int defaultProbability) {
            this.defaultProbability = defaultProbability;
        }

        public boolean isOpen() {
            return this != WON && this != LOST;
        }
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Item {
        private Long dealId;
        private String partnerCd;
        private String partnerNm;
        private String salesEmpId;
        private String empNm;
        private String deptNm;
        private String title;
        private String stage;
        private long expectedAmt;
        private int probability;
        /** expectedAmt × probability / 100 */
        private long weightedAmt;
        private LocalDate expectedCloseDt;
        private LocalDate closedDt;
        private String lostReason;
        private String content;
        /** 예상 마감일이 지났는데 아직 열려 있는 딜 */
        private boolean overdue;
        /** 이 딜에 달린 영업활동 — 진행 경과를 카드에서 바로 보기 위함 */
        private int activityCount;
        private LocalDate lastActivityDt;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class SaveRequest {
        private String partnerCd;
        private String partnerNm;
        @NotBlank(message = "담당자는 필수입니다.")
        private String salesEmpId;
        @NotBlank(message = "제목은 필수입니다.")
        private String title;
        @NotBlank(message = "단계는 필수입니다.")
        private String stage;
        private Long expectedAmt;
        /** null 이면 단계 기본 확률을 쓴다. */
        private Integer probability;
        private LocalDate expectedCloseDt;
        private String lostReason;
        private String content;
    }

    /** 단계 이동 전용 — 칸반에서 카드를 옮길 때. */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class StageRequest {
        @NotBlank
        private String stage;
        private String lostReason;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class StageSummary {
        private String stage;
        private int count;
        private long expectedAmt;
        private long weightedAmt;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Pipeline {
        @Builder.Default
        private List<Item> items = new ArrayList<>();
        @Builder.Default
        private Map<String, StageSummary> byStage = new LinkedHashMap<>();
        /** 진행중(WON/LOST 제외) 합계 */
        private int openCount;
        private long openAmt;
        private long weightedAmt;
        private int wonCount;
        private long wonAmt;
        private int lostCount;
        private long lostAmt;
    }
}
