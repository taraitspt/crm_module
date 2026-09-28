-- ============================================================
-- SM Module Schema V1 - Composite PK based design
-- ============================================================

-- 부서
CREATE TABLE departments (
    company_cd   INT          NOT NULL,
    dept_cd      INT          NOT NULL,
    dept_nm      VARCHAR(100) NOT NULL,
    up_dept_cd   INT          NULL,
    erp_dept_code VARCHAR(20) NULL,
    created_at   DATETIME     NULL,
    updated_at   DATETIME     NULL,
    created_id   VARCHAR(20)  NULL,
    updated_id   VARCHAR(20)  NULL,
    PRIMARY KEY (company_cd, dept_cd)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 사용자
CREATE TABLE users (
    company_cd   INT          NOT NULL,
    id           VARCHAR(20)  NOT NULL,
    employee_no  VARCHAR(20)  NOT NULL,
    password     VARCHAR(255) NOT NULL,
    name         VARCHAR(50)  NOT NULL,
    phone        VARCHAR(20)  NULL,
    email        VARCHAR(100) NULL,
    dept_cd      INT          NULL,
    role         VARCHAR(20)  NOT NULL DEFAULT 'STAFF',
    status       VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    created_at   DATETIME     NULL,
    updated_at   DATETIME     NULL,
    created_id   VARCHAR(20)  NULL,
    updated_id   VARCHAR(20)  NULL,
    PRIMARY KEY (company_cd, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 주문 마스터
CREATE TABLE order_mst (
    company_cd      INT          NOT NULL,
    plant_cd        INT          NOT NULL,
    order_no        VARCHAR(30)  NOT NULL,
    order_title     VARCHAR(200) NULL,
    partner_cd      VARCHAR(20)  NULL,
    partner_nm      VARCHAR(100) NULL,
    customer_nm     VARCHAR(100) NULL,
    sales_dept_cd   INT          NULL,
    sales_emp_no    VARCHAR(20)  NULL,
    rcv_emp_no      VARCHAR(20)  NULL,
    rcv_branch      VARCHAR(50)  NULL,
    tax_type_cd     VARCHAR(20)  DEFAULT 'TAXABLE',
    status_cd       VARCHAR(30)  DEFAULT 'PENDING',
    request_dt      DATETIME     NULL,
    received_dt     DATE         NULL,
    due_dt          DATE         NULL,
    note            TEXT         NULL,
    total_amt       BIGINT       DEFAULT 0,
    erp_order_no    VARCHAR(30)  NULL,
    erp_sync_status VARCHAR(20)  DEFAULT 'NONE',
    created_at      DATETIME     NULL,
    updated_at      DATETIME     NULL,
    created_id      VARCHAR(20)  NULL,
    updated_id      VARCHAR(20)  NULL,
    PRIMARY KEY (company_cd, plant_cd, order_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 주문 상세
CREATE TABLE order_dtl (
    company_cd   INT          NOT NULL,
    plant_cd     INT          NOT NULL,
    order_no     VARCHAR(30)  NOT NULL,
    order_sq     INT          NOT NULL,
    work_type    VARCHAR(30)  NULL,
    work_name    VARCHAR(200) NULL,
    quantity     INT          DEFAULT 0,
    note         TEXT         NULL,
    status_cd    VARCHAR(30)  DEFAULT 'PENDING',
    work_amt     BIGINT       DEFAULT 0,
    delivery_fee BIGINT       DEFAULT 0,
    design_fee   BIGINT       DEFAULT 0,
    discount     BIGINT       DEFAULT 0,
    payment_amt  BIGINT       DEFAULT 0,
    created_at   DATETIME     NULL,
    updated_at   DATETIME     NULL,
    created_id   VARCHAR(20)  NULL,
    updated_id   VARCHAR(20)  NULL,
    PRIMARY KEY (company_cd, plant_cd, order_no, order_sq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 주문 품목 정보
CREATE TABLE order_info (
    company_cd  INT          NOT NULL,
    plant_cd    INT          NOT NULL,
    order_no    VARCHAR(30)  NOT NULL,
    order_sq    INT          NOT NULL,
    info_sq     INT          NOT NULL,
    category    VARCHAR(30)  NULL,
    composition VARCHAR(200) NULL,
    item_name   VARCHAR(200) NULL,
    note        VARCHAR(500) NULL,
    quantity    INT          DEFAULT 0,
    unit_price  BIGINT       DEFAULT 0,
    subtotal    BIGINT       DEFAULT 0,
    PRIMARY KEY (company_cd, plant_cd, order_no, order_sq, info_sq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 주문 배송
CREATE TABLE order_dlv (
    company_cd INT          NOT NULL,
    plant_cd   INT          NOT NULL,
    order_no   VARCHAR(30)  NOT NULL,
    order_sq   INT          NOT NULL,
    dlv_sq     INT          NOT NULL,
    dlv_dt     DATE         NULL,
    dlv_qty    INT          DEFAULT 0,
    dlv_addr   VARCHAR(255) NULL,
    note       VARCHAR(500) NULL,
    status_cd  VARCHAR(20)  NULL,
    created_at DATETIME     NULL,
    updated_at DATETIME     NULL,
    created_id VARCHAR(20)  NULL,
    updated_id VARCHAR(20)  NULL,
    PRIMARY KEY (company_cd, plant_cd, order_no, order_sq, dlv_sq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 첨부파일
CREATE TABLE file_info (
    company_cd    INT          NOT NULL,
    plant_cd      INT          NOT NULL,
    file_id       VARCHAR(50)  NOT NULL,
    order_no      VARCHAR(30)  NULL,
    order_sq      INT          NULL,
    original_name VARCHAR(255) NULL,
    stored_name   VARCHAR(255) NULL,
    file_path     VARCHAR(500) NULL,
    file_size     BIGINT       DEFAULT 0,
    content_type  VARCHAR(100) NULL,
    created_at    DATETIME     NULL,
    updated_at    DATETIME     NULL,
    created_id    VARCHAR(20)  NULL,
    updated_id    VARCHAR(20)  NULL,
    PRIMARY KEY (company_cd, plant_cd, file_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 발주 마스터
CREATE TABLE po_mst (
    company_cd       INT          NOT NULL,
    plant_cd         INT          NOT NULL,
    po_no            VARCHAR(30)  NOT NULL,
    order_no         VARCHAR(30)  NULL,
    dept_cd          INT          NULL,
    work_title       VARCHAR(200) NULL,
    partner_cd       VARCHAR(20)  NULL,
    partner_nm       VARCHAR(100) NULL,
    order_amt        BIGINT       DEFAULT 0,
    po_amt           BIGINT       DEFAULT 0,
    sales_emp_no     VARCHAR(20)  NULL,
    po_emp_no        VARCHAR(20)  NULL,
    status_cd        VARCHAR(30)  DEFAULT 'PENDING',
    settle_status_cd VARCHAR(20)  DEFAULT 'UNSETTLED',
    delivery_dt      DATE         NULL,
    received_dt      DATE         NULL,
    erp_po_no        VARCHAR(30)  NULL,
    erp_sync_status  VARCHAR(20)  DEFAULT 'NONE',
    created_at       DATETIME     NULL,
    updated_at       DATETIME     NULL,
    created_id       VARCHAR(20)  NULL,
    updated_id       VARCHAR(20)  NULL,
    PRIMARY KEY (company_cd, plant_cd, po_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 발주 상세
CREATE TABLE po_dtl (
    company_cd INT          NOT NULL,
    plant_cd   INT          NOT NULL,
    po_no      VARCHAR(30)  NOT NULL,
    po_sq      INT          NOT NULL,
    work_name  VARCHAR(200) NULL,
    quantity   INT          DEFAULT 0,
    unit_price BIGINT       DEFAULT 0,
    amt        BIGINT       DEFAULT 0,
    note       VARCHAR(500) NULL,
    created_at DATETIME     NULL,
    updated_at DATETIME     NULL,
    created_id VARCHAR(20)  NULL,
    updated_id VARCHAR(20)  NULL,
    PRIMARY KEY (company_cd, plant_cd, po_no, po_sq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 정산 마스터
CREATE TABLE po_settle_mst (
    company_cd INT          NOT NULL,
    plant_cd   INT          NOT NULL,
    pos_no     VARCHAR(30)  NOT NULL,
    po_no      VARCHAR(30)  NULL,
    order_no   VARCHAR(30)  NULL,
    partner_cd VARCHAR(20)  NULL,
    partner_nm VARCHAR(100) NULL,
    total_amt  BIGINT       DEFAULT 0,
    status_cd  VARCHAR(20)  DEFAULT 'DRAFT',
    created_at DATETIME     NULL,
    updated_at DATETIME     NULL,
    created_id VARCHAR(20)  NULL,
    updated_id VARCHAR(20)  NULL,
    PRIMARY KEY (company_cd, plant_cd, pos_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 정산 상세
CREATE TABLE po_settle_dtl (
    company_cd      INT          NOT NULL,
    plant_cd        INT          NOT NULL,
    pos_no          VARCHAR(30)  NOT NULL,
    pos_sq          INT          NOT NULL,
    work_name       VARCHAR(200) NULL,
    vendor_name     VARCHAR(100) NULL,
    quantity        INT          DEFAULT 0,
    unit_price      BIGINT       DEFAULT 0,
    amt             BIGINT       DEFAULT 0,
    settle_status_cd VARCHAR(20) DEFAULT 'PENDING',
    created_at      DATETIME     NULL,
    updated_at      DATETIME     NULL,
    created_id      VARCHAR(20)  NULL,
    updated_id      VARCHAR(20)  NULL,
    PRIMARY KEY (company_cd, plant_cd, pos_no, pos_sq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 매출 마스터
CREATE TABLE sales_mst (
    company_cd      INT          NOT NULL,
    plant_cd        INT          NOT NULL,
    sales_no        VARCHAR(30)  NOT NULL,
    sales_title     VARCHAR(200) NULL,
    order_no        VARCHAR(30)  NULL,
    partner_cd      VARCHAR(20)  NULL,
    partner_nm      VARCHAR(100) NULL,
    tax_type_cd     VARCHAR(20)  NULL,
    sales_type      VARCHAR(20)  NULL,
    pay_type        VARCHAR(20)  NULL,
    sales_dt        DATE         NULL,
    total_amt       BIGINT       DEFAULT 0,
    dept_cd         INT          NULL,
    sales_emp_no    VARCHAR(20)  NULL,
    status_cd       VARCHAR(20)  DEFAULT 'DRAFT',
    confirmed       BOOLEAN      DEFAULT FALSE,
    confirmed_at    DATETIME     NULL,
    confirmed_id    VARCHAR(20)  NULL,
    slip_no         VARCHAR(30)  NULL,
    pay_email       VARCHAR(100) NULL,
    erp_bill_no     VARCHAR(30)  NULL,
    erp_sync_status VARCHAR(20)  DEFAULT 'NONE',
    note            TEXT         NULL,
    created_at      DATETIME     NULL,
    updated_at      DATETIME     NULL,
    created_id      VARCHAR(20)  NULL,
    updated_id      VARCHAR(20)  NULL,
    PRIMARY KEY (company_cd, plant_cd, sales_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 매출 상세
CREATE TABLE sales_dtl (
    company_cd INT          NOT NULL,
    plant_cd   INT          NOT NULL,
    sales_no   VARCHAR(30)  NOT NULL,
    sales_sq   INT          NOT NULL,
    item_nm    VARCHAR(200) NULL,
    quantity   INT          DEFAULT 0,
    unit_price BIGINT       DEFAULT 0,
    supply_amt BIGINT       DEFAULT 0,
    tax_amt    BIGINT       DEFAULT 0,
    total_amt  BIGINT       DEFAULT 0,
    note       VARCHAR(500) NULL,
    created_at DATETIME     NULL,
    updated_at DATETIME     NULL,
    created_id VARCHAR(20)  NULL,
    updated_id VARCHAR(20)  NULL,
    PRIMARY KEY (company_cd, plant_cd, sales_no, sales_sq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 목표 마스터 (파트 + AM 통합)
CREATE TABLE goal_mst (
    company_cd   INT         NOT NULL,
    plant_cd     INT         NOT NULL,
    plan_yy      VARCHAR(4)  NOT NULL,
    plan_mm      VARCHAR(2)  NOT NULL,
    dept_cd      VARCHAR(10) NOT NULL DEFAULT '',
    sales_emp_id VARCHAR(20) NOT NULL DEFAULT '',
    field_cd     VARCHAR(10) NOT NULL,
    goal_amt     BIGINT      NULL,
    actual_amt   BIGINT      NULL,
    note         VARCHAR(500) NULL,
    created_at   DATETIME    NULL,
    updated_at   DATETIME    NULL,
    created_id   VARCHAR(20) NULL,
    updated_id   VARCHAR(20) NULL,
    PRIMARY KEY (company_cd, plant_cd, plan_yy, plan_mm, dept_cd, sales_emp_id, field_cd)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 사업자(거래처) 마스터
CREATE TABLE business_owners (
    id                   BIGINT       NOT NULL AUTO_INCREMENT,
    company_cd           INT          NULL,
    partner_cd           VARCHAR(20)  NULL,
    company_name         VARCHAR(100) NOT NULL,
    biz_no               VARCHAR(20)  NULL,
    biz_type             VARCHAR(50)  NULL,
    biz_item             VARCHAR(50)  NULL,
    address              VARCHAR(255) NULL,
    representative_name  VARCHAR(50)  NULL,
    representative_email VARCHAR(100) NULL,
    representative_phone VARCHAR(20)  NULL,
    dept_cd              INT          NULL,
    created_at           DATETIME     NULL,
    updated_at           DATETIME     NULL,
    created_id           VARCHAR(20)  NULL,
    updated_id           VARCHAR(20)  NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ERP 동기화 로그
CREATE TABLE erp_sync_log (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    sync_type     VARCHAR(50)  NOT NULL,
    direction     VARCHAR(10)  NOT NULL,
    status        VARCHAR(20)  NOT NULL,
    total_count   INT          DEFAULT 0,
    success_count INT          DEFAULT 0,
    fail_count    INT          DEFAULT 0,
    error_message TEXT         NULL,
    started_at    DATETIME     NOT NULL,
    finished_at   DATETIME     NULL,
    created_at    DATETIME     NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ERP 품목 캐시
CREATE TABLE erp_items (
    id         BIGINT       NOT NULL AUTO_INCREMENT,
    item_code  VARCHAR(30)  NOT NULL UNIQUE,
    item_name  VARCHAR(200) NOT NULL,
    item_spec  VARCHAR(200) NULL,
    unit       VARCHAR(20)  NULL,
    use_yn     CHAR(1)      DEFAULT 'Y',
    synced_at  DATETIME     NOT NULL,
    created_at DATETIME     NOT NULL,
    updated_at DATETIME     NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_users_employee_no ON users (company_cd, employee_no);
CREATE INDEX idx_order_mst_received_dt ON order_mst (company_cd, plant_cd, received_dt);
CREATE INDEX idx_order_mst_partner_cd ON order_mst (company_cd, plant_cd, partner_cd);
CREATE INDEX idx_order_mst_erp_order_no ON order_mst (erp_order_no);
CREATE INDEX idx_po_mst_order_no ON po_mst (company_cd, plant_cd, order_no);
CREATE INDEX idx_po_mst_delivery_dt ON po_mst (company_cd, plant_cd, delivery_dt);
CREATE INDEX idx_sales_mst_sales_dt ON sales_mst (company_cd, plant_cd, sales_dt);
CREATE INDEX idx_sales_mst_erp_bill_no ON sales_mst (erp_bill_no);
CREATE INDEX idx_goal_mst_field ON goal_mst (company_cd, plant_cd, plan_yy, field_cd);
CREATE INDEX idx_biz_owner_company ON business_owners (company_cd, partner_cd);
