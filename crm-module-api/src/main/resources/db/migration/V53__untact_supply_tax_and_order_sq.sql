-- 비대면결제 공급가액/세액 분리 저장 + 순번(order_sq) 추가.

-- untact_mst: 총결제금액(amount)과 별도로 공급가액/세액 보관
ALTER TABLE untact_mst ADD COLUMN IF NOT EXISTS supply_amt BIGINT NOT NULL DEFAULT 0;
ALTER TABLE untact_mst ADD COLUMN IF NOT EXISTS tax_amt    BIGINT NOT NULL DEFAULT 0;

-- untact_dtl: 순번(주문번호-순번 단위 관리) + 라인별 공급가액/세액
ALTER TABLE untact_dtl ADD COLUMN IF NOT EXISTS order_sq   INT NULL;
ALTER TABLE untact_dtl ADD COLUMN IF NOT EXISTS supply_amt BIGINT NOT NULL DEFAULT 0;
ALTER TABLE untact_dtl ADD COLUMN IF NOT EXISTS tax_amt    BIGINT NOT NULL DEFAULT 0;
