-- 시트 외주발주서 — '용지발주' 섹션 (외주팀 버전 전용).
-- 공급사명 / 지종 / 평량 / 규격 / 결 / 수량 / 입고처 — 모두 직접 키인.
-- PoMst 와 1:N. po_no 별 N 라인.
CREATE TABLE po_paper_purchase (
    company_cd    INT          NOT NULL,
    plant_cd      INT          NOT NULL,
    po_no         VARCHAR(20)  NOT NULL,
    paper_sq      INT          NOT NULL,
    supplier_name VARCHAR(100),
    paper_type    VARCHAR(100),
    weight        VARCHAR(50),
    paper_spec    VARCHAR(100),
    grain         VARCHAR(50),
    quantity      INT,
    in_location   VARCHAR(100),
    -- BaseEntity audit
    created_id    VARCHAR(20),
    created_at    DATETIME,
    updated_id    VARCHAR(20),
    updated_at    DATETIME,
    PRIMARY KEY (company_cd, plant_cd, po_no, paper_sq)
);
