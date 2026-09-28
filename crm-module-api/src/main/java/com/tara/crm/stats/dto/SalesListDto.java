package com.tara.crm.stats.dto;

import lombok.*;

import java.util.List;

/**
 * 매출리스트 — ERP 매출모듈(SD_BILL_MST/DTL) 매출 상세 한 줄 = 매출번호·순번.
 * 금액은 매출현황과 같은 원천(DTL.TRAN_AMT 공급가, TAX_AMT 부가세). 반품매출(IVR10)은 음수로 들어온다.
 */
public class SalesListDto {

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Response {
        private List<Row> rows;
        /** 데이터 범위(SALES_STATS) 때문에 빠진 줄 수 — 0 이면 전부 보이는 것. */
        private int hiddenByScope;
    }

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Row {
        /** 매출일 yyyy-MM-dd */
        private String billDate;
        private String billNo;
        private Integer billSq;
        /** 매출유형 코드(IV100 등)와 ERP 매출유형 마스터 명칭(일반매출/반품매출) */
        private String billType;
        private String billTypeName;
        /** 사업부문(공장) 1000 TPS / 2000 GRP / 3000 PM */
        private String plantCd;
        private String partnerCd;
        private String partnerName;
        private String bizNo;
        /** 영업조직(부서) — 매출현황의 부서와 같은 값 */
        private String salesDeptCd;
        private String salesDeptName;
        /** 비용센터 — CRM 부서 범위 판정에 쓴다 */
        private String ccCd;
        /** 영업담당 ERP 사번과 이름 */
        private String salesEmpNo;
        private String salesEmpName;
        private String itemCd;
        private String itemName;
        private Double qty;
        private Double unitPrice;
        /** 공급가액 */
        private Long supplyAmt;
        /** 부가세 */
        private Long taxAmt;
        /** 합계 = 공급가액 + 부가세 */
        private Long totalAmt;
        /** 수주번호·순번 (TSO/SO…) */
        private String soNo;
        private Integer soSq;
        /** 회계전표번호 */
        private String docuNo;
        private String remark;
    }
}
