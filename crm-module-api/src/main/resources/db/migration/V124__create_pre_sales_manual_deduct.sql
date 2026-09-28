-- 선매출 수동차감(매출/전표 미생성, 잔액만 차감·취소 가능). 선매출목록 상세에서 직접 차감.
-- pre_sales_no = 대상 선매출 매출번호(sales_mst.sales_no). 조인 대비 collation 을 sales_mst 와 동일하게 utf8mb4_unicode_ci.
CREATE TABLE IF NOT EXISTS pre_sales_manual_deduct (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    company_cd   INT          NOT NULL,
    plant_cd     INT          NOT NULL,
    pre_sales_no VARCHAR(30)  NOT NULL,
    deduct_amt   BIGINT       NOT NULL,
    memo         VARCHAR(500) NULL,
    created_at   DATETIME     NULL,
    updated_at   DATETIME     NULL,
    created_id   VARCHAR(20)  NULL,
    updated_id   VARCHAR(20)  NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_psmd_pre_sales_no ON pre_sales_manual_deduct (company_cd, pre_sales_no);
