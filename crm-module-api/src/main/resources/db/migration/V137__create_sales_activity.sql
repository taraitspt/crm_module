-- 영업활동 이력 (2026-09-18 CRM 신규) — 담당자가 거래처별로 남기는 방문·통화·견적 등의 활동 기록.
-- 캘린더/일자별 현황/거래처 히스토리 세 화면이 이 한 테이블을 공유한다.
CREATE TABLE sales_activity (
    activity_id    BIGINT       NOT NULL AUTO_INCREMENT,
    company_cd     INT          NOT NULL DEFAULT 1000,
    activity_dt    DATE         NOT NULL COMMENT '영업활동 일자',
    sales_emp_id   VARCHAR(20)  NOT NULL COMMENT '영업담당자 (users.id)',
    partner_cd     VARCHAR(20)  NULL COMMENT 'ERP 거래처코드. 내부업무 등 거래처가 없으면 NULL',
    partner_nm     VARCHAR(200) NULL COMMENT '등록 시점 거래처명 스냅샷',
    activity_type  VARCHAR(20)  NOT NULL COMMENT 'VISIT/CALL/MAIL/QUOTE/CONTRACT/ETC',
    title          VARCHAR(200) NOT NULL,
    content        TEXT         NULL,
    next_action_dt DATE         NULL COMMENT '다음 액션 예정일',
    next_action    VARCHAR(500) NULL COMMENT '다음에 할 일',
    amount         BIGINT       NULL COMMENT '관련 예상/계약 금액',
    created_at     DATETIME     NULL,
    updated_at     DATETIME     NULL,
    created_id     VARCHAR(20)  NULL,
    updated_id     VARCHAR(20)  NULL,
    PRIMARY KEY (activity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='영업활동 이력';

CREATE INDEX idx_sact_dt ON sales_activity (company_cd, activity_dt);
CREATE INDEX idx_sact_emp ON sales_activity (company_cd, sales_emp_id, activity_dt);
CREATE INDEX idx_sact_partner ON sales_activity (company_cd, partner_cd, activity_dt);
CREATE INDEX idx_sact_next ON sales_activity (company_cd, next_action_dt);
