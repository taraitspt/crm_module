-- 공통 코드 관리 테이블. 세무구분/결제방식 등 코드성 값을 한 곳에서 관리한다.
CREATE TABLE IF NOT EXISTS common_code (
    company_cd  INT          NOT NULL DEFAULT 1000,
    group_cd    VARCHAR(40)  NOT NULL,
    code        VARCHAR(40)  NOT NULL,
    label       VARCHAR(100) NOT NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    use_yn      CHAR(1)      NOT NULL DEFAULT 'Y',
    created_at  DATETIME     NULL,
    created_id  VARCHAR(20)  NULL,
    updated_at  DATETIME     NULL,
    updated_id  VARCHAR(20)  NULL,
    PRIMARY KEY (company_cd, group_cd, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 세무구분(TAX_TYPE) 기본값 — 과세/면세/영세/카드/건별/수출/현금과세
INSERT INTO common_code (company_cd, group_cd, code, label, sort_order, use_yn) VALUES
  (1000, 'TAX_TYPE', 'TAXABLE',      '과세',     1, 'Y'),
  (1000, 'TAX_TYPE', 'EXEMPT',       '면세',     2, 'Y'),
  (1000, 'TAX_TYPE', 'ZERO_RATE',    '영세',     3, 'Y'),
  (1000, 'TAX_TYPE', 'CARD',         '카드',     4, 'Y'),
  (1000, 'TAX_TYPE', 'PER_CASE',     '건별',     5, 'Y'),
  (1000, 'TAX_TYPE', 'EXPORT',       '수출',     6, 'Y'),
  (1000, 'TAX_TYPE', 'CASH_TAXABLE', '현금과세', 7, 'Y');
