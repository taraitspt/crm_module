-- 주문 상세 금액 수정 후 외주발주 목록의 수주금액(po_mst.order_amt)이
-- 생성 당시 금액에 머무른 기존 데이터를 order_dtl.payment_amt 기준으로 보정한다.
UPDATE po_mst p
JOIN order_dtl od
  ON od.company_cd = p.company_cd
 AND od.plant_cd = p.plant_cd
 AND od.order_no = p.order_no
 AND od.order_sq = p.order_sq
SET p.order_amt = COALESCE(od.payment_amt, 0)
WHERE p.order_no IS NOT NULL
  AND p.order_sq IS NOT NULL
  AND COALESCE(p.order_amt, -1) <> COALESCE(od.payment_amt, 0);
