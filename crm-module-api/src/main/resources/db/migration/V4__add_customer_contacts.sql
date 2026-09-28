-- ============================================================
-- V4: 고객관리 담당자 테이블 추가
-- ============================================================

CREATE TABLE customer_contacts (
    id               BIGINT       NOT NULL AUTO_INCREMENT,
    company_cd       INT          NULL,
    partner_cd       VARCHAR(20)  NULL     COMMENT '거래처코드(Oracle CI_PARTNER_MST 연동)',
    company_name     VARCHAR(100) NULL     COMMENT '거래처명(캐시)',
    contact_name     VARCHAR(50)  NULL     COMMENT '거래처담당자',
    contact_dept     VARCHAR(100) NULL     COMMENT '부서',
    contact_position VARCHAR(50)  NULL     COMMENT '직책',
    contact_email    VARCHAR(100) NULL     COMMENT '이메일',
    contact_phone    VARCHAR(20)  NULL     COMMENT '연락처',
    note             VARCHAR(500) NULL,
    created_at       DATETIME     NULL,
    updated_at       DATETIME     NULL,
    created_id       VARCHAR(20)  NULL,
    updated_id       VARCHAR(20)  NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='고객 담당자 정보';

CREATE INDEX idx_customer_contacts_partner ON customer_contacts (company_cd, partner_cd);
CREATE INDEX idx_customer_contacts_email   ON customer_contacts (contact_email);
