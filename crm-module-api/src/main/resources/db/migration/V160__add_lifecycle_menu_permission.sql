-- 생산현황 > 주문별 생애주기 메뉴 (2026-10-07). 주문 순번(제품 하나)의 제판→인쇄→후가공→접지→제본 계획·대수마감을 한 줄로 보는 ERP 조회 화면.
-- V143 과 같은 규칙 — ERP 조회 화면이라 모든 역할에 보이게 켠다. 역할별로 끄려면 관리자 > 권한 관리에서.
INSERT INTO menu_permission (menu_key, role, can_view, created_at, created_id)
SELECT '/production/lifecycle', r.role, 1, NOW(), 'system'
  FROM (SELECT 'ADMIN' AS role
        UNION ALL SELECT 'TEAM_LEADER'
        UNION ALL SELECT 'MANAGER'
        UNION ALL SELECT 'SALES_SPT'
        UNION ALL SELECT 'PART_LEADER'
        UNION ALL SELECT 'EXECUTIVE'
        UNION ALL SELECT 'CENTER_LEADER'
        UNION ALL SELECT 'FINANCE'
        UNION ALL SELECT 'STAFF') r;
