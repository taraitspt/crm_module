-- 외주발주서를 작업(orderSq) 단위로 분리 저장하기 위한 컬럼 추가.
-- 정책: 동일 (orderNo, orderSq) 조합은 PO 1건만 허용 → 작업별 중복 발주 방지.
ALTER TABLE po_mst ADD COLUMN order_sq INT NULL COMMENT '주문 작업번호 (작업별 PO 분리용, 1-based)';
CREATE INDEX idx_po_mst_order_no_sq ON po_mst (company_cd, plant_cd, order_no, order_sq);
