-- 공통코드에 내부/외부 구분 컬럼. 작업처(group_cd='JOB_TYPE') 코드에 I(내부)/O(외부) 지정.
ALTER TABLE common_code ADD COLUMN wrk_div CHAR(1) NULL COMMENT '내부/외부 구분 (I=내부, O=외부) — 작업처(JOB_TYPE)용';

-- 작업처 내/외부 세팅: 기본 내부(I), 외부 작업처(전체외주/패키지/상품구매/P&D/VMD)만 O.
UPDATE common_code SET wrk_div = 'I'
WHERE group_cd = 'JOB_TYPE' AND wrk_div IS NULL;

UPDATE common_code SET wrk_div = 'O'
WHERE group_cd = 'JOB_TYPE' AND code IN ('G0600', 'G0601', 'G9999', 'S001', 'S002');
