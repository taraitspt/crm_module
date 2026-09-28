package com.tara.crm.common.menu;

import lombok.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 데이터 범위 매트릭스 DTO — 리소스(행) × 역할(열) */
public class ResourceScopeDto {

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Row {
        private String resource;
        private String label;
        private String desc;
        /** 역할 → NONE / SELF / DEPT / ALL */
        @Builder.Default
        private Map<String, String> roles = new LinkedHashMap<>();
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Matrix {
        @Builder.Default
        private List<String> roleOrder = new ArrayList<>();
        @Builder.Default
        private List<Row> rows = new ArrayList<>();
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class SaveRequest {
        private List<Cell> cells;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class Cell {
        private String resource;
        private String role;
        private String scope;
    }
}
