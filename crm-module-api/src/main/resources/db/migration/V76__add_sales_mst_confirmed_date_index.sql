-- AM별 실적 등 통계 쿼리: WHERE company_cd = ? AND confirmed = true AND sales_dt 범위.
-- 기존 idx_sales_mst_sales_dt(company_cd, plant_cd, sales_dt)는 plant_cd 미지정 시 sales_dt 범위를
-- 인덱스로 좁히지 못한다. 통계 WHERE 조건에 정확히 맞는 인덱스를 추가해 범위 스캔을 최적화한다.
CREATE INDEX idx_sales_mst_company_confirmed_dt ON sales_mst (company_cd, confirmed, sales_dt);
