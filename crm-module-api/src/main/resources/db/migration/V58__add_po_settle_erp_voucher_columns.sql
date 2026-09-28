-- 매입전표(더존 구매송장 PP_INVOICE) 전송 결과 추적 컬럼.
-- 흐름: 깃고 승인완료(GITGO_APPROVED) → SM 에서 선택분만 매입전표 전송 →
--       성공 시 INVC_NO(송장번호)/전송시각 기록, statusCd=VOUCHER_SENT.
-- 각 ALTER 별도 statement(H2 MySQL 모드 호환), IF NOT EXISTS 로 멱등.

ALTER TABLE po_settle_mst ADD COLUMN IF NOT EXISTS erp_voucher_no VARCHAR(30) NULL COMMENT '더존 매입전표(구매송장) 번호 INVC_NO';
ALTER TABLE po_settle_mst ADD COLUMN IF NOT EXISTS erp_voucher_at DATETIME NULL COMMENT '매입전표 더존 전송 시각';
