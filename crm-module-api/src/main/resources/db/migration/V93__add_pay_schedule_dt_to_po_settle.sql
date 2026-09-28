-- 깃고 승인완료 콜백으로 전달받는 지급예정일 저장.
-- Gitgo 가 결재상태전달(승인완료) 시 PayScheduleDt 를 함께 보내면 해당 정산건에 업데이트한다.
ALTER TABLE po_settle_mst ADD COLUMN IF NOT EXISTS pay_schedule_dt DATE NULL COMMENT '지급예정일(깃고 승인완료 콜백 전달)';
