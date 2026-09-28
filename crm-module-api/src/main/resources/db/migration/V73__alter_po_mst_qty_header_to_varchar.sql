-- 외주발주 제작사양 '수량'은 숫자뿐 아니라 영어/한글 등 자유 텍스트(키인)가 들어갈 수 있어
-- qty_header 컬럼을 정수에서 VARCHAR 로 변경한다. 기존 정수 값은 문자열로 보존된다.
ALTER TABLE po_mst MODIFY COLUMN qty_header VARCHAR(100) NULL;
