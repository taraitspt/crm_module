-- 관리자 > 월마감 관리 · 공통코드 관리 메뉴 제거 (2026-10-06, 사용자 결정 — 쓰지 않음).
-- 화면·API 코드는 남기고(라우트·메뉴만 주석) 카탈로그에서 빼므로 권한 행도 정리한다. 되살릴 땐 MenuCatalog 에 다시 넣고 권한 관리에서 켠다.
DELETE FROM menu_permission WHERE menu_key IN ('/admin/closing', '/admin/common-codes');
