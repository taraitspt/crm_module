-- 메뉴 권한 (2026-09-21) — 어느 역할이 어느 메뉴를 볼 수 있는지.
-- DB 를 직접 만지지 않고 관리자 화면에서 켜고 끄기 위한 테이블.
-- 여기 없는 (menu_key, role) 조합은 '허용 안 함'으로 본다.
CREATE TABLE menu_permission (
    menu_key   VARCHAR(80) NOT NULL COMMENT '메뉴 경로 또는 그룹키 (menuItems.tsx 의 key)',
    role       VARCHAR(20) NOT NULL COMMENT 'users.role',
    can_view   TINYINT(1)  NOT NULL DEFAULT 0,
    created_at DATETIME    NULL,
    updated_at DATETIME    NULL,
    created_id VARCHAR(20) NULL,
    updated_id VARCHAR(20) NULL,
    PRIMARY KEY (menu_key, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='역할별 메뉴 접근 권한';

-- 기본값 — ADMIN 은 전부, 그 외 역할은 관리자 메뉴를 제외한 전부.
-- 역할 간 차이는 '보이는 메뉴'보다 '보이는 데이터 범위'(본인/팀/전체)로 구분한다.
INSERT INTO menu_permission (menu_key, role, can_view, created_at, created_id) VALUES
 ('/',                      'ADMIN', 1, NOW(), 'system'),
 ('/info/sales-plan',       'ADMIN', 1, NOW(), 'system'),
 ('/activity/attention',    'ADMIN', 1, NOW(), 'system'),
 ('/deals',                 'ADMIN', 1, NOW(), 'system'),
 ('/activity/calendar',     'ADMIN', 1, NOW(), 'system'),
 ('/activity/board',        'ADMIN', 1, NOW(), 'system'),
 ('/activity/list',         'ADMIN', 1, NOW(), 'system'),
 ('/activity/partner',      'ADMIN', 1, NOW(), 'system'),
 ('/tools/pdf',             'ADMIN', 1, NOW(), 'system'),
 ('/admin/active-users',    'ADMIN', 1, NOW(), 'system'),
 ('/admin/erp-sync',        'ADMIN', 1, NOW(), 'system'),
 ('/admin/closing',         'ADMIN', 1, NOW(), 'system'),
 ('/admin/common-codes',    'ADMIN', 1, NOW(), 'system'),
 ('/admin/users',           'ADMIN', 1, NOW(), 'system'),
 ('/admin/menu-permissions','ADMIN', 1, NOW(), 'system');

INSERT INTO menu_permission (menu_key, role, can_view, created_at, created_id)
SELECT m.menu_key, r.role, 1, NOW(), 'system'
  FROM (SELECT '/' AS menu_key
        UNION ALL SELECT '/info/sales-plan'
        UNION ALL SELECT '/activity/attention'
        UNION ALL SELECT '/deals'
        UNION ALL SELECT '/activity/calendar'
        UNION ALL SELECT '/activity/board'
        UNION ALL SELECT '/activity/list'
        UNION ALL SELECT '/activity/partner'
        UNION ALL SELECT '/tools/pdf') m
 CROSS JOIN (SELECT 'TEAM_LEADER' AS role
             UNION ALL SELECT 'MANAGER'
             UNION ALL SELECT 'SALES_SPT'
             UNION ALL SELECT 'PART_LEADER'
             UNION ALL SELECT 'EXECUTIVE'
             UNION ALL SELECT 'CENTER_LEADER'
             UNION ALL SELECT 'FINANCE'
             UNION ALL SELECT 'STAFF') r;

-- 월마감은 회계 업무라 FINANCE 에도 열어 둔다.
INSERT INTO menu_permission (menu_key, role, can_view, created_at, created_id)
VALUES ('/admin/closing', 'FINANCE', 1, NOW(), 'system');
