-- 시트 #1 (2026-05-18) — ERP 거래처 동기화 시 representative_name 컬럼 50 자 초과
--   data truncation 으로 sync 전체가 500 으로 실패. 대표자명/이메일/전화번호 길이를
--   ERP 마스터에 맞춰 확장.
-- 별도 ALTER TABLE 으로 분리 — H2 MySQL-mode 가 multi-column ALTER 를 파싱 못 함.
ALTER TABLE business_owners MODIFY COLUMN representative_name  VARCHAR(200);
ALTER TABLE business_owners MODIFY COLUMN representative_email VARCHAR(200);
ALTER TABLE business_owners MODIFY COLUMN representative_phone VARCHAR(50);
