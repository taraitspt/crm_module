-- 전표 역분개(reverseSlip) 결과 추적용.
-- 원본 전표(slip_no)는 보존하고, 더존이 채번한 역분개 전표번호를 별도 컬럼에 저장한다.
-- erp_voucher_status='REVERSED' 로 표시하여 재전송/재역분개를 막는다.
ALTER TABLE voucher_mst ADD COLUMN IF NOT EXISTS reverse_slip_no VARCHAR(30) NULL COMMENT '더존 역분개 전표번호(원본 slip_no 의 반대분개)';
