-- ============================================================
-- V7: users / departments 테이블에 비용센터코드(cc_cd) 컬럼 추가
-- cc_cd: 비용센터코드 - 주문번호 자동생성(GOR+날짜+cc_cd+순번) 등에 사용
-- ============================================================
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS cc_cd VARCHAR(20) NULL
        COMMENT '비용센터코드' AFTER dept_cd;

ALTER TABLE departments
    ADD COLUMN IF NOT EXISTS cc_cd VARCHAR(20) NULL
        COMMENT '비용센터코드' AFTER erp_dept_code;
