-- 시트 #17 0511_4 — 외주정산 확정 시점의 "정산일" 컬럼 추가.
-- 외주정산목록/현황의 정산일 컬럼과, 정산확정 모달에서 사용자가 직접 입력한 날짜를 저장한다.
-- NULL 허용 (기존 데이터 보존). 정산확정 시점에 채워진다.
ALTER TABLE po_settle_mst ADD COLUMN settled_dt DATE NULL COMMENT '정산일 (사용자 입력, 정산확정 시점)';
