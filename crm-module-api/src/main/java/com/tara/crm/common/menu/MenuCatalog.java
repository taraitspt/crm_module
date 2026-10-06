package com.tara.crm.common.menu;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;

/**
 * 권한을 걸 수 있는 메뉴 목록 — 화면(menuItems.tsx)과 짝을 이룬다.
 * 여기에 없는 메뉴는 권한 관리 화면에 나오지 않으므로, 메뉴를 추가하면 이 목록도 같이 늘린다.
 */
public final class MenuCatalog {

    @Getter
    @AllArgsConstructor
    public static class Entry {
        private final String menuKey;
        private final String group;
        private final String label;
        /** 관리자 전용 성격의 메뉴인지 — 화면에서 구분 표시용 */
        private final boolean adminArea;
    }

    public static final List<Entry> ENTRIES = List.of(
            new Entry("/", "홈", "매출현황", false),
            // 매출리스트는 상단 메뉴가 아니라 매출현황 안 버튼 — 이 키가 없으면 버튼도 안 보인다(2026-10-06)
            new Entry("/stats/sales-list", "매출", "매출리스트 (매출현황 안 버튼)", false),
            // 매출 후 잔여재고 + 수주 담당팀 점검 → 한 화면의 탭 (V154 에서 옛 키 정리)
            new Entry("/stats/data-check", "매출", "수주 점검", false),
            new Entry("/info/sales-plan", "정보관리", "월매출계획", false),
            new Entry("/activity/attention", "영업관리", "관리 필요 거래처", false),
            new Entry("/deals", "영업관리", "수주 추진", false),
            new Entry("/activity/calendar", "영업관리", "영업활동 캘린더", false),
            new Entry("/activity/board", "영업관리", "일자별 영업현황", false),
            new Entry("/activity/list", "영업관리", "영업활동 이력", false),
            new Entry("/activity/partner", "영업관리", "거래처 카드", false),
            new Entry("/production/plan", "생산현황", "생산계획현황", false),
            new Entry("/production/dashboard", "생산현황", "생산계획 대시보드", false),
            new Entry("/production/equipment-perf", "생산현황", "설비별 작업실적", false),
            new Entry("/production/equipment-board", "생산현황", "설비 가동 현황", false),
            new Entry("/production/order-progress", "생산현황", "주문진행현황", false),
            new Entry("/production/plan-register", "생산현황", "생산계획조회", false),
            new Entry("/production/schedule", "생산현황", "생산일정현황", false),
            new Entry("/tools/pdf", "도구", "PDF 변환", false),
            new Entry("/admin/active-users", "관리자", "실시간 접속 현황", true),
            new Entry("/admin/erp-sync", "관리자", "ERP 동기화", true),
            new Entry("/admin/closing", "관리자", "월마감 관리", true),
            new Entry("/admin/common-codes", "관리자", "공통코드 관리", true),
            new Entry("/admin/users", "관리자", "사용자 관리", true),
            new Entry("/admin/menu-permissions", "관리자", "권한 관리", true),
            new Entry("/admin/receivable-aging", "관리자", "채권연령분석", true)
    );

    /** 권한 매트릭스에 표시할 역할 순서 — users.role enum 과 같은 값. */
    public static final List<String> ROLES = List.of(
            "ADMIN", "TEAM_LEADER", "MANAGER", "SALES_SPT",
            "PART_LEADER", "EXECUTIVE", "CENTER_LEADER", "FINANCE", "STAFF"
    );

    private MenuCatalog() {
    }
}
