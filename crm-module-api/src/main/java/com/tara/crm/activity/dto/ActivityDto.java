package com.tara.crm.activity.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** 영업활동 DTO 모음 */
public class ActivityDto {

    /** 활동 유형 — 화면 셀렉트/색상과 1:1. 값이 늘면 프론트 ACTIVITY_TYPES 도 같이 늘린다. */
    public enum Type { VISIT, CALL, MAIL, QUOTE, CONTRACT, ETC }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Item {
        private Long activityId;
        private LocalDate activityDt;
        private String salesEmpId;
        private String empNm;
        private Integer deptCd;
        private String deptNm;
        private String partnerCd;
        private String partnerNm;
        private String activityType;
        private String title;
        private String content;
        private LocalDate nextActionDt;
        private String nextAction;
        private Long amount;
        /** 연결된 영업기회 — 없으면 null */
        private Long dealId;
        private String dealTitle;
        private String dealStage;
    }

    /** 등록/수정 요청 */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class SaveRequest {
        @NotNull(message = "일자는 필수입니다.")
        private LocalDate activityDt;
        @NotBlank(message = "담당자는 필수입니다.")
        private String salesEmpId;
        private String partnerCd;
        private String partnerNm;
        @NotBlank(message = "활동유형은 필수입니다.")
        private String activityType;
        @NotBlank(message = "제목은 필수입니다.")
        private String title;
        private String content;
        private LocalDate nextActionDt;
        private String nextAction;
        private Long amount;
        private Long dealId;
    }

    /** 캘린더 한 칸 — 일자별 건수와 유형별 분포. */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class CalendarDay {
        private LocalDate date;
        private int total;
        /** 유형코드 → 건수 */
        @Builder.Default
        private java.util.Map<String, Integer> byType = new java.util.LinkedHashMap<>();
        /** 그날 예정된 다음 액션 건수 */
        private int followUps;
        /** 그날 마감 예정인 영업기회 건수 */
        private int dealCloses;
    }

    /** 일자별 영업현황 보드 — 행=담당자(또는 거래처), 열=일자. */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class BoardRow {
        private String rowKey;
        private String rowLabel;
        private String subLabel;
        /** 일자(yyyy-MM-dd) → 건수 */
        @Builder.Default
        private java.util.Map<String, Integer> counts = new java.util.LinkedHashMap<>();
        private int total;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Board {
        @Builder.Default
        private List<String> dates = new ArrayList<>();
        @Builder.Default
        private List<BoardRow> rows = new ArrayList<>();
        @Builder.Default
        private java.util.Map<String, Integer> dateTotals = new java.util.LinkedHashMap<>();
        private int total;
    }

    /** 거래처 히스토리 — 요약 + 타임라인 */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class PartnerHistory {
        private String partnerCd;
        private String partnerNm;
        private int totalCount;
        private LocalDate firstDt;
        private LocalDate lastDt;
        @Builder.Default
        private java.util.Map<String, Integer> byType = new java.util.LinkedHashMap<>();
        @Builder.Default
        private List<Item> items = new ArrayList<>();
    }
}
