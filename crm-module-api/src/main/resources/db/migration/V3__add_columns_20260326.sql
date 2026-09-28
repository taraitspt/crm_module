-- ============================================================
-- V3: 2026.03.26 ~ 04.06 테이블 컬럼 추가
-- ============================================================

-- 1. order_mst: 주문구분, ERP주문번호 추가
ALTER TABLE order_mst ADD COLUMN wrk_fg VARCHAR(20) NULL COMMENT '주문구분(202:국내영업,400:품질관리,401:샘플/가제본)' AFTER erp_order_no;
ALTER TABLE order_mst ADD COLUMN erp_no VARCHAR(30) NULL COMMENT 'ERP주문번호' AFTER wrk_fg;

-- 2. order_info: 구매거래처코드 추가
ALTER TABLE order_info ADD COLUMN ord_partner_cd VARCHAR(20) NULL COMMENT '구매거래처코드' AFTER subtotal;

-- 3. po_mst: 입고요청일 추가
ALTER TABLE po_mst ADD COLUMN in_delivery_dt DATETIME NULL COMMENT '입고요청일' AFTER delivery_dt;

-- 4. po_dtl: 구분/구성/작업코드/페이지/인쇄도수 추가
ALTER TABLE po_dtl ADD COLUMN po_item_type VARCHAR(30) NULL COMMENT '구분(용지,원자재 등)' AFTER note;
ALTER TABLE po_dtl ADD COLUMN po_config_cd VARCHAR(30) NULL COMMENT '구성' AFTER po_item_type;
ALTER TABLE po_dtl ADD COLUMN po_work_cd VARCHAR(30) NULL COMMENT '작업코드(작업명표기)' AFTER po_config_cd;
ALTER TABLE po_dtl ADD COLUMN po_page_cnt INT NULL COMMENT '페이지수' AFTER po_work_cd;
ALTER TABLE po_dtl ADD COLUMN po_print_front INT NULL COMMENT '인쇄도수(전면)' AFTER po_page_cnt;
ALTER TABLE po_dtl ADD COLUMN po_print_back INT NULL COMMENT '인쇄도수(후면)' AFTER po_print_front;

-- 5. sales_mst: 부서/카드/세금계산서 관련 컬럼 추가
ALTER TABLE sales_mst ADD COLUMN sales_dept_cd VARCHAR(20) NULL COMMENT '영업담당부서코드' AFTER dept_cd;
ALTER TABLE sales_mst ADD COLUMN sales_dept_nm VARCHAR(100) NULL COMMENT '영업담당부서명(히스토리)' AFTER sales_dept_cd;
ALTER TABLE sales_mst ADD COLUMN card_company_cd VARCHAR(20) NULL COMMENT '카드사코드' AFTER note;
ALTER TABLE sales_mst ADD COLUMN card_no VARCHAR(50) NULL COMMENT '카드번호' AFTER card_company_cd;
ALTER TABLE sales_mst ADD COLUMN card_approve_no VARCHAR(50) NULL COMMENT '카드승인번호' AFTER card_no;
ALTER TABLE sales_mst ADD COLUMN card_approve_dt DATETIME NULL COMMENT '카드승인일시' AFTER card_approve_no;
ALTER TABLE sales_mst ADD COLUMN devide_month INT NULL COMMENT '할부개월' AFTER card_approve_dt;
ALTER TABLE sales_mst ADD COLUMN pg_txn_id VARCHAR(50) NULL COMMENT 'PG사거래ID' AFTER devide_month;
ALTER TABLE sales_mst ADD COLUMN tax_no VARCHAR(50) NULL COMMENT '전자세금계산서번호' AFTER pg_txn_id;

-- 6. sales_dtl: 참조선매출 컬럼 추가
ALTER TABLE sales_dtl ADD COLUMN ref_sales_no VARCHAR(30) NULL COMMENT '참조선매출번호' AFTER note;
ALTER TABLE sales_dtl ADD COLUMN ref_sales_sq VARCHAR(10) NULL COMMENT '참조선매출순번' AFTER ref_sales_no;
