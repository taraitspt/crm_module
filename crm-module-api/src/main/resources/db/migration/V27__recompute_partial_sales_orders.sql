-- PR-29 — PR-24 의 isPartial 부풀림 버그(SalesDtl.totalAmt = qty*unitPrice*1.1 합산
--   으로 totalOrderAmt 가 항상 부풀려져 모든 매출이 PARTIAL_SALES 로 박히던 버그)
--   가 fix 되기 전 잘못 들어간 status_cd 를 sumRegisteredAmtByOrderNo 와 동일한
--   기준(totalAmt + preSalesDeductAmt) 으로 일괄 재계산.
--
--   매출 합산 = 매출확정금액(totalAmt) + 선매출 차감액(preSalesDeductAmt)
--   → 0 이면 SHIPPED (매출등록 전 단계)
--   → total_amt 보다 작으면 PARTIAL_SALES (실제 부분매출)
--   → total_amt 이상이면 SALES_REGISTERED (전액 매출 완료)
--
--   영향 범위: order_mst.status_cd = 'PARTIAL_SALES' 인 주문만. 4건 확인됨.
UPDATE order_mst o
SET o.status_cd = CASE
    WHEN (
        SELECT COALESCE(SUM(s.total_amt + COALESCE(s.pre_sales_deduct_amt, 0)), 0)
        FROM sales_mst s
        WHERE s.order_no LIKE CONCAT('%', o.order_no, '%')
    ) <= 0 THEN 'SHIPPED'
    WHEN (
        SELECT COALESCE(SUM(s.total_amt + COALESCE(s.pre_sales_deduct_amt, 0)), 0)
        FROM sales_mst s
        WHERE s.order_no LIKE CONCAT('%', o.order_no, '%')
    ) < o.total_amt THEN 'PARTIAL_SALES'
    ELSE 'SALES_REGISTERED'
END
WHERE o.status_cd = 'PARTIAL_SALES';
