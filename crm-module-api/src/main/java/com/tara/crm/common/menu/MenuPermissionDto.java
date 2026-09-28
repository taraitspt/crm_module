package com.tara.crm.common.menu;

import lombok.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 메뉴 권한 DTO */
public class MenuPermissionDto {

    /** 권한 관리 화면의 한 줄 = 메뉴 하나 */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Row {
        private String menuKey;
        private String group;
        private String label;
        private boolean adminArea;
        /** 역할 → 접근 가능 여부 */
        @Builder.Default
        private Map<String, Boolean> roles = new LinkedHashMap<>();
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Matrix {
        @Builder.Default
        private List<String> roleOrder = new ArrayList<>();
        @Builder.Default
        private List<Row> rows = new ArrayList<>();
    }

    /** 저장 요청 — 변경된 셀만 보내도 되고 전체를 보내도 된다. */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class SaveRequest {
        private List<Cell> cells;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class Cell {
        private String menuKey;
        private String role;
        private boolean canView;
    }

    /** 로그인 사용자가 볼 수 있는 메뉴 + 리소스별 내 데이터 범위 */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class MyAccess {
        private String role;
        /** 리소스 → NONE / SELF / DEPT / ALL */
        @Builder.Default
        private Map<String, String> scopes = new LinkedHashMap<>();
        @Builder.Default
        private List<String> menuKeys = new ArrayList<>();
    }
}
