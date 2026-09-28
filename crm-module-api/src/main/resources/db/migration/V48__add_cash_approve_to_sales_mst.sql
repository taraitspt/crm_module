-- upstream 머지가 SalesMst 엔티티에 cashApproveDt / cashApproveNm 필드를 추가했으나
-- 해당 컬럼을 추가하는 Flyway 마이그레이션이 누락됐다. 그 결과 prod 처럼 ddl-auto 가
-- 없는 환경에서는 sales_mst 를 select 할 때마다
--   "Unknown column 'cash_approve_dt' in 'field list'"
-- 로 매출/세금계산서 전 조회가 500 으로 죽는다(2026-06-02 배포 장애). 컬럼 보강.
-- (H2 MySQL 모드 호환 위해 ADD COLUMN 은 ALTER 문을 분리한다.)
ALTER TABLE sales_mst ADD COLUMN IF NOT EXISTS cash_approve_dt DATE NULL COMMENT '현금영수증 승인일' AFTER card_approve_dt;
ALTER TABLE sales_mst ADD COLUMN IF NOT EXISTS cash_approve_nm VARCHAR(100) NULL COMMENT '현금영수증 승인자/상호' AFTER cash_approve_dt;
