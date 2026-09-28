-- 관리자 > 채권연령분석 메뉴 (2026-09-28). sm_module 에서 개발한 것을 crm 으로 옮김.
-- 더존 채권원장(FI_BAN_MST) 기준 사업부별 미수채권 잔액·연령(30/60/90/120/121+) 대시보드.
-- 회계 정보라 관리자·회계(FINANCE)만 기본으로 켠다. 다른 역할은 관리자 > 권한 관리에서.
INSERT INTO menu_permission (menu_key, role, can_view, created_at, created_id)
VALUES ('/admin/receivable-aging', 'ADMIN',   1, NOW(), 'system'),
       ('/admin/receivable-aging', 'FINANCE', 1, NOW(), 'system');
