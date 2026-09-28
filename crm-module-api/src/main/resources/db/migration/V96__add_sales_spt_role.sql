-- V96: users.role ENUM에 SALES_SPT(영업지원) 추가.
-- 기존 값 순서는 그대로 두고 뒤에만 추가(저장된 값 재매핑 리스크 회피).
ALTER TABLE users
    MODIFY COLUMN role ENUM('ADMIN','EXECUTIVE','MANAGER','TEAM_LEADER','PART_LEADER','FINANCE','STAFF','SALES_SPT') NOT NULL;
