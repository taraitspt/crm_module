-- 깃고(Gitgo) 전자결재 연동 — 외주/구매 정산(매입) 결재상태 컬럼.
-- 흐름: SM[승인요청] → Interworking.aspx 기안 → 결재상태(D/DC/DLS/R/C) 를 깃고가 SM 인바운드
--       API(/api/webhooks/gitgo/approval-state)로 통지 → 아래 컬럼 갱신.
-- 각 ALTER 별도 statement(H2 MySQL 모드 호환), IF NOT EXISTS 로 멱등.

ALTER TABLE po_settle_mst ADD COLUMN IF NOT EXISTS gitgo_work_kind VARCHAR(30) NULL COMMENT '깃고 문서구분코드(WorkKind)';
ALTER TABLE po_settle_mst ADD COLUMN IF NOT EXISTS gitgo_appr_state VARCHAR(5) NULL COMMENT '깃고 결재상태(D/DC/DLS/R/C)';
ALTER TABLE po_settle_mst ADD COLUMN IF NOT EXISTS gitgo_approver VARCHAR(50) NULL COMMENT '깃고 결재 승인자';
ALTER TABLE po_settle_mst ADD COLUMN IF NOT EXISTS gitgo_appr_at DATETIME NULL COMMENT '깃고 결재상태 최종 통지 시각';
ALTER TABLE po_settle_mst ADD COLUMN IF NOT EXISTS gitgo_appr_requested_at DATETIME NULL COMMENT 'SM 승인요청(기안) 전송 시각';
ALTER TABLE po_settle_mst ADD COLUMN IF NOT EXISTS gitgo_doc_id VARCHAR(50) NULL COMMENT '깃고 전자결재 문서 식별자';

CREATE INDEX idx_po_settle_gitgo_appr_state ON po_settle_mst (gitgo_appr_state);
