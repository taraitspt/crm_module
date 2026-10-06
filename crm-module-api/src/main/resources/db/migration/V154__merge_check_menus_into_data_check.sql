-- 상단 메뉴 통합 (2026-10-06): 매출 후 잔여재고 + 수주 담당팀 점검 → '데이터 점검'(/stats/data-check) 한 항목(탭).
-- 매출리스트(/stats/sales-list)는 메뉴에서 빠지고 매출현황 안 버튼이 되지만 권한 키는 그대로 둔다(버튼 노출 판정에 씀).
INSERT INTO menu_permission (menu_key, role, can_view, created_at, created_id)
SELECT '/stats/data-check', r.role, 1, NOW(), 'system'
  FROM (SELECT 'ADMIN' AS role
        UNION ALL SELECT 'TEAM_LEADER'
        UNION ALL SELECT 'MANAGER'
        UNION ALL SELECT 'SALES_SPT'
        UNION ALL SELECT 'PART_LEADER'
        UNION ALL SELECT 'EXECUTIVE'
        UNION ALL SELECT 'CENTER_LEADER'
        UNION ALL SELECT 'FINANCE'
        UNION ALL SELECT 'STAFF') r;

-- 옛 키는 카탈로그에서 빠져 권한 관리 화면에 안 보이므로 행도 정리한다.
DELETE FROM menu_permission WHERE menu_key IN ('/stats/stock-leftover', '/stats/so-cc-check');
