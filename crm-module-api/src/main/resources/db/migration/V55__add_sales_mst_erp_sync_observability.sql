-- 매출→더존 빌링 전송 관측성. erp_sync_status(V5 기존)를 NONE/SKIPPED/SUCCESS/FAILED 라이프사이클로 구동하고,
-- 실패/생략 사유와 마지막 시도 시각을 남겨 운영자가 더존 누락을 즉시 식별할 수 있게 한다.
--
-- ⚠️ 원래 V51 이었으나 upstream(taraitspt) 이 V51~V54 를 점유 → 버전 충돌 회피 위해 V55 로 리넘버.
--    tara 운영 DB 엔 구 V51 로 이미 적용되어 있을 수 있으므로 ADD COLUMN IF NOT EXISTS 로 멱등 처리.
--    (운영 적용 전, flyway_schema_history 의 구 V51 이력은 flyway repair 로 정리 필요 — 체크섬 불일치 방지.)
-- 각 ALTER 별도 statement — H2 MySQL 모드 호환 (V40/V42 노트 참조).

ALTER TABLE sales_mst ADD COLUMN IF NOT EXISTS erp_sync_error VARCHAR(500) NULL COMMENT '더존 전송 실패/생략 사유(마지막)';
ALTER TABLE sales_mst ADD COLUMN IF NOT EXISTS erp_synced_at DATETIME NULL COMMENT '더존 전송 마지막 시도 시각';
