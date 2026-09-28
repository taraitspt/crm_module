-- 매출리스트 메뉴 (2026-09-28). ERP 매출 상세를 기간·사업부문으로 조회, 엑셀 다운로드.
-- 매출현황과 같은 대상이라 V141 기본값처럼 모든 역할에 켠다. 보이는 줄은 데이터 범위(SALES_STATS)로 거른다.
-- 역할별로 끄려면 관리자 > 권한 관리에서.
INSERT INTO menu_permission (menu_key, role, can_view, created_at, created_id)
SELECT '/stats/sales-list', r.role, 1, NOW(), 'system'
  FROM (SELECT 'ADMIN' AS role
        UNION ALL SELECT 'TEAM_LEADER'
        UNION ALL SELECT 'MANAGER'
        UNION ALL SELECT 'SALES_SPT'
        UNION ALL SELECT 'PART_LEADER'
        UNION ALL SELECT 'EXECUTIVE'
        UNION ALL SELECT 'CENTER_LEADER'
        UNION ALL SELECT 'FINANCE'
        UNION ALL SELECT 'STAFF') r;
