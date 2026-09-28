ALTER TABLE sales_mst
    ADD COLUMN pre_sales_no VARCHAR(30) NULL COMMENT '차감 대상 선매출번호',
    ADD COLUMN pre_sales_deduct_amt BIGINT NOT NULL DEFAULT 0 COMMENT '선매출 차감금액';
