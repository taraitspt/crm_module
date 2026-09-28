-- 홈 대시보드 / 통합실적의 매출 집계 쿼리는 매출(sales_mst) 한 건마다 아래 상관 서브쿼리를 돈다:
--   EXISTS (SELECT 1 FROM order_mst o
--           WHERE o.company_cd = s.company_cd AND o.plant_cd = s.plant_cd
--             AND o.plan_plant_cd = 2000
--             AND FIND_IN_SET(o.order_no, REPLACE(s.order_no, ' ', '')) > 0)
--
-- 기존 order_mst 인덱스(received_dt / partner_cd / erp_order_no)와 PK(company_cd, plant_cd, order_no)에는
-- plan_plant_cd 가 없어, (company_cd, plant_cd) PK 프리픽스로 해당 회사/공장의 '모든' 주문을 훑고
-- plan_plant_cd 판별을 위해 행까지 들여다봤다 → 매출 건수 × 주문 건수의 문자열 매칭 비용.
--
-- 아래 커버링 인덱스는:
--   (company_cd, plant_cd, plan_plant_cd) 로 plan_plant_cd=2000 구간만 좁혀 seek + order_no 를 인덱스에서 바로 읽어
--   FIND_IN_SET / (SELECT 1) EXISTS 를 테이블 접근 없이 커버 → 서브쿼리 비용 대폭 감소.
--
-- ※ 인덱스는 성능만 개선하며 어떤 쿼리의 '결과'도 바꾸지 않는다(순수 부가 인덱스). order_mst 쓰기 시
--   인덱스 1개 유지 비용만 추가되나, 주문 입력은 ERP sync(시간당)/수기라 빈도가 낮아 영향 미미.
CREATE INDEX IF NOT EXISTS idx_order_mst_plan_plant_order
    ON order_mst (company_cd, plant_cd, plan_plant_cd, order_no);
