-- 시트 #12, #13 — 비대면주문 등록/목록 (G7 bo_untact + bo_untact_order 포팅)
-- 발송완료(SHIPPED) + 카드결제 주문 N개 → 비대면결제 1건 → 이메일 + 토스결제

CREATE TABLE untact_mst (
    company_cd          INT          NOT NULL,
    plant_cd            INT          NOT NULL,
    untact_no           VARCHAR(30)  NOT NULL COMMENT '비대면결제번호 (UN+yyMMdd+seq)',
    partner_cd          VARCHAR(20)  COMMENT '거래처(사업자) 코드 — 묶음의 동일성 보장',
    partner_nm          VARCHAR(100) COMMENT '거래처명',
    title               VARCHAR(200) COMMENT '작업명 (이메일 제목/본문에 사용)',
    amount              BIGINT       NOT NULL DEFAULT 0 COMMENT '결제금액 (선택 주문 합계)',
    customer_nm         VARCHAR(100) COMMENT '고객명 (이메일 받는 사람)',
    email               VARCHAR(200) COMMENT '결제이메일',
    payment_code        VARCHAR(20)  NOT NULL COMMENT '결제코드 (10자 랜덤, 고객 입력용)',
    status_cd           VARCHAR(30)  NOT NULL DEFAULT 'REGISTERED'
                                     COMMENT 'REGISTERED(주문등록) / EMAILED(메일발송완료) / PAID(결제완료) / ORDER_CANCELLED(주문취소) / PAY_CANCELLED(결제취소)',
    payment_key         VARCHAR(200) COMMENT '토스 paymentKey (결제완료 후)',
    paid_at             DATETIME(6)  COMMENT '결제완료 일시 (= 매출일자)',
    emailed_at          DATETIME(6)  COMMENT '이메일 발송 일시',
    is_use              VARCHAR(1)   NOT NULL DEFAULT 'Y',
    note                VARCHAR(500),

    created_at          DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at          DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    created_id          VARCHAR(50),
    updated_id          VARCHAR(50),

    PRIMARY KEY (company_cd, plant_cd, untact_no),
    INDEX idx_untact_mst_partner (company_cd, plant_cd, partner_cd),
    INDEX idx_untact_mst_status (company_cd, plant_cd, status_cd),
    INDEX idx_untact_mst_paymentcode (payment_code)
) COMMENT='비대면결제 마스터';

CREATE TABLE untact_dtl (
    company_cd          INT          NOT NULL,
    plant_cd            INT          NOT NULL,
    untact_no           VARCHAR(30)  NOT NULL,
    untact_sq           INT          NOT NULL COMMENT '순번',
    order_no            VARCHAR(30)  NOT NULL COMMENT '연결된 주문번호',
    order_amount        BIGINT       NOT NULL DEFAULT 0 COMMENT '해당 주문의 원래 totalAmt',
    allocated_amount    BIGINT       NOT NULL DEFAULT 0 COMMENT '이 비대면결제에서 차감되는 금액',

    created_at          DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at          DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    created_id          VARCHAR(50),
    updated_id          VARCHAR(50),

    PRIMARY KEY (company_cd, plant_cd, untact_no, untact_sq),
    INDEX idx_untact_dtl_order (company_cd, plant_cd, order_no)
) COMMENT='비대면결제 ↔ 주문 매핑';
