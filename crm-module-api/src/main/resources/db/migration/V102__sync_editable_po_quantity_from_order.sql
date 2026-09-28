-- 편집 가능(DRAFT/PENDING) 외주발주 상세의 제작부수를 주문 상세 제작부수와 동기화한다.
-- 주문에서 제작부수를 수정한 뒤 기존 draft/pending PO가 예전 수량을 들고 있던 데이터 보정.
UPDATE po_dtl pd
JOIN po_mst pm
  ON pm.company_cd = pd.company_cd
 AND pm.plant_cd = pd.plant_cd
 AND pm.po_no = pd.po_no
JOIN order_dtl od
  ON od.company_cd = pm.company_cd
 AND od.plant_cd = pm.plant_cd
 AND od.order_no = pm.order_no
 AND od.order_sq = pm.order_sq
   SET pd.quantity = od.quantity,
       pd.amt = od.quantity * COALESCE(pd.unit_price, 0)
 WHERE pm.status_cd IN ('DRAFT', 'PENDING')
   AND od.quantity IS NOT NULL
   AND od.quantity > 0
   AND (pd.quantity IS NULL OR pd.quantity <> od.quantity);
