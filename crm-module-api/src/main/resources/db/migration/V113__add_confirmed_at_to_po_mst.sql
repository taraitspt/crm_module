-- 발주확정 버튼을 누른 업무 기준 시각. updated_at/이력과 분리해 현재 확정 상태의 시점을 보존한다.
ALTER TABLE po_mst
    ADD COLUMN confirmed_at DATETIME(3) NULL COMMENT '발주확정 일시' AFTER status_cd;

-- 기존 확정 발주는 마지막 CONFIRM 이력으로 초기화한다. 현재 확정취소 상태는 제외한다.
UPDATE po_mst p
JOIN (
    SELECT company_cd, plant_cd, po_no, MAX(changed_at) AS confirmed_at
      FROM po_history
     WHERE action_cd = 'CONFIRM'
     GROUP BY company_cd, plant_cd, po_no
) h ON h.company_cd = p.company_cd
   AND h.plant_cd = p.plant_cd
   AND h.po_no = p.po_no
SET p.confirmed_at = h.confirmed_at
WHERE p.status_cd NOT IN ('DRAFT', 'PENDING');
