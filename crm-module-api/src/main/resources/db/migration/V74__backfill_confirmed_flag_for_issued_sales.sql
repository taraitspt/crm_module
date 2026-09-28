-- 전자세금계산서 발행완료(statusCd=CONFIRMED) 매출이 confirmed 불리언은 false 로 남아
-- 통계(confirmed=true 기준)에서 누락되던 버그 백필. status_cd 가 CONFIRMED 인데 미확정인 건을 확정 처리한다.
UPDATE sales_mst
SET confirmed = 1,
    confirmed_at = COALESCE(confirmed_at, wehago_issued_at, created_at, NOW())
WHERE status_cd = 'CONFIRMED'
  AND (confirmed = 0 OR confirmed IS NULL);
