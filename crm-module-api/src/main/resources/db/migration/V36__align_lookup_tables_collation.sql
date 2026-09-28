-- V35 가 order_*/po_* 테이블만 utf8mb4_unicode_ci 로 통일하면서, 함께 LEFT JOIN 되는
-- 마스터/룩업 테이블(users, departments)은 utf8mb4_general_ci 로 남아 1267
-- 'Illegal mix of collations' 가 PoMstQueryRepository.search 등에서 발생.
-- 운영 사고: PO 목록/등록 API 가 500 으로 응답하고, 새 외주발주서가 목록에 표시되지 않음.
--
-- 같은 utf8mb4 안에서의 collation 변경이므로 데이터 손실 없음. 인덱스 재구성 발생.
ALTER TABLE users        CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE departments  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
