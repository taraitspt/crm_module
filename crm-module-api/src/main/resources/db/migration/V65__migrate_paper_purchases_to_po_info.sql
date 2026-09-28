-- V65: po_info 에 row_type 컬럼 추가 + po_paper_purchase 기존 데이터 이관
-- 용지발주 데이터를 po_info 로 통합하여 외주정산에서도 조회 가능하도록 한다.

-- 1. row_type 컬럼 추가 (기본값 'ITEM' — 기존 작업사양 행 그대로 유지)
--    IF NOT EXISTS: 이전 배포에서 ALTER TABLE 만 성공하고 INSERT 가 실패한 경우
--    Flyway 가 FAILED 상태로 기록 후 재실행할 때 컬럼 중복 오류를 방지.
ALTER TABLE po_info ADD COLUMN IF NOT EXISTS row_type VARCHAR(20) NOT NULL DEFAULT 'ITEM';

-- 2. po_paper_purchase 기존 데이터를 po_info PAPER 행으로 이관 (미이관분만)
--    INSERT IGNORE: 이미 이관된 행(동일 PK) 은 건너뜀.
--    필드 매핑: supplier_name→partner_nm, paper_type→compose,
--              weight→print_front, paper_spec→process,
--              grain→print_back, quantity→quantity, in_location→note
INSERT IGNORE INTO po_info (
    company_cd, plant_cd, po_no, po_sq, info_sq, row_type,
    partner_nm, compose, print_front, process, print_back, quantity, note,
    unit_price, subtotal,
    created_id, updated_id, created_at, updated_at
)
SELECT
    pp.company_cd, pp.plant_cd, pp.po_no,
    COALESCE(
        (SELECT MIN(po_sq) FROM po_dtl d
         WHERE d.company_cd = pp.company_cd AND d.plant_cd = pp.plant_cd
           AND d.po_no = pp.po_no COLLATE utf8mb4_unicode_ci),
        1
    ) AS po_sq,
    COALESCE(
        (SELECT MAX(info_sq) FROM po_info i
         WHERE i.company_cd = pp.company_cd AND i.plant_cd = pp.plant_cd
           AND i.po_no = pp.po_no COLLATE utf8mb4_unicode_ci),
        0
    ) + pp.paper_sq AS info_sq,
    'PAPER' AS row_type,
    pp.supplier_name AS partner_nm,
    pp.paper_type    AS compose,
    pp.weight        AS print_front,
    pp.paper_spec    AS process,
    pp.grain         AS print_back,
    pp.quantity      AS quantity,
    pp.in_location   AS note,
    0 AS unit_price, 0 AS subtotal,
    'MIGRATE' AS created_id, 'MIGRATE' AS updated_id,
    NOW() AS created_at, NOW() AS updated_at
FROM po_paper_purchase pp;
