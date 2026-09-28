-- 전표수동연동 매출전표(SLS) 조회 500 수정 — "Illegal mix of collations".
-- 원인: sales_mst.tbl_key / po_settle_mst.tbl_key 는 utf8mb4_unicode_ci 인데
--       voucher_mst.tbl_key 는 utf8mb4_general_ci 라, VoucherService.list 의 상관 서브쿼리
--       (sm.tbl_key = vm.tbl_key / settle.tbl_key = vm.tbl_key) 에서 MySQL 이 콜레이션 혼합을 거부.
-- 조치: voucher_mst.tbl_key 는 PK + voucher_dtl FK 참조라 건드리지 않고,
--       나머지(sales_mst, po_settle_mst)의 tbl_key 를 voucher_mst 쪽(utf8mb4_general_ci)에 맞춘다.
--       (tbl_key 값은 ASCII 범위라 콜레이션 변경으로 데이터 손실/의미변화 없음. 바인드 파라미터 비교엔 무영향.)

ALTER TABLE sales_mst
    MODIFY COLUMN tbl_key VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL COMMENT '연결된 voucher_mst.tbl_key';

ALTER TABLE po_settle_mst
    MODIFY COLUMN tbl_key VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL COMMENT '연결된 voucher_mst.tbl_key';
