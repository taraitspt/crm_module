-- 사업본부 매출구분(DIVISION) 공통코드 — 확정값(그래픽스=GRP)만 시드.
-- 나머지(국내/해외/전략사업본부, 샤넬/지마켓 등)는 관리자 화면에서 코드값 직접 등록.
INSERT INTO common_code (company_cd, group_cd, code, label, sort_order, use_yn)
SELECT 1000, 'DIVISION', 'GRP', '그래픽스', 1, 'Y'
WHERE NOT EXISTS (
    SELECT 1 FROM common_code WHERE company_cd = 1000 AND group_cd = 'DIVISION' AND code = 'GRP'
);

-- 기존 order_mst.division 에 한글 '그래픽스'/'그래픽스사업본부' 로 저장된 건을 코드 GRP 로 정규화.
UPDATE order_mst SET division = 'GRP'
WHERE division IN ('그래픽스', '그래픽스사업본부');
