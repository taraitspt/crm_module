-- V51: 비대면결제 카드 승인정보 컬럼 추가 (Toss confirm 응답 저장)
ALTER TABLE untact_mst ADD COLUMN card_approve_no VARCHAR(20) NULL COMMENT '카드 승인번호';
ALTER TABLE untact_mst ADD COLUMN card_number VARCHAR(30) NULL COMMENT '카드번호(마스킹)';
ALTER TABLE untact_mst ADD COLUMN card_company VARCHAR(30) NULL COMMENT '카드사명';
ALTER TABLE untact_mst ADD COLUMN card_type VARCHAR(10) NULL COMMENT '신용/체크';
ALTER TABLE untact_mst ADD COLUMN card_installment_months INT NULL COMMENT '할부개월(0=일시불)';
ALTER TABLE untact_mst ADD COLUMN card_approved_at DATETIME NULL COMMENT '카드 승인일시';
