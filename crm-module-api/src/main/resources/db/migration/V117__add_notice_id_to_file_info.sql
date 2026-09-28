-- 공지사항(notices) 첨부파일 지원 — file_info 를 notice_id 로도 매핑(orderNo/poNo/untactNo 와 동일 방식 재사용).
-- 첨부 저장/다운로드/삭제는 기존 FileService 파이프라인(로컬디스크 + file_info)을 그대로 쓴다.
ALTER TABLE file_info ADD COLUMN IF NOT EXISTS notice_id BIGINT NULL;
CREATE INDEX IF NOT EXISTS idx_file_info_notice ON file_info (company_cd, plant_cd, notice_id);
