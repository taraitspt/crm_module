-- V161: 생산지원(PROD_SPT) 역할 추가 (2026-10-08 사용자 요청).
-- 생산팀도 이 시스템을 보게 하되 "특정 권한만" — 기본은 생산현황 메뉴만 보이고 영업 데이터(활동·수주추진·월매출계획·매출 통계)는 NONE.
-- 더 열어야 하면 관리자 > 권한 관리에서 생산지원 열을 켠다(DB 직접 수정 금지).

-- 1) users.role ENUM — 기존 값 순서는 그대로 두고 뒤에만 추가(V96·V120 패턴).
ALTER TABLE users
    MODIFY COLUMN role ENUM('ADMIN','EXECUTIVE','MANAGER','TEAM_LEADER','PART_LEADER','FINANCE','STAFF','SALES_SPT','CENTER_LEADER','PROD_SPT') NOT NULL;

-- 2) 메뉴 접근 — 카탈로그(MenuCatalog) 전 메뉴에 행을 만들고 생산현황만 켠다.
INSERT INTO menu_permission (menu_key, role, can_view, created_at, created_id)
SELECT m.menu_key, 'PROD_SPT', CASE WHEN m.menu_key LIKE '/production/%' THEN 1 ELSE 0 END, NOW(), 'system'
  FROM (SELECT '/' AS menu_key
        UNION ALL SELECT '/stats/sales-list'
        UNION ALL SELECT '/stats/data-check'
        UNION ALL SELECT '/info/sales-plan'
        UNION ALL SELECT '/activity/attention'
        UNION ALL SELECT '/deals'
        UNION ALL SELECT '/activity/calendar'
        UNION ALL SELECT '/activity/board'
        UNION ALL SELECT '/activity/list'
        UNION ALL SELECT '/activity/partner'
        UNION ALL SELECT '/production/plan'
        UNION ALL SELECT '/production/dashboard'
        UNION ALL SELECT '/production/equipment-perf'
        UNION ALL SELECT '/production/equipment-board'
        UNION ALL SELECT '/production/order-progress'
        UNION ALL SELECT '/production/plan-register'
        UNION ALL SELECT '/production/schedule'
        UNION ALL SELECT '/production/lifecycle'
        UNION ALL SELECT '/tools/pdf'
        UNION ALL SELECT '/admin/active-users'
        UNION ALL SELECT '/admin/erp-sync'
        UNION ALL SELECT '/admin/users'
        UNION ALL SELECT '/admin/departments'
        UNION ALL SELECT '/admin/menu-permissions'
        UNION ALL SELECT '/admin/receivable-aging') m
 WHERE NOT EXISTS (SELECT 1 FROM menu_permission p WHERE p.menu_key = m.menu_key AND p.role = 'PROD_SPT');

-- 3) 데이터 범위 — 영업 데이터는 전부 NONE.
INSERT INTO resource_scope (resource, role, scope, created_at, created_id)
SELECT r.resource, 'PROD_SPT', 'NONE', NOW(), 'system'
  FROM (SELECT 'ACTIVITY' AS resource
        UNION ALL SELECT 'DEAL'
        UNION ALL SELECT 'SALES_PLAN'
        UNION ALL SELECT 'SALES_STATS') r
 WHERE NOT EXISTS (SELECT 1 FROM resource_scope s WHERE s.resource = r.resource AND s.role = 'PROD_SPT');
