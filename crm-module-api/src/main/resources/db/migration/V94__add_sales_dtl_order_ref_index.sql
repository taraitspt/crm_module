CREATE INDEX idx_sales_dtl_order_ref
    ON sales_dtl (company_cd, plant_cd, order_no, order_sq, sales_no);
