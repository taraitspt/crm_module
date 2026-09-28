-- V120: users.role ENUM에 CENTER_LEADER(센터장) 추가. 권한은 SALES_SPT 와 동일 취급.
-- 기존 값 순서는 그대로 두고 뒤에만 추가(저장된 값 재매핑 리스크 회피 — V96 패턴).
ALTER TABLE users
    MODIFY COLUMN role ENUM('ADMIN','EXECUTIVE','MANAGER','TEAM_LEADER','PART_LEADER','FINANCE','STAFF','SALES_SPT','CENTER_LEADER') NOT NULL;
