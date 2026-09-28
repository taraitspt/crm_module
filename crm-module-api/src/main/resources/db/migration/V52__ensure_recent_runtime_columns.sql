-- 최근 기능에서 런타임이 바로 참조하는 컬럼 보정.
-- 일부 운영/개발 DB에서 V46~V50을 수동 적용했거나 파일명이 바뀐 경우에도 서버 기동 시 누락 컬럼 500을 막는다.

ALTER TABLE order_mst ADD COLUMN IF NOT EXISTS plan_plant_cd INT DEFAULT 2000;
ALTER TABLE order_dtl ADD COLUMN IF NOT EXISTS plan_plant_cd INT DEFAULT 2000;

ALTER TABLE po_settle_mst ADD COLUMN IF NOT EXISTS tax_type VARCHAR(20) NOT NULL DEFAULT 'TAXABLE';
ALTER TABLE po_settle_dtl ADD COLUMN IF NOT EXISTS tax_amt BIGINT NOT NULL DEFAULT 0;

ALTER TABLE po_settle_mst ADD COLUMN IF NOT EXISTS purchase_type VARCHAR(20) NOT NULL DEFAULT 'TAX_INVOICE';
ALTER TABLE po_settle_mst ADD COLUMN IF NOT EXISTS card_approve_dt DATE NULL;
ALTER TABLE po_settle_mst ADD COLUMN IF NOT EXISTS card_approve_no VARCHAR(50) NULL;
ALTER TABLE po_settle_mst ADD COLUMN IF NOT EXISTS cash_approve_dt DATE NULL;
ALTER TABLE po_settle_mst ADD COLUMN IF NOT EXISTS cash_approve_no VARCHAR(50) NULL;
