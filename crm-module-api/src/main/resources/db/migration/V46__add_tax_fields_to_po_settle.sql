-- 외주정산 과세구분(taxType) + 세액(taxAmt) 컬럼 추가
-- 과세구분: TAXABLE(과세, default), ZERO_RATE(영세), EXEMPT(면세)
ALTER TABLE po_settle_mst ADD COLUMN tax_type VARCHAR(20) NOT NULL DEFAULT 'TAXABLE';
ALTER TABLE po_settle_dtl ADD COLUMN tax_amt BIGINT NOT NULL DEFAULT 0;
