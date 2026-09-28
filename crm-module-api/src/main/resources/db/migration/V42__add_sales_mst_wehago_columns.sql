-- 위하고(Wehago) 세금계산서 발행 결과 저장 컬럼 — 통합 2단계.
-- 발행 후 위하고 응답의 NO_TAX(관리번호), NO_ISS(국세청 전송번호), YN_ISS(전송상태) 보관.
-- WEHAGO_YN_ISS 값: '0'미전송 '1'전송중 '2'전송성공 '3'전송실패.
-- 각 ALTER 별도 statement — H2 MySQL 모드 호환 (V40 노트 참조).

ALTER TABLE sales_mst ADD COLUMN wehago_no_tax VARCHAR(30);
ALTER TABLE sales_mst ADD COLUMN wehago_no_iss VARCHAR(50);
ALTER TABLE sales_mst ADD COLUMN wehago_yn_iss VARCHAR(2);
ALTER TABLE sales_mst ADD COLUMN wehago_issued_at DATETIME NULL;
ALTER TABLE sales_mst ADD COLUMN wehago_send_svc_cd VARCHAR(10);

CREATE INDEX idx_sales_mst_wehago_no_tax ON sales_mst (wehago_no_tax);
