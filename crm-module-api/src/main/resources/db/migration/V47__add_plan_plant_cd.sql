-- order_mst / order_dtl 에 plan_plant_cd 컬럼 추가.
-- 엔티티에 @Column(name = "plan_plant_cd") 가 이미 존재하나 마이그레이션이 누락되어
-- native SELECT * 쿼리 시 Hibernate 컬럼 매핑 오류 → /api/orders 500 발생.
-- IF NOT EXISTS: 일부 환경에서 이미 컬럼이 존재할 경우 중복 에러 방지.
ALTER TABLE order_mst ADD COLUMN IF NOT EXISTS plan_plant_cd INT DEFAULT 2000;
ALTER TABLE order_dtl ADD COLUMN IF NOT EXISTS plan_plant_cd INT DEFAULT 2000;
