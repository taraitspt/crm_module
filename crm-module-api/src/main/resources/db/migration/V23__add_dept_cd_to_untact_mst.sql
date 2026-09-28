-- 시트 #2 권한관리 — 비대면결제 목록을 사용자 부서 기준으로 필터링하기 위한 컬럼.
-- 등록 시점에 첫 주문의 OrderMst.salesDeptCd 를 복사 저장한다. NULL 허용 (기존 데이터 보존).
ALTER TABLE untact_mst ADD COLUMN dept_cd INT NULL COMMENT '영업부서 코드 (권한 필터)';
CREATE INDEX idx_untact_mst_dept_cd ON untact_mst (company_cd, plant_cd, dept_cd);
