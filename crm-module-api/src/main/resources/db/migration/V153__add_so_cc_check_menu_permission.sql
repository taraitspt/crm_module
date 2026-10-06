-- 매출 > 수주 담당팀 점검 메뉴 (2026-10-06). 수주의 비용센터와 영업담당자 소속을 대조해 오등록을 찾는다 — ERP 조회 전용.
-- V143 과 같은 규칙 — 모든 역할에 보이게 켠다. 역할별로 끄려면 관리자 > 권한 관리에서.
INSERT INTO menu_permission (menu_key, role, can_view, created_at, created_id)
SELECT '/stats/so-cc-check', r.role, 1, NOW(), 'system'
  FROM (SELECT 'ADMIN' AS role
        UNION ALL SELECT 'TEAM_LEADER'
        UNION ALL SELECT 'MANAGER'
        UNION ALL SELECT 'SALES_SPT'
        UNION ALL SELECT 'PART_LEADER'
        UNION ALL SELECT 'EXECUTIVE'
        UNION ALL SELECT 'CENTER_LEADER'
        UNION ALL SELECT 'FINANCE'
        UNION ALL SELECT 'STAFF') r;
