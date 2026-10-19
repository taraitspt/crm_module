-- V166: 매출관리 › 전년 대비 매출 메뉴 (2026-10-19). 계획 없이 순수 매출을 작년 같은 달과 비교하는 ERP 조회 화면.
-- 보이는 역할은 매출현황(계획 대비, 메뉴 키 '/')과 같게 — 지금 '/' 의 설정을 그대로 복사한다. 바꾸려면 관리자 > 권한 관리에서.
INSERT INTO menu_permission (menu_key, role, can_view, created_at, created_id)
SELECT '/stats/sales-yoy', p.role, p.can_view, NOW(), 'system'
  FROM menu_permission p
 WHERE p.menu_key = '/'
   AND NOT EXISTS (SELECT 1 FROM menu_permission q WHERE q.menu_key = '/stats/sales-yoy' AND q.role = p.role);
