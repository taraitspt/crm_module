-- 용지발주(rowType='PAPER') 수량을 소수점/자유 키인으로 받기 위한 문자열 컬럼.
-- 기존 quantity(INT)는 작업사양 수량·금액·정산까지 타므로 건드리지 않고, 용지 수량만 분리 저장.
ALTER TABLE po_info ADD COLUMN paper_qty VARCHAR(50) NULL COMMENT '용지발주 수량(키인, 소수점 허용) — PAPER 행 전용';

-- 기존 용지발주 행의 정수 수량을 문자열 컬럼으로 보존.
UPDATE po_info SET paper_qty = CAST(quantity AS CHAR)
 WHERE row_type = 'PAPER' AND quantity IS NOT NULL;
