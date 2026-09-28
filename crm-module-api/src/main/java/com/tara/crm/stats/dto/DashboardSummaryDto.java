package com.tara.crm.stats.dto;

import lombok.*;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DashboardSummaryDto {
    private long totalSalesAmount;      // 누적 매출액 (당월 확정 매출 합계)
    private int newOrderCount;          // 신규 주문 건수 (당월)
    private int activeCustomerCount;    // 활성 거래처 수 (최근 3개월 주문 있는 거래처)
    private double avgMarginRate;       // 평균 마진율 (최근 3개월)
    private long confirmedSalesAmount;  // 총주문 — SALES_REGISTERED 주문 금액 합계 (연 누적)
    private int unprocessedSalesCount;  // 미처리매출 — 매출확정 아닌 주문 건수
    private int unSettledSalesCount;    // 미정산매출 — SHIPPED(발송완료) 주문 건수
}
