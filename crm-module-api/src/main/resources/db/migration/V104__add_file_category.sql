-- file_info 파일 용도 구분 컬럼. THUMBNAIL = 외주발주서(패키지) 썸네일 첨부 → 발주서 PDF 하단에 렌더.
-- NULL = 일반 첨부(기존 주문작업/발주서 첨부)와 구분하기 위함.
ALTER TABLE file_info ADD COLUMN file_category VARCHAR(20) NULL COMMENT '파일 용도 구분(THUMBNAIL 등, NULL=일반첨부)';
