-- V68: 깃고 지출결의서 전표 테이블 생성 + po_settle_mst 연결 컬럼 추가

CREATE TABLE voucher_mst (
    company_cd          INT            NOT NULL,
    plant_cd            INT            NOT NULL,
    tbl_key             VARCHAR(30)    NOT NULL        COMMENT 'SM 문서번호',   -- tbl key 채번생성규칙 1000-2000-PO20260600001(매입), 1000-2000-SO20260600001(매출)    / company_cd-plant_cd-매입 연 월 00001(시퀀스 5자리까지)
    work_kind           VARCHAR(30)    NULL            COMMENT '문서구분코드',
    slip_no             VARCHAR(30)    NULL            COMMENT 'ERP 전표번호',
    voucher_type        VARCHAR(30)    NOT NULL        COMMENT 'PUR:매입, SLS:매출',

    -- 기안 작성자
    wrt_dept_cd         VARCHAR(30)    NULL            COMMENT '기안부서코드',
    wrt_dept_nm         VARCHAR(30)    NULL            COMMENT '기안부서명',
    writer_id           VARCHAR(20)    NULL            COMMENT '작성사원 ID',
    writer_nm           VARCHAR(50)    NULL            COMMENT '작성사원명',
    wrt_dt              DATE           NULL            COMMENT '기안일자',

    -- 전표
    settled_dt          DATE           NULL            COMMENT '회계일자',

    -- 제목
    title               VARCHAR(100)   NULL            COMMENT '제목',

    -- 거래처 (대표)
    partner_cd          VARCHAR(20)    NULL            COMMENT '거래처코드',
    partner_nm          VARCHAR(100)   NULL            COMMENT '거래처명',

    -- 금액
    dr_total_amt        BIGINT         NOT NULL DEFAULT 0 COMMENT '차변합계',
    cr_total_amt        BIGINT         NOT NULL DEFAULT 0 COMMENT '대변합계',

    -- 깃고 전자결재
    approval_state      VARCHAR(5)     NULL            COMMENT 'D/DC/DLS/R/C',
    approver            VARCHAR(50)    NULL            COMMENT '승인자',
    approver_at         DATETIME       NULL            COMMENT '승인일자',

    -- ERP 전표 전송 결과
    erp_voucher_status  VARCHAR(20)    NULL DEFAULT 'NONE' COMMENT 'NONE/PENDING/SUCCESS/FAILED',
    erp_voucher_at      DATETIME       NULL            COMMENT 'ERP 전표 전송일시',

    -- audit
    created_at          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_id          VARCHAR(20)    NULL,
    updated_id          VARCHAR(20)    NULL,

    PRIMARY KEY (company_cd, plant_cd, tbl_key)
);

CREATE INDEX idx_voucher_mst_approval_state ON voucher_mst (approval_state);
CREATE INDEX idx_voucher_mst_settled_dt     ON voucher_mst (settled_dt);

CREATE TABLE voucher_dtl (
    company_cd          INT            NOT NULL        COMMENT '회사코드',
    plant_cd            INT            NOT NULL        COMMENT '사업장코드',
    tbl_key             VARCHAR(30)    NOT NULL        COMMENT 'SM 문서번호',
    vos_sq              INT            NOT NULL        COMMENT '순번',
    line_type           VARCHAR(20)    NOT NULL        COMMENT 'VATSUB:부가세대급금 / OUTSRC:외주가공비 / PAYABLE:국내외상매입금 / ETC:기타',

    -- 계정
    accnt_cd            VARCHAR(20)    NULL            COMMENT '계정코드',          -- 13500/53300/25101
    accnt_nm            VARCHAR(100)   NULL            COMMENT '계정과목명',        -- 부가세대급금/외주가공비/국내외상매입금

    -- 거래처 (라인별)
    partner_cd          VARCHAR(20)    NULL            COMMENT '거래처코드',
    partner_nm          VARCHAR(100)   NULL            COMMENT '거래처명',
    partner_biz_no      VARCHAR(30)    NULL            COMMENT '사업자등록번호',

    -- 사업장 / 회계
    biz_cd              VARCHAR(30)    NULL            COMMENT '사업장코드',        -- 9000 고정
    biz_place           VARCHAR(30)    NULL            COMMENT '사업장명',          -- 그래픽스사업본부 고정
    tax_code            VARCHAR(30)    NULL            COMMENT '세무코드',          -- 21/28/23
    tax_type            VARCHAR(30)    NULL            COMMENT '세무구분',          -- 과세매입/현금영수증매입/면세매입
    reason_type         VARCHAR(30)    NULL            COMMENT '사유구분',          -- 빈값 고정
    act_cd              VARCHAR(30)    NULL            COMMENT '회계단위코드',      -- 9000 고정
    act_unit            VARCHAR(30)    NULL            COMMENT '회계단위명',        -- 그래픽스사업본부 고정
    cost_cd             VARCHAR(30)    NULL            COMMENT '비용센터코드',      -- departments.erp_dept_cd의 cc_cd값
    cost_center         VARCHAR(30)    NULL            COMMENT '비용센터명',        -- departments.dept_nm

    -- 지급
    due_dt              DATE           NULL            COMMENT '지급예정일',
    bank_nm             VARCHAR(50)    NULL            COMMENT '은행명',
    bank_accnt_holder   VARCHAR(100)   NULL            COMMENT '예금주',
    bank_accnt          VARCHAR(50)    NULL            COMMENT '계좌번호',

    -- 금액
    dr_amt              BIGINT         NOT NULL DEFAULT 0 COMMENT '차변',
    cr_amt              BIGINT         NOT NULL DEFAULT 0 COMMENT '대변',

    -- 적요
    etc_name            VARCHAR(200)   NULL            COMMENT '적요',

    PRIMARY KEY (company_cd, plant_cd, tbl_key, vos_sq),
    CONSTRAINT fk_voucher_dtl_mst
        FOREIGN KEY (company_cd, plant_cd, tbl_key)
        REFERENCES voucher_mst (company_cd, plant_cd, tbl_key)
);

-- po_settle_mst: 전표 연결 컬럼 추가
ALTER TABLE po_settle_mst
    ADD COLUMN tbl_key VARCHAR(30) NULL COMMENT '연결된 voucher_mst.tbl_key';

-- sales_mst: 전표 연결 컬럼 추가
ALTER TABLE sales_mst
    ADD COLUMN tbl_key VARCHAR(30) NULL COMMENT '연결된 voucher_mst.tbl_key';
