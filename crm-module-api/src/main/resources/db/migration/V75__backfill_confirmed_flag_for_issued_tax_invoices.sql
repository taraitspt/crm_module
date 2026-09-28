-- V74 는 status_cd='CONFIRMED'(위하고 국세청 전송완료 ynIss='2') 건만 백필했다.
-- 발행했으나 전송완료 전(관리번호 wehago_no_tax 는 부여, status_cd 는 아직 DRAFT 등)인 전자세금계산서는
-- 매출목록엔 노출되지만 confirmed=false 로 남아 통계에서 누락된다. 발행된 건(관리번호 보유) 전체를 확정 처리.
UPDATE sales_mst
SET confirmed = 1,
    confirmed_at = COALESCE(confirmed_at, wehago_issued_at, created_at, NOW())
WHERE sales_type = 'TAX_INVOICE'
  AND (
        (wehago_no_tax IS NOT NULL AND wehago_no_tax <> '')
        OR wehago_yn_iss = '2'
        OR status_cd = 'ISSUE_EXCLUDED'
      )
  AND (confirmed = 0 OR confirmed IS NULL);
