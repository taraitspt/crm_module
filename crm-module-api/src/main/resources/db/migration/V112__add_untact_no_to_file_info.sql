-- 비대면결제 안내메일 첨부파일을 비대면결제(untact_mst)에 연결하기 위한 컬럼.
-- 등록 모달에서 1개(10MB 이하, pdf/xls/xlsx)를 올려 결제안내 메일에 함께 발송한다.
-- file_info 는 order_no / po_no 처럼 용도별 링크 컬럼을 두는 구조 → untact_no 추가.
ALTER TABLE file_info ADD COLUMN untact_no VARCHAR(30) NULL COMMENT '비대면결제번호(untact_mst) — 안내메일 첨부 매핑';
