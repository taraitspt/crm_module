-- 목록 조회 인덱스 보강 (2026-09-04 서버 페이징 전환 후속).
--
-- 배경 — 목록을 서버 페이징으로 옮기면서 "기본 정렬 + 자주 쓰는 필터" 가 매 요청 SQL 로 내려간다.
--   아래 컬럼들은 그 경로에 있는데 인덱스가 없어 정렬·조인마다 테이블을 훑는다.
--   특히 po_settle_mst 는 부가 인덱스가 gitgo_appr_state 하나뿐이라 공백이 가장 크다.
--
-- ※ 순수 부가 인덱스 — 어떤 쿼리의 '결과'도 바꾸지 않는다(찾는 방법만 바뀜).
-- ※ 재실행 안전을 위해 IF NOT EXISTS (MariaDB). 문장은 하나씩 분리.

-- ── 외주정산 (po_settle_mst) ──
-- ① 발주→정산 연결 조회. 발주목록의 정산상태 EXISTS, 정산목록 조인, 통계에서 반복 사용.
CREATE INDEX IF NOT EXISTS idx_po_settle_mst_po_no ON po_settle_mst (company_cd, plant_cd, po_no);
-- ② 정산목록 기본 정렬(created_at desc, pos_no desc).
CREATE INDEX IF NOT EXISTS idx_po_settle_mst_created_at ON po_settle_mst (company_cd, plant_cd, created_at, pos_no);
-- ③ 정산상태 필터(정산대기/정산중/확정/깃고 등) — 목록·현황 양쪽에서 사용.
CREATE INDEX IF NOT EXISTS idx_po_settle_mst_status ON po_settle_mst (company_cd, plant_cd, status_cd);

-- ── 외주발주 (po_mst) ──
-- 발주목록 기본 정렬(received_dt desc, po_no desc) + 발주일 범위 조회.
--   delivery_dt / shipped_dt 인덱스는 있으나 정작 기본 정렬 컬럼인 received_dt 가 없었다.
CREATE INDEX IF NOT EXISTS idx_po_mst_received_dt ON po_mst (company_cd, plant_cd, received_dt, po_no);

-- ── 매출 (sales_mst) ──
-- 부서/거래처/영업담당자 필터 — 역할별 부서 제한(MANAGER·PART_LEADER)이 매 조회에 걸린다.
CREATE INDEX IF NOT EXISTS idx_sales_mst_dept_sales_dt ON sales_mst (company_cd, plant_cd, dept_cd, sales_dt);
CREATE INDEX IF NOT EXISTS idx_sales_mst_partner_cd ON sales_mst (company_cd, plant_cd, partner_cd);
CREATE INDEX IF NOT EXISTS idx_sales_mst_sales_emp_no ON sales_mst (company_cd, plant_cd, sales_emp_no);

-- ── 주문 (order_mst) ──
-- 역할별 부서 제한 + 기본 정렬(received_dt desc) 동시 사용 경로.
CREATE INDEX IF NOT EXISTS idx_order_mst_sales_dept_received ON order_mst (company_cd, plant_cd, sales_dept_cd, received_dt);

-- ── 첨부파일 (file_info) ──
-- 발주목록의 "첨부 있음" 표시가 행마다 EXISTS 로 file_info 를 찾는데 (order_no, order_sq) 인덱스가 없었다.
CREATE INDEX IF NOT EXISTS idx_file_info_order_no_sq ON file_info (company_cd, plant_cd, order_no, order_sq);
