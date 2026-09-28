-- UX 1단계 — 위하고 발행 원클릭화: 공급자(SELL_*) 정보 + 기본 과금코드를 wehago_connection 에
-- 영구 저장. 매출 행에서 "위하고 발행" 클릭 시 모달 안 띄우고 confirm 만으로 바로 호출.
-- 사전 정보 누락 시에만 /settings/wehago 로 안내.

ALTER TABLE wehago_connection ADD COLUMN seller_nm_ceo VARCHAR(50);
ALTER TABLE wehago_connection ADD COLUMN seller_addr1 VARCHAR(200);
ALTER TABLE wehago_connection ADD COLUMN seller_addr2 VARCHAR(200);
ALTER TABLE wehago_connection ADD COLUMN seller_biz_status VARCHAR(50);
ALTER TABLE wehago_connection ADD COLUMN seller_biz_type VARCHAR(50);
ALTER TABLE wehago_connection ADD COLUMN seller_dam_nm VARCHAR(50);
ALTER TABLE wehago_connection ADD COLUMN seller_dam_email VARCHAR(100);
ALTER TABLE wehago_connection ADD COLUMN seller_dam_mobil VARCHAR(30);
ALTER TABLE wehago_connection ADD COLUMN default_send_svc_cd VARCHAR(10);
