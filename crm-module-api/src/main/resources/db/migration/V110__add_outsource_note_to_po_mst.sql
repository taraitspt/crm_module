-- 외주발주서 '외주주의사항' 컬럼 — 작업주의사항(work_note)과 별개로, 외주 관련 주의/전달사항을 자유 키인.
-- 긴 텍스트(주저리)를 담을 수 있도록 TEXT 타입. (작업주의사항과 동일한 폼 형태로 외주발주 상세에 노출)
ALTER TABLE po_mst ADD COLUMN outsource_note TEXT NULL COMMENT '외주주의사항 (외주발주 상세 키인, 긴 텍스트)';
