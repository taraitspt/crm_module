-- V121: order_dtl 에 ERP 원주문번호/순번을 라인단위로 저장(배치 정확 매핑용).
-- order_mst.erp_order_no 는 주문단위라 복사주문끼리 같은 값 공유 → 라인 역매핑엔 부족.
-- MariaDB/H2 호환 위해 ADD COLUMN 을 개별 ALTER 로 분리.
ALTER TABLE order_dtl ADD COLUMN erp_order_no VARCHAR(30) NULL;
ALTER TABLE order_dtl ADD COLUMN erp_order_sq INT NULL;

-- 기존 데이터 백필: 현재 로컬 order_sq == ERP orddocSq 로 세팅돼 있으므로 order_sq 로 이관.
UPDATE order_dtl d
  JOIN order_mst m
    ON d.company_cd = m.company_cd AND d.plant_cd = m.plant_cd AND d.order_no = m.order_no
   SET d.erp_order_no = m.erp_order_no,
       d.erp_order_sq = d.order_sq
 WHERE m.erp_order_no IS NOT NULL AND m.erp_order_no <> '';
