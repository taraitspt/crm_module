-- 채권연령분석(/admin/receivable-aging)을 정보관리 메뉴로 옮긴 김에(2026-10-15) 월매출계획과 같은 역할에게 연다(사용자: "매니저들도 보게").
-- 지금까지는 ADMIN·FINANCE 만 켜져 있었다. 월매출계획(/info/sales-plan)이 켜진 역할마다 같이 켠다. 이후 조정은 관리자 > 권한 관리에서.
INSERT INTO menu_permission (menu_key, role, can_view, created_at, created_id)
SELECT '/admin/receivable-aging', p.role, 1, NOW(), 'system'
  FROM menu_permission p
 WHERE p.menu_key = '/info/sales-plan' AND p.can_view = 1
ON DUPLICATE KEY UPDATE can_view = 1, updated_at = NOW(), updated_id = 'system';
