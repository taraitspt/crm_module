-- 생산현황 > 생산계획조회 메뉴 (2026-10-02). ERP 생산계획등록 화면의 조회 전용 이식 + 주문별 작업지시서(/production/work-order/:orderNo 도 이 키를 따른다).
-- V143 과 같은 규칙 — ERP 조회 화면이라 모든 역할에 보이게 켠다. 역할별로 끄려면 관리자 > 권한 관리에서.
INSERT INTO menu_permission (menu_key, role, can_view, created_at, created_id)
SELECT '/production/plan-register', r.role, 1, NOW(), 'system'
  FROM (SELECT 'ADMIN' AS role
        UNION ALL SELECT 'TEAM_LEADER'
        UNION ALL SELECT 'MANAGER'
        UNION ALL SELECT 'SALES_SPT'
        UNION ALL SELECT 'PART_LEADER'
        UNION ALL SELECT 'EXECUTIVE'
        UNION ALL SELECT 'CENTER_LEADER'
        UNION ALL SELECT 'FINANCE'
        UNION ALL SELECT 'STAFF') r;
