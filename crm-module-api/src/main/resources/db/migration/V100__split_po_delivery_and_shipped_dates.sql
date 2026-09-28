ALTER TABLE po_mst
    ADD COLUMN IF NOT EXISTS shipped_dt DATE NULL COMMENT '발송완료일' AFTER delivery_dt;

UPDATE po_mst
   SET shipped_dt = delivery_dt
 WHERE status_cd = 'SHIPPED'
   AND shipped_dt IS NULL
   AND delivery_dt IS NOT NULL;

CREATE INDEX idx_po_mst_shipped_dt ON po_mst (company_cd, plant_cd, shipped_dt);
