-- 사내실적(INTERNAL) 매출 첨부파일용 — file_info 를 sales_mst.sales_no 로도 연결.
ALTER TABLE file_info ADD COLUMN sales_no VARCHAR(30) NULL;
CREATE INDEX ix_file_info_sales_no ON file_info (company_cd, plant_cd, sales_no);
