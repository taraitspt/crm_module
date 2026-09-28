ALTER TABLE order_mst
    ADD COLUMN expected_sales_ym VARCHAR(6) NULL COMMENT '예상매출년월' AFTER rcv_branch;
