-- 작업명(workName) 등 사용자 입력에 이모지/4바이트 문자가 들어오면 500 으로 표출되던 버그 방어.
-- 테이블은 V1 에서 DEFAULT CHARSET=utf8mb4 로 생성됐으나, 일부 환경(예: 운영 MariaDB 인스턴스)에서
-- 컬럼 단위 charset 이 utf8mb3 로 남아있는 케이스를 확인. 명시적으로 CONVERT 하여 정합.
-- CONVERT TO CHARACTER SET 은 이미 utf8mb4 인 컬럼엔 no-op 에 가까우므로 재실행 안전.

ALTER TABLE order_mst   CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE order_dtl   CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE order_info  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE order_dlv   CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE po_mst      CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE po_dtl      CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE po_info     CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
