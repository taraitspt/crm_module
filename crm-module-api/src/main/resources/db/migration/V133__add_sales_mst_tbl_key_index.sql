-- 세금계산서 통합발행 묶음 조회용 (2026-09-04).
--   tbl_key(더존 매출전표 키)는 통합발행 시 묶인 매출들이 공유하는 그룹 식별키인데 인덱스가 없어
--   묶음 조회(findByTblKey / countByTblKeys)마다 sales_mst 전체를 훑었다. wehago_no_tax 는 V42 에 인덱스가 있다.
-- ※ 순수 부가 인덱스 — 결과를 바꾸지 않는다. 재실행 안전을 위해 IF NOT EXISTS (MariaDB).
CREATE INDEX IF NOT EXISTS idx_sales_mst_tbl_key ON sales_mst (company_cd, plant_cd, tbl_key);
