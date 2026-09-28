-- ============================================================
-- SM Module Seed Data V2
-- ============================================================

-- 기본 부서
INSERT INTO departments (company_cd, dept_cd, dept_nm, up_dept_cd, created_at) VALUES
(1000, 1000, '대표이사', NULL, NOW()),
(1000, 1100, '영업1팀', 1000, NOW()),
(1000, 1200, '영업2팀', 1000, NOW()),
(1000, 1300, '경영지원팀', 1000, NOW()),
(1000, 1400, '디자인팀', 1000, NOW());

-- 관리자 계정 (password: admin123 - BCrypt encoded)
INSERT INTO users (company_cd, id, employee_no, password, name, phone, email, dept_cd, role, status, created_at) VALUES
(1000, 'admin', 'EMP001', '$2a$10$ufHrkdLDkpp0b75CwjAE0.5kD7aJefwXSDDP2d.fooHKap9e15cNa', '관리자', '010-0000-0000', 'admin@tara.com', 1000, 'ADMIN', 'ACTIVE', NOW());
