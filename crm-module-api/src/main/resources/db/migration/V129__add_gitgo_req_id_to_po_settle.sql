-- 깃고 지출결의서 상신자(요청자) ReqID(o365 이메일)를 정산 마스터에 저장.
-- 기존엔 기안(GitgoDraftService.buildDrafts)에서 users.email 을 계산해 깃고로 전송만 하고 버려서,
-- 나중에 결재문서 보기(Interworking/Document.aspx?...&ReqID=<상신자 이메일>) 에 쓸 값을 되살릴 수 없었다.
-- 저장돼 있던 gitgo_approver(승인자)와는 다른 사람(상신자 ≠ 승인자)이라 별도 컬럼이 필요하다.
-- ★기존 상신 건은 이미 버려져 백필 불가 — 이 배선 이후 신규 상신부터 채워진다.
-- 운영에서 수동 ALTER 로 먼저 추가돼 있을 수 있어 IF NOT EXISTS 로 멱등 처리(중복 시 부팅 실패 방지).
ALTER TABLE po_settle_mst ADD COLUMN IF NOT EXISTS gitgo_req_id VARCHAR(100) NULL COMMENT '깃고 상신자 ReqID(o365 이메일)';
