ALTER TABLE sales_mst
    ADD COLUMN partner_contact_name VARCHAR(100) NULL COMMENT '거래처담당자명' AFTER partner_nm;
