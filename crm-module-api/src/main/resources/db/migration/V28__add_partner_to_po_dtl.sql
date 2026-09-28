-- 시트 (Critical High-2, 2026-05-19) — 외주발주의 작업사양별로 외주거래처가 다를 수 있음.
--   기존: PoMst.partnerCd/partnerNm (한 PO 당 한 거래처)
--   변경: PoDtl 에 partner 추가하여 작업사양마다 다른 거래처 지정 가능.
--   기존 데이터는 NULL → 외주발주목록에서 PoMst.partnerNm fallback.
-- 별도 ALTER TABLE 으로 분리 — H2 MySQL-mode 호환.
ALTER TABLE po_dtl ADD COLUMN partner_cd VARCHAR(20);
ALTER TABLE po_dtl ADD COLUMN partner_nm VARCHAR(100);
