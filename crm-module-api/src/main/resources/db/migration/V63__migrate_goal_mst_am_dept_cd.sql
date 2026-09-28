-- V63: AM 목표 레코드에 dept_cd 포함 (기존 빈값 레코드 재삽입)
-- dept_cd가 PK의 일부이므로 UPDATE 불가 → INSERT IGNORE(새 PK) 후 DELETE(구 PK)

-- 일반 AM 담당자 레코드: users.dept_cd 조회해서 재삽입
INSERT IGNORE INTO goal_mst (
    company_cd, plant_cd, plan_yy, plan_mm, dept_cd, sales_emp_id, field_cd,
    goal_amt, inner_amt, outer_amt, actual_amt, note,
    created_at, updated_at, created_id, updated_id
)
SELECT
    g.company_cd, g.plant_cd, g.plan_yy, g.plan_mm,
    COALESCE(CAST(u.dept_cd AS CHAR), ''),
    g.sales_emp_id, g.field_cd,
    g.goal_amt, g.inner_amt, g.outer_amt, g.actual_amt, g.note,
    g.created_at, g.updated_at, g.created_id, g.updated_id
FROM goal_mst g
LEFT JOIN users u ON u.employee_no = g.sales_emp_id AND u.company_cd = g.company_cd
WHERE g.field_cd = 'AM'
  AND (g.dept_cd = '' OR g.dept_cd IS NULL)
  AND g.sales_emp_id NOT LIKE 'DEPT_%';

-- 부서 가상행(DEPT_xxx): salesEmpId에서 dept 코드 추출해 재삽입
INSERT IGNORE INTO goal_mst (
    company_cd, plant_cd, plan_yy, plan_mm, dept_cd, sales_emp_id, field_cd,
    goal_amt, inner_amt, outer_amt, actual_amt, note,
    created_at, updated_at, created_id, updated_id
)
SELECT
    g.company_cd, g.plant_cd, g.plan_yy, g.plan_mm,
    SUBSTRING(g.sales_emp_id, 6),
    g.sales_emp_id, g.field_cd,
    g.goal_amt, g.inner_amt, g.outer_amt, g.actual_amt, g.note,
    g.created_at, g.updated_at, g.created_id, g.updated_id
FROM goal_mst g
WHERE g.field_cd = 'AM'
  AND (g.dept_cd = '' OR g.dept_cd IS NULL)
  AND g.sales_emp_id LIKE 'DEPT_%';

-- 구 레코드(dept_cd='') 삭제
DELETE FROM goal_mst
WHERE field_cd = 'AM'
  AND (dept_cd = '' OR dept_cd IS NULL);
