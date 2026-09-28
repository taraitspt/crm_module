package com.tara.crm.common.dto;

import lombok.*;

import java.util.List;

/** 컬럼 필터 저장조건 요청/응답. */
public class ColumnFilterPresetDto {

    /** 저장 — 값 여러 개를 보내면 값마다 1행. 이미 있는 (조건, 값) 은 건너뛴다. */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class SaveRequest {
        private String pagePath;
        private String columnId;
        private String filterOp;
        private List<String> filterValues;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Item {
        private Long presetId;
        private String columnId;
        private String filterOp;
        private String filterValue;
    }
}
