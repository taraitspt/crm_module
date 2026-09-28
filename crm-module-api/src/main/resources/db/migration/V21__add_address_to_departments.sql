-- 시트 #1 0504_1 — 견적서 발신자 주소 매핑에 사용. 부서별 주소를 보관한다.
-- 우편번호 + 기본주소 + 상세주소. NULL 허용 (기존 데이터 보존).
ALTER TABLE departments ADD COLUMN address_zip   VARCHAR(10)  NULL COMMENT '부서 주소 우편번호';
ALTER TABLE departments ADD COLUMN address_line1 VARCHAR(200) NULL COMMENT '부서 기본주소';
ALTER TABLE departments ADD COLUMN address_line2 VARCHAR(200) NULL COMMENT '부서 상세주소';
