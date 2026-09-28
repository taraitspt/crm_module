-- 매출목록 조회 성능 인덱스 2종 (2026-08-31 월말 매출목록 타임아웃 대응).
--
-- 배경 — SalesMstQueryRepository.search() 는 결과 행마다 상관 서브쿼리를 돌리는데,
--   아래 두 개가 인덱스 없는 컬럼을 조건으로 써서 매 행 sales_mst 를 풀스캔했다.
--   8월 매출 1,792건 조회 시 응답이 30초(axios 타임아웃)를 넘겨 목록이 뜨지 않았다.
--
-- ① 취소여부 판정 (canceledByReversal) — SELECT 절 'canceled' 별칭 + WHERE notCanceledByReversal 양쪽에서 사용
--      EXISTS (SELECT 1 FROM sales_mst c
--               WHERE c.company_cd=? AND c.plant_cd=? AND c.sales_type='SALES_CANCEL'
--                 AND c.note = concat('매출취소: ', 바깥행.sales_no))
--    note 가 TEXT + 무인덱스라 풀스캔. 비교식이 `note = <바깥행마다 고정값>` 형태라
--    컬럼을 함수로 감싸지 않으므로 인덱스를 탈 수 있다. TEXT 는 접두 길이 필수 → note(48).
--    판정 문자열 '매출취소: ' + 매출번호(SL+YYMMDD+일련) ≈ 20자라 48자면 충분히 구분된다.
--
-- ② 선매출 차감액 합산 (usedAmt)
--      SELECT SUM(pre_sales_deduct_amt) FROM sales_mst d
--       WHERE d.pre_sales_no = 바깥행.sales_no AND d.company_cd = ?
--    pre_sales_no 무인덱스 → 풀스캔.
--
-- ※ 순수 부가 인덱스 — 어떤 쿼리의 '결과'도 바꾸지 않는다(찾는 방법만 바뀜).
--   3천행대 테이블이라 생성은 1초 미만. 쓰기 시 인덱스 유지비만 소폭 증가.
--   문제가 생기면 DROP INDEX 로 즉시 원복 가능.
--
-- ※ 남은 이슈 — 주문거래처(orderPartnerNm)의 FIND_IN_SET 상관 서브쿼리는
--   컬럼이 함수 인자로 들어가 인덱스로 해결이 불가능하다. 이 인덱스로도 부족하면
--   조회 후 IN 배치 매핑(SalesService 의 기존 firstItemNmMap 패턴)으로 전환해야 한다.

CREATE INDEX IF NOT EXISTS idx_sales_mst_cancel_note
    ON sales_mst (company_cd, plant_cd, sales_type, note(48));

CREATE INDEX IF NOT EXISTS idx_sales_mst_pre_sales_no
    ON sales_mst (company_cd, pre_sales_no);
