-- upstream V51(add_card_info_to_untact_mst)의 untact_mst 카드 컬럼 멱등 보강.
--
-- 배경: tara 로컬 DB 는 내 fork 의 V51(=erp_sync_observability)을 버전 51 로 보유한다(upstream V51 미적용).
--   머지 후 FlywayMigrationStrategy 의 repair 로 V51 이력이 upstream(card_info)으로 정렬되면 V51 SQL 은
--   재실행되지 않으므로 untact_mst 카드 컬럼이 누락된다. 여기서 IF NOT EXISTS 로 안전하게 보강한다.
--   (upstream V51 이 정상 적용된 환경에서는 컬럼이 이미 있어 no-op.)

ALTER TABLE untact_mst ADD COLUMN IF NOT EXISTS card_approve_no VARCHAR(20) NULL COMMENT '카드 승인번호';
ALTER TABLE untact_mst ADD COLUMN IF NOT EXISTS card_number VARCHAR(30) NULL COMMENT '카드번호(마스킹)';
ALTER TABLE untact_mst ADD COLUMN IF NOT EXISTS card_company VARCHAR(30) NULL COMMENT '카드사명';
ALTER TABLE untact_mst ADD COLUMN IF NOT EXISTS card_type VARCHAR(10) NULL COMMENT '신용/체크';
ALTER TABLE untact_mst ADD COLUMN IF NOT EXISTS card_installment_months INT NULL COMMENT '할부개월(0=일시불)';
ALTER TABLE untact_mst ADD COLUMN IF NOT EXISTS card_approved_at DATETIME NULL COMMENT '카드 승인일시';
