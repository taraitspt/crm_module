-- V98: po_settle_mst 에 git_no(깃문서번호) 추가.
-- 깃고 승인완료 콜백(ApprovalStateRequest.GitNo, 예: CO-2607-00593)으로 받아 저장하고,
-- 매입전표 전달 시 더존 GWDOCU_NO 컬럼에 매핑한다.
ALTER TABLE po_settle_mst ADD COLUMN IF NOT EXISTS git_no VARCHAR(40) NULL COMMENT '깃문서번호(예: CO-2607-00593)';
