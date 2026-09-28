-- V35/V36 이 order_*/po_*/users/departments 만 utf8mb4_unicode_ci 로 통일.
-- 남은 외주정산 마스터/디테일 + 마스터 룩업 테이블이 utf8mb4_general_ci 로 남아
-- 1267 'Illegal mix of collations' 가 PoSettleQueryRepository (외주정산 목록) 등에서 발생.
-- V37 에서 모두 통일.
--
-- 같은 utf8mb4 안에서의 collation 변경이므로 데이터 손실 없음.
-- MariaDB 에서 CONVERT TO 는 FK 참조 컬럼도 막으므로 FK 를 일시 DROP 후 재생성.
ALTER TABLE po_settle_dtl DROP FOREIGN KEY IF EXISTS FKdhe5tktre6nytk4wq5yvdi45s;
ALTER TABLE po_settle_mst CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE po_settle_dtl CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE po_settle_dtl ADD CONSTRAINT FKdhe5tktre6nytk4wq5yvdi45s
    FOREIGN KEY (company_cd, plant_cd, pos_no) REFERENCES po_settle_mst (company_cd, plant_cd, pos_no);
