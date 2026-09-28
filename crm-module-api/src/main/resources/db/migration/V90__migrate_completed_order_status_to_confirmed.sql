-- 주문상태 '완료'(COMPLETED) 폐기 정리.
-- 배경: 예전엔 ERP WRK_FG 400/401/402/500(완료/종결)을 COMPLETED 로 매핑했으나,
--   현재는 CONFIRMED 로 매핑한다(OrderStatus.fromWrkFg / ErpTransactionSyncService.mapWrkFgToStatus).
--   COMPLETED 를 새로 쓰는 코드 경로가 더 이상 없으므로, 매핑 변경 전에 동기화되어 남아있는
--   레거시 COMPLETED 행을 CONFIRMED 로 일괄 정리한다. (SM 매출 단계는 SALES_* 로 별도 관리되어 무관)
UPDATE order_mst SET status_cd = 'CONFIRMED' WHERE status_cd = 'COMPLETED';
UPDATE order_dtl SET status_cd = 'CONFIRMED' WHERE status_cd = 'COMPLETED';
