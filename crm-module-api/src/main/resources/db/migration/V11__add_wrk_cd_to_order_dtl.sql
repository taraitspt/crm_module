-- Bug #2: order_dtl에 ERP 작업처 코드(MA_CODEDTL Z021_20329) 컬럼 추가
ALTER TABLE order_dtl ADD COLUMN wrk_cd VARCHAR(10) NULL AFTER work_name;
