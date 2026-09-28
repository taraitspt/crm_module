-- PR-32b 정정 — 시트 의도 재확인 결과 외주거래처는 작업사양 단위(PoDtl) 가 아니라
--   세부품목(PoInfo: 인쇄/표지/내지/봉투 등) 단위. PR-32a 의 po_dtl 컬럼은 잘못된 위치.
--   po_info 로 이동.
-- 별도 ALTER TABLE 으로 분리 — H2 MySQL-mode 호환.
ALTER TABLE po_dtl  DROP COLUMN partner_cd;
ALTER TABLE po_dtl  DROP COLUMN partner_nm;
ALTER TABLE po_info ADD COLUMN partner_cd VARCHAR(20);
ALTER TABLE po_info ADD COLUMN partner_nm VARCHAR(100);
