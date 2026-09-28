-- 매입방식(purchase_type) + 카드승인 필드 추가
-- purchase_type: TAX_INVOICE(전자세금계산서, default), CARD(카드)
ALTER TABLE po_settle_mst ADD COLUMN purchase_type VARCHAR(20) NOT NULL DEFAULT 'TAX_INVOICE';
ALTER TABLE po_settle_mst ADD COLUMN card_approve_dt DATE NULL;
ALTER TABLE po_settle_mst ADD COLUMN card_approve_no VARCHAR(50) NULL;