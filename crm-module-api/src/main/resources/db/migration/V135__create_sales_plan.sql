-- 월매출계획 (부서·영업담당자·거래처별 공임/용지 월 금액) — 2026-09-18 CRM 신규.
-- 기존 goal_mst(부서/AM 월목표)를 대체한다. 담당자는 users.id, 거래처는 ERP 거래처코드.
CREATE TABLE sales_plan (
    company_cd   INT          NOT NULL DEFAULT 1000,
    plan_yy      VARCHAR(4)   NOT NULL,
    plan_mm      VARCHAR(2)   NOT NULL,
    sales_emp_id VARCHAR(20)  NOT NULL COMMENT '영업담당자 (users.id)',
    partner_cd   VARCHAR(20)  NOT NULL COMMENT 'ERP 거래처코드 (CI_PARTNER_MST.PARTNER_CD)',
    dept_cd      INT          NULL COMMENT '저장 시점 담당자 부서 (departments.dept_cd)',
    partner_nm   VARCHAR(200) NULL COMMENT '저장 시점 거래처명 (표시용 스냅샷)',
    labor_amt    BIGINT       NOT NULL DEFAULT 0 COMMENT '공임 계획금액',
    paper_amt    BIGINT       NOT NULL DEFAULT 0 COMMENT '용지 계획금액',
    created_at   DATETIME     NULL,
    updated_at   DATETIME     NULL,
    created_id   VARCHAR(20)  NULL,
    updated_id   VARCHAR(20)  NULL,
    PRIMARY KEY (company_cd, plan_yy, plan_mm, sales_emp_id, partner_cd)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='월매출계획';

CREATE INDEX idx_sales_plan_yy_dept ON sales_plan (company_cd, plan_yy, dept_cd);
CREATE INDEX idx_sales_plan_yy_partner ON sales_plan (company_cd, plan_yy, partner_cd);
