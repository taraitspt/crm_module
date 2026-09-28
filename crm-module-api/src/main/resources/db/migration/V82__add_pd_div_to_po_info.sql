-- P&D(S001) 외주발주서 작업사양 행별 구분. 패키지작업/수작업 셀렉트값 저장.
ALTER TABLE po_info ADD COLUMN pd_div VARCHAR(20) NULL COMMENT 'P&D 작업구분(패키지작업/수작업) — P&D 작업처 발주서 전용';
