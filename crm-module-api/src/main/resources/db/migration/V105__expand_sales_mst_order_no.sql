-- N개 주문 합산 매출등록 시 order_no 에 주문번호들을 콤마로 이어 저장(SalesService: String.join(",", orderNos)).
-- 2건만 돼도 VARCHAR(30) 초과(16+1+16=33자)로 MysqlDataTruncation 500. 실무는 100건+ 한번에 등록 → 콤마 포함 1700자+.
-- note 컬럼과 동일하게 TEXT 로 확장(인덱스 없음, 조회는 LIKE '%orderNo%' 부분매칭이라 TEXT 무관).
ALTER TABLE sales_mst MODIFY COLUMN order_no TEXT;
