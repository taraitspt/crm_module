-- V5: ERP 연동 컬럼 추가 및 동기화 로그/품목 테이블 생성

-- order_mst: ERP 연동 컬럼 추가
ALTER TABLE order_mst ADD COLUMN IF NOT EXISTS contact_email VARCHAR(100) NULL COMMENT '고객담당자 이메일';
ALTER TABLE order_mst ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(30) NULL COMMENT '고객담당자 연락처';
ALTER TABLE order_mst ADD COLUMN IF NOT EXISTS erp_order_no VARCHAR(30) NULL COMMENT 'ERP 주문번호(Oracle SD_ORDER_MST_X20329.ORDDOC_NO)';
ALTER TABLE order_mst ADD COLUMN IF NOT EXISTS erp_sync_status VARCHAR(20) NULL COMMENT 'ERP 동기화 상태(SYNCED/FAILED/PENDING)';

-- sales_mst: ERP 연동 컬럼 추가
ALTER TABLE sales_mst ADD COLUMN IF NOT EXISTS erp_bill_no VARCHAR(30) NULL COMMENT 'ERP 매출번호(Oracle SD_BILL_MST.BILLDOC_NO)';
ALTER TABLE sales_mst ADD COLUMN IF NOT EXISTS erp_sync_status VARCHAR(20) NULL COMMENT 'ERP 동기화 상태';

-- po_mst: ERP 연동 컬럼 추가
ALTER TABLE po_mst ADD COLUMN IF NOT EXISTS erp_po_no VARCHAR(30) NULL COMMENT 'ERP 발주번호(Oracle PU_PURORDER_MST.PURDOC_NO)';
ALTER TABLE po_mst ADD COLUMN IF NOT EXISTS erp_sync_status VARCHAR(20) NULL COMMENT 'ERP 동기화 상태';

-- erp_sync_log: ERP 동기화 이력 테이블
CREATE TABLE IF NOT EXISTS erp_sync_log (
    id            BIGINT        NOT NULL AUTO_INCREMENT,
    sync_type     VARCHAR(50)   NOT NULL COMMENT '동기화 유형(PARTNER/EMPLOYEE/ORDER/BILLING)',
    direction     VARCHAR(10)   NOT NULL COMMENT '방향(READ/WRITE)',
    status        VARCHAR(20)   NOT NULL COMMENT '상태(RUNNING/SUCCESS/PARTIAL/FAILED)',
    total_count   INT           NULL DEFAULT 0,
    success_count INT           NULL DEFAULT 0,
    fail_count    INT           NULL DEFAULT 0,
    error_message TEXT          NULL,
    started_at    DATETIME      NOT NULL,
    finished_at   DATETIME      NULL,
    created_at    DATETIME      NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_erp_sync_log_sync_type (sync_type),
    INDEX idx_erp_sync_log_status (status),
    INDEX idx_erp_sync_log_finished_at (finished_at)
);

-- erp_items: ERP 품목 테이블
CREATE TABLE IF NOT EXISTS erp_items (
    id          BIGINT        NOT NULL AUTO_INCREMENT,
    item_code   VARCHAR(30)   NOT NULL COMMENT 'ERP 품목코드',
    item_name   VARCHAR(200)  NOT NULL,
    item_spec   VARCHAR(200)  NULL,
    unit        VARCHAR(20)   NULL,
    use_yn      CHAR(1)       NOT NULL DEFAULT 'Y',
    synced_at   DATETIME      NOT NULL,
    created_at  DATETIME      NOT NULL,
    updated_at  DATETIME      NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_erp_items_code (item_code)
);
