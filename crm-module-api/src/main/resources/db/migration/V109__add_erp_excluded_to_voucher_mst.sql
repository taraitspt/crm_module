ALTER TABLE voucher_mst
    ADD COLUMN erp_excluded BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'ERP 전표연동 제외 여부';

