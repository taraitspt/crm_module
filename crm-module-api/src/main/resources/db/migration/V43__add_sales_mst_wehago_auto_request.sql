-- 비대면결제 → 매출 자동생성 시 위하고 자동 발행 대상으로 표시하는 플래그.
-- UntactService.autoCreateSalesFromUntact 에서 'Y' 박힘.
-- TaxIssuePage 가 GET /api/sales/tax-issue/auto-pending 으로 미발행 큐 조회.
-- 'Y' 자동발행 대상, NULL 일반 매출 (수동 발행)

ALTER TABLE sales_mst ADD COLUMN wehago_auto_request VARCHAR(2);
CREATE INDEX idx_sales_mst_auto_request ON sales_mst (wehago_auto_request, wehago_no_tax);
