-- 생산현황 > 생산일정현황 메뉴 (2026-10-06). ERP 인쇄·제본·코팅 생산일정현황 화면의 조회 전용 이식.
-- V143 과 같은 규칙 — ERP 조회 화면이라 모든 역할에 보이게 켠다. 역할별로 끄려면 관리자 > 권한 관리에서.
INSERT INTO menu_permission (menu_key, role, can_view, created_at, created_id)
SELECT '/production/schedule', r.role, 1, NOW(), 'system'
  FROM (SELECT 'ADMIN' AS role
        UNION ALL SELECT 'TEAM_LEADER'
        UNION ALL SELECT 'MANAGER'
        UNION ALL SELECT 'SALES_SPT'
        UNION ALL SELECT 'PART_LEADER'
        UNION ALL SELECT 'EXECUTIVE'
        UNION ALL SELECT 'CENTER_LEADER'
        UNION ALL SELECT 'FINANCE'
        UNION ALL SELECT 'STAFF') r;
