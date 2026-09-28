-- Purchase settlement: support CASH_RECEIPT purchase type.
-- purchase_type already uses VARCHAR(20), so only approval fields are added here.
ALTER TABLE po_settle_mst ADD COLUMN cash_approve_dt DATE NULL AFTER card_approve_no;
ALTER TABLE po_settle_mst ADD COLUMN cash_approve_no VARCHAR(50) NULL AFTER cash_approve_dt;
