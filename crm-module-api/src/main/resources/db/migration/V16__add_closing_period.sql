-- 매출/세금계산서 월마감 (시트 #2/#14)
-- closing_type: SALES(매출), TAX(세금계산서) 중 하나.
-- closing_ym: YYYYMM. 마감되어 있으면 해당 월에 대한 매출등록/세금계산서발행 차단.
CREATE TABLE closing_period (
    company_cd   INT          NOT NULL,
    plant_cd     INT          NOT NULL,
    closing_type VARCHAR(20)  NOT NULL COMMENT 'SALES/TAX',
    closing_ym   VARCHAR(6)   NOT NULL COMMENT 'YYYYMM',
    scheduled_dt DATETIME     NULL COMMENT '예약 마감 시각(NULL 이면 즉시 마감)',
    closed_at    DATETIME     NULL COMMENT '실제 마감 시각',
    closed_by    VARCHAR(20)  NULL COMMENT '마감 처리자 사번',
    note         VARCHAR(500) NULL,
    created_at   DATETIME     NULL,
    updated_at   DATETIME     NULL,
    created_id   VARCHAR(20)  NULL,
    updated_id   VARCHAR(20)  NULL,
    PRIMARY KEY (company_cd, plant_cd, closing_type, closing_ym)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
