-- 시트 주문등록 탭 — 주문명/완료요청일을 작업(OrderDtl)별로 분리.
-- ERP 동기화는 mst.order_title/request_dt 를 작업 1 의 값으로 대표 (안전).
-- MariaDB IF NOT EXISTS — 이전 실패 후 재실행 시 중복 컬럼 에러 회피.
ALTER TABLE order_dtl ADD COLUMN IF NOT EXISTS work_title VARCHAR(200);
ALTER TABLE order_dtl ADD COLUMN IF NOT EXISTS work_requested_date DATETIME;

-- 기존 데이터 이관: 각 주문의 모든 작업에 mst.order_title / mst.request_dt 복사 (호환).
UPDATE order_dtl d
JOIN order_mst m
  ON m.company_cd = d.company_cd
 AND m.plant_cd = d.plant_cd
 AND m.order_no = d.order_no
SET d.work_title = m.order_title,
    d.work_requested_date = m.request_dt
WHERE d.work_title IS NULL;
