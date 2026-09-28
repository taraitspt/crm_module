-- 시트 #5 0513 — 외주발주서(PoMst) 파일첨부 기능. file_info 테이블에 po_no 매핑 컬럼 추가.
-- 기존 order_no/order_sq 매핑은 주문 첨부용으로 유지하고, 외주발주는 po_no 로 별도 매핑.
ALTER TABLE file_info ADD COLUMN po_no VARCHAR(30) NULL COMMENT '외주발주번호 (PoMst FK)';
ALTER TABLE file_info ADD INDEX idx_file_info_po_no (company_cd, plant_cd, po_no);
