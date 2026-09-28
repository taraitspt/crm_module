-- 영업활동 ↔ 영업기회 연결 (2026-09-18).
-- 딜은 "얼마가 언제", 활동은 "무엇을 했는가"인데 따로 입력하면 두 번 일하게 된다.
-- 활동에 deal_id 를 달아 딜에서 활동을 바로 남기고, 딜 카드에서 진행 경과를 볼 수 있게 한다.
-- NULL 허용 — 딜과 무관한 일반 활동(단순 방문, 내부 업무)도 그대로 남는다.
ALTER TABLE sales_activity ADD COLUMN deal_id BIGINT NULL COMMENT '연결된 영업기회 (sales_deal.deal_id)';

CREATE INDEX idx_sact_deal ON sales_activity (company_cd, deal_id);
