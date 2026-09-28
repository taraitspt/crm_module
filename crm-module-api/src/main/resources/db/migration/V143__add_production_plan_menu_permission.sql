-- 생산현황 > 생산계획현황 메뉴 (2026-09-28).
-- V141 기본값과 같은 규칙 — 관리자 메뉴가 아니므로 모든 역할에 보이게 켠다.
-- 데이터 범위는 걸지 않는다(메뉴가 보이면 전체 조회). 역할별로 끄려면 관리자 > 권한 관리에서.
INSERT INTO menu_permission (menu_key, role, can_view, created_at, created_id)
SELECT '/production/plan', r.role, 1, NOW(), 'system'
  FROM (SELECT 'ADMIN' AS role
        UNION ALL SELECT 'TEAM_LEADER'
        UNION ALL SELECT 'MANAGER'
        UNION ALL SELECT 'SALES_SPT'
        UNION ALL SELECT 'PART_LEADER'
        UNION ALL SELECT 'EXECUTIVE'
        UNION ALL SELECT 'CENTER_LEADER'
        UNION ALL SELECT 'FINANCE'
        UNION ALL SELECT 'STAFF') r;
