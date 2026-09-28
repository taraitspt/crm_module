-- 고객 담당자 연락처 — 2026-09-18 CRM 신규.
-- ERP(MA_PARTNER_PTR)에도 거래처 담당자가 있지만 한 명만, 갱신도 ERP 쪽에서만 가능하다.
-- 영업이 실제로 상대하는 여러 담당자를 CRM 에서 직접 쌓기 위한 자체 테이블.
CREATE TABLE partner_contact (
    contact_id  BIGINT       NOT NULL AUTO_INCREMENT,
    company_cd  INT          NOT NULL DEFAULT 1000,
    partner_cd  VARCHAR(20)  NOT NULL COMMENT 'ERP 거래처코드',
    name        VARCHAR(100) NOT NULL,
    position_nm VARCHAR(100) NULL COMMENT '직위/직책',
    dept_nm     VARCHAR(100) NULL COMMENT '고객사 부서',
    phone       VARCHAR(40)  NULL COMMENT '휴대폰',
    tel         VARCHAR(40)  NULL COMMENT '유선',
    email       VARCHAR(150) NULL,
    is_primary  TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '대표 담당자 여부',
    memo        VARCHAR(500) NULL,
    created_at  DATETIME     NULL,
    updated_at  DATETIME     NULL,
    created_id  VARCHAR(20)  NULL,
    updated_id  VARCHAR(20)  NULL,
    PRIMARY KEY (contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='고객 담당자 연락처';

CREATE INDEX idx_pcontact_partner ON partner_contact (company_cd, partner_cd, is_primary DESC);
