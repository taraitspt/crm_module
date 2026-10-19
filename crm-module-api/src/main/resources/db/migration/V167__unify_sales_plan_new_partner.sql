-- 월매출계획 신규 목표 = 담당자당 가상 거래처 'NEW'("신규(목표)") 한 줄로 통일 (사용자 결정 2026-10-19)
-- 신규 목표가 여러 줄(NEW2, NEW-UZ …)이면 신규 거래처 매출을 어느 줄에 붙일지 알 수 없어서 하나로 몬다.
-- 실적은 매출현황에서 "그 담당자가 올린, 그해 계획에 없는 거래처 매출"로 붙는다(SalesPlanService.getStatus).
-- E33735 '기타거래처'(ERP 실제 거래처)는 건드리지 않는다(사용자 결정).

-- 1) NEW 가 아닌 NEW… 줄 금액을 담당자·월별로 NEW 줄에 더한다(없으면 만든다)
INSERT INTO sales_plan (company_cd, plan_yy, plan_mm, sales_emp_id, partner_cd, dept_cd, partner_nm,
                        labor_amt, paper_amt, created_at, created_id)
SELECT company_cd, plan_yy, plan_mm, sales_emp_id, 'NEW', MAX(dept_cd), '신규(목표)',
       SUM(labor_amt), SUM(paper_amt), NOW(), 'flyway'
  FROM sales_plan
 WHERE partner_cd LIKE 'NEW%' AND partner_cd <> 'NEW'
 GROUP BY company_cd, plan_yy, plan_mm, sales_emp_id
ON DUPLICATE KEY UPDATE labor_amt  = labor_amt + VALUES(labor_amt),
                        paper_amt  = paper_amt + VALUES(paper_amt),
                        updated_at = NOW(),
                        updated_id = 'flyway';

-- 2) 옮긴 줄 삭제
DELETE FROM sales_plan WHERE partner_cd LIKE 'NEW%' AND partner_cd <> 'NEW';

-- 3) 이름 통일
UPDATE sales_plan SET partner_nm = '신규(목표)' WHERE partner_cd = 'NEW' AND (partner_nm IS NULL OR partner_nm <> '신규(목표)');
