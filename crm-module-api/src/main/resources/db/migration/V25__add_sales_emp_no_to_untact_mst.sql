-- 시트 5/13 — 비대면결제등록 화면의 영업담당자 필터(PR-6.2)용 컬럼.
-- PR-6.2 hotfix(b1d5355)에서 UntactMst 에 salesEmpNo 컬럼이 없어 해당 필터를
-- 제거했었음. 이 컬럼 추가 후 UntactMstRepository.search 의 salesEmpNos 필터 복원.
-- createBulk 시 첫 주문의 OrderMst.salesEmpNo 가 복사된다.
ALTER TABLE untact_mst ADD COLUMN sales_emp_no VARCHAR(20) NULL COMMENT '영업담당자 사번 (첫 주문에서 복사)';
