-- 주문목록 서버 정렬 — 형제주문 그룹키(같은 erp_order_no 의 MIN(order_no)) 상관 서브쿼리가
-- ORDER BY 에서 행마다 평가된다. (company_cd, plant_cd, erp_order_no) 복합 인덱스로 커버링해
-- 서브쿼리 탐색 비용을 줄인다. 기존 단일 컬럼 인덱스(idx_order_mst_erp_order_no)는 그대로 둔다.
-- ※ IF NOT EXISTS — 운영 DB 에 로컬 검증 중 같은 인덱스를 미리 만들어 둔 상태라, 배포 시 Flyway 가
--    다시 실행해도 실패하지 않아야 한다(중복 인덱스 오류 → 서버 기동 실패 방지). MariaDB 10.1+ 문법.
CREATE INDEX IF NOT EXISTS idx_order_mst_cp_erp_order_no ON order_mst (company_cd, plant_cd, erp_order_no, order_no);
