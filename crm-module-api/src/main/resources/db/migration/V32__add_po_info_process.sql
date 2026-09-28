-- 시트 외주발주서 — 작업사양 컬럼 '공정(용지)' 를 itemName 에서 분리.
-- 기존 itemName 은 OrderDtl 의 작업명에서 복사되어 들어오는 값(품목명 의미),
-- process 는 외주가 입력하는 공정/용지 텍스트 (의미 분리).
-- 기존 데이터: itemName 이 사실상 공정/용지로 사용되어 왔으므로 process 로 복사 보존.
ALTER TABLE po_info ADD COLUMN process VARCHAR(200);
UPDATE po_info SET process = item_name WHERE process IS NULL AND item_name IS NOT NULL;
