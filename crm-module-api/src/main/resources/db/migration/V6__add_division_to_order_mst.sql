-- ============================================================
-- V6: order_mst 영업구분(division) 컬럼 추가
-- 엔티티에는 존재했으나 V1~V5 마이그레이션에서 누락된 컬럼
-- division: 영업구분 (그래픽스, PM, 국내, 해외)
-- ============================================================
ALTER TABLE order_mst
    ADD COLUMN IF NOT EXISTS division VARCHAR(20) NULL
        COMMENT '영업구분(그래픽스/PM/국내/해외)' AFTER customer_nm;
