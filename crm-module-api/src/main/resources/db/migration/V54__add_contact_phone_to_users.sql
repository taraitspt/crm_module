-- V54: users 테이블에 사무실 연락처(contact_phone) 컬럼 추가.
-- 기존 phone 은 휴대폰 번호, contact_phone 은 사무실/직통 번호로 구분.
ALTER TABLE users ADD COLUMN contact_phone VARCHAR(20) NULL COMMENT '사무실 연락처';
