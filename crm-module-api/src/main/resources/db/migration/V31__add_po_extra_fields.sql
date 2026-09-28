-- V31: 외주발주서 신규 필드 (시트 #7 외주발주서 스펙).
--   po_mst 단위:  코팅 / 후가공 / 제본 (제작 사양), 견본요청(샘플), 배송요청사항.
--   po_info 단위: 구성 (표지/내지/봉투 등), 페이지, 인쇄(전/후) — 스펙상 작업사양 행별 값.
-- 멀티 ADD COLUMN 은 H2(MySQL 모드)에서 파싱 실패 가능 → ALTER 1개당 한 컬럼.

ALTER TABLE po_mst ADD COLUMN coating VARCHAR(100);
ALTER TABLE po_mst ADD COLUMN post_process VARCHAR(100);
ALTER TABLE po_mst ADD COLUMN binding VARCHAR(100);
ALTER TABLE po_mst ADD COLUMN sample_request CHAR(1) DEFAULT 'N';
ALTER TABLE po_mst ADD COLUMN delivery_note VARCHAR(500);

ALTER TABLE po_info ADD COLUMN compose VARCHAR(50);
ALTER TABLE po_info ADD COLUMN pages INT;
ALTER TABLE po_info ADD COLUMN print_front VARCHAR(50);
ALTER TABLE po_info ADD COLUMN print_back VARCHAR(50);
