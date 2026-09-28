-- 영업기회(딜) — 2026-09-18 CRM 신규.
-- 활동(sales_activity)이 "무엇을 했는가"라면, 딜은 "얼마가 언제 들어올 것 같은가"를 관리한다.
-- 단계별 확률을 곱한 가중 파이프라인으로 계획과 실적 사이의 빈칸을 메운다.
CREATE TABLE sales_deal (
    deal_id          BIGINT       NOT NULL AUTO_INCREMENT,
    company_cd       INT          NOT NULL DEFAULT 1000,
    partner_cd       VARCHAR(20)  NULL COMMENT 'ERP 거래처코드',
    partner_nm       VARCHAR(200) NULL COMMENT '등록 시점 거래처명 스냅샷',
    sales_emp_id     VARCHAR(20)  NOT NULL COMMENT '영업담당자 (users.id)',
    title            VARCHAR(200) NOT NULL,
    stage            VARCHAR(20)  NOT NULL COMMENT 'LEAD/QUALIFIED/QUOTE/NEGOTIATION/WON/LOST',
    expected_amt     BIGINT       NOT NULL DEFAULT 0 COMMENT '예상 수주금액',
    probability      INT          NOT NULL DEFAULT 0 COMMENT '수주 확률(%). 단계 기본값을 쓰되 수정 가능',
    expected_close_dt DATE        NULL COMMENT '예상 마감(수주)일',
    closed_dt        DATE         NULL COMMENT 'WON/LOST 로 바뀐 날',
    lost_reason      VARCHAR(500) NULL COMMENT '실패 사유 (stage=LOST)',
    content          TEXT         NULL,
    created_at       DATETIME     NULL,
    updated_at       DATETIME     NULL,
    created_id       VARCHAR(20)  NULL,
    updated_id       VARCHAR(20)  NULL,
    PRIMARY KEY (deal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='영업기회(딜)';

CREATE INDEX idx_deal_stage ON sales_deal (company_cd, stage);
CREATE INDEX idx_deal_emp ON sales_deal (company_cd, sales_emp_id);
CREATE INDEX idx_deal_partner ON sales_deal (company_cd, partner_cd);
CREATE INDEX idx_deal_close ON sales_deal (company_cd, expected_close_dt);
