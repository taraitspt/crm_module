-- V35/V36/V37 이 order/po/po_settle/users/departments 만 utf8mb4_unicode_ci 로 통일.
-- 매출(sales_*) / 비대면(untact_*) / 거래처/고객/목표 마스터가 utf8mb4_general_ci 로 남아
-- 1267 'Illegal mix of collations' 가 매출 list/카드매출/세금계산서 API 등에서 발생.
-- V38 에서 남은 운영 테이블 통일.
--
-- 같은 utf8mb4 안에서의 collation 변경이므로 데이터 손실 없음.
-- MariaDB 에서 CONVERT TO 는 FK 참조 컬럼도 막으므로 FK 를 일시 DROP 후 재생성.
ALTER TABLE sales_dtl  DROP FOREIGN KEY IF EXISTS FKabx06yduss5trmg1ue4bk457p;
ALTER TABLE sales_mst  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE sales_dtl  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE sales_dtl  ADD CONSTRAINT FKabx06yduss5trmg1ue4bk457p
    FOREIGN KEY (company_cd, plant_cd, sales_no) REFERENCES sales_mst (company_cd, plant_cd, sales_no);

ALTER TABLE untact_dtl DROP FOREIGN KEY IF EXISTS FKmp18738kfkuacfcwwoha0lwie;
ALTER TABLE untact_mst CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE untact_dtl CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE untact_dtl ADD CONSTRAINT FKmp18738kfkuacfcwwoha0lwie
    FOREIGN KEY (company_cd, plant_cd, untact_no) REFERENCES untact_mst (company_cd, plant_cd, untact_no);

ALTER TABLE business_owners   CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE customer_contacts CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE goal_mst          CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
