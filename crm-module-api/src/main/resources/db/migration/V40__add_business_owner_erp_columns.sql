-- 시트 5/13 — 세금계산서발행 거래처 자동매핑을 위해 ERP CI_PARTNER_MST/MA_PARTNER_MST/MA_PARTNER_PTR
-- 에서 가져오는 데이터를 SM business_owners 에도 저장. UI 표출은 하지 않고 DB 보관 용도.
-- 각 ALTER 를 별도 statement 로 분리 — MySQL 모드 H2 가 comma-joined ADD COLUMN 을 파싱 못 함.

ALTER TABLE business_owners ADD COLUMN post_no VARCHAR(20);
ALTER TABLE business_owners ADD COLUMN dtl_addr2 VARCHAR(255);
ALTER TABLE business_owners ADD COLUMN subo_no VARCHAR(20);
ALTER TABLE business_owners ADD COLUMN asgnr_tel_no VARCHAR(50);
ALTER TABLE business_owners ADD COLUMN asgnr_dept_nm VARCHAR(100);
