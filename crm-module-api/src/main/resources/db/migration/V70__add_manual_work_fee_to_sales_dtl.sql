ALTER TABLE sales_dtl
    ADD COLUMN manual_work_fee BIGINT NOT NULL DEFAULT 0 AFTER design_fee;
