-- sales_plan 정렬규칙 정렬 — V135 가 DB 기본값(utf8mb4_general_ci)으로 생성됐는데,
-- users/departments 등 기존 테이블은 utf8mb4_unicode_ci 라서
-- sales_plan.sales_emp_id = users.id 조인이 "Illegal mix of collations" 로 실패했다.
ALTER TABLE sales_plan CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
