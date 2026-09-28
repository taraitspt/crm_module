package com.tara.crm.stats.dto;

import lombok.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 채권연령분석 — 더존 채권원장(FI_BAN_MST/FI_BAN_DTL)을 기준일 시점 잔액으로 다시 계산해 연령버킷으로 나눈 것.
 * 행 단위는 더존 화면과 같다(회계단위·작성부서·작성자·거래처·계정). 사업부/거래처 집계는 화면에서 한다.
 * 사업부는 계정으로 가른다 — TPS=10801 국내외상매출금, GRP=10805 그래픽스외상매출금, PM=10804 PM사업외상매출금.
 */
@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ReceivableAgingDto {
    /** 기준일(YYYY-MM-DD). 잔액은 이 날짜 시점, 연령버킷은 이 날짜에서 거꾸로 30일 단위. */
    private String baseDate;
    private List<Row> rows;
    /** 올해 매출 집계 기간 — 기준월 포함 최근 3개월. 채권율·회수기한 분모. */
    private SalesWindow sales;
    /** 전년 비교 기준일 — 기준일의 정확히 1년 전. */
    private String prevBaseDate;
    /** 전년 기준일 시점 사업부별 잔액 (TPS/GRP/PM). */
    private Map<String, BigDecimal> prevTotals;
    /** 전년 매출 집계 기간 — 전년 기준월 포함 최근 3개월. */
    private SalesWindow prevSales;

    /**
     * 매출 집계 창. 채권율 = 잔액 ÷ (amounts ÷ months) × 100, 회수기한 = 잔액 ÷ (amounts ÷ days).
     * 금액은 부가세 포함(SPLY_AMT + TAX_AMT) — 채권잔액과 기준을 맞춘다.
     */
    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class SalesWindow {
        private String from;
        private String to;
        private int months;
        private int days;
        /** 사업부별 기간 매출 합계 (TPS/GRP/PM) */
        private Map<String, BigDecimal> amounts;
    }

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Row {
        private String pcCd;          // 회계단위 (참고용 — 사업부 구분에는 안 쓴다)
        private String pcNm;
        private String division;      // 사업부 TPS/GRP/PM (계정으로 결정)
        private String wrtDeptCd;     // 작성부서
        private String wrtDeptNm;
        private String wrtEmpNo;      // 작성자
        private String wrtKorNm;
        private String partnerCd;     // 거래처코드
        private String partnerNm;     // 거래처명
        private String bizrNo;        // 사업자등록번호
        private String terpayCd;      // 결제조건코드
        private String terpayNm;      // 결제예정일(결제조건명)
        private String acctCd;        // 계정
        private String acctNm;        // 계정명
        private BigDecimal amHjan;    // 기준일 시점 잔액
        private BigDecimal inDay30;   // 30일이내
        private BigDecimal inDay60;   // 60일이내(31~60)
        private BigDecimal inDay90;   // 90일이내(61~90)
        private BigDecimal inDay120;  // 120일이내(91~120)
        private BigDecimal outDay121; // 121일이상
    }
}
