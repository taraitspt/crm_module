-- 주문 작업라인 내부/외부 구분 컬럼. 기본 'I'(내부), 외부 작업처(전체외주/상품구매/VMD/패키지 등)는 'O'.
-- 기존엔 wrk_cd 정규식으로 매번 하드코딩 판정하던 것을 컬럼으로 영속화한다. (주문등록 시 작업처 기준 세팅)
ALTER TABLE order_dtl ADD COLUMN wrk_div VARCHAR(1) NOT NULL DEFAULT 'I' COMMENT '내부/외부 구분 (I=내부, O=외부 작업처)';

-- 기존 행 백필: 외부 작업처 코드(G06xx~G09xx, G9xxx)는 'O'.
UPDATE order_dtl SET wrk_div = 'O'
WHERE wrk_cd REGEXP '^G0[6-9][0-9]{2}$' OR wrk_cd REGEXP '^G9[0-9]{3}$';
