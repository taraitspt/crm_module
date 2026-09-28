-- 시트 #1 0504 — 사원 직책(파트장/팀장/사원 등) 컬럼 추가.
-- 견적서 발신자 정보의 담당자 표시("주인돈 파트장" 같은 형태)에 사용된다. NULL 허용.
ALTER TABLE users ADD COLUMN job_title VARCHAR(50) NULL COMMENT '직책 (예: 파트장, 팀장, 사원)';
