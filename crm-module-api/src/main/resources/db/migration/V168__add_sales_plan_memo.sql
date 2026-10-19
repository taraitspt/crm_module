-- 월매출계획 거래처 × 월 메모 = 계획 대비 증감사유(수주불발·이월·초과 사유 등) (사용자 요청 2026-10-19)
-- 매출현황(계획 대비)에서 실적을 보며 적고, 월매출계획 화면에도 같이 보인다.
ALTER TABLE sales_plan ADD COLUMN memo VARCHAR(500) NULL COMMENT '증감사유(월 메모)';
