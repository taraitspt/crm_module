package com.tara.crm.stats.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

public class PodProductionDto {

    @Data
    @Builder
    public static class Row {
        private String workPlaceCd;
        private String workPlaceName;
        /** CRM 주문번호 — ERP주문번호(orderNo)+순번(orderSq)을 order_dtl 라인단위 매핑으로 채움. 미매칭 시 null. */
        private String growOrderNo;
        /** CRM 내부 작업 순번(order_dtl.order_sq). ERP 순번(orderSq)과 별도로 표시한다. */
        private Integer growOrderSq;
        private String orderNo;
        private Integer orderSq;
        private String orderName;
        private String orderDate;
        private String salesDepartmentCd;
        private String salesDepartmentName;
        private String salesEmployeeName;
        private String itemType;
        private String itemCd;
        private String itemName;
        private String detailItemName;
        private BigDecimal orderQty;
        private BigDecimal totalPages;
        private BigDecimal imposePages;
        private BigDecimal imposedTotalPages;
        private BigDecimal amount;
        private String size;
        private String packingMethod;
        private String printDirection;
        private String deliveryDueAt;
        private String productionEmployeeName;
        private String productionStatus;
        private String completedAt;
    }

    @Data
    @Builder
    public static class Detail {
        private String process;
        private String composition;
        private String workMethod;
        private String workPlace;
        private String option1;
        private String option2;
        private String option3;
        private String option4;
        private String option5;
        private String materialCd;
        private String materialName;
        private BigDecimal quantity;
        private BigDecimal pages;
        private BigDecimal unitPrice;
        private BigDecimal amount;
        private String size;
        private String remark;
    }

    /** POD 전체 작업사양 (주문일 기준 flat) — GRP생산내역 하단(작업사양)을 기간 전체로 펼친 행. */
    @Data
    @Builder
    public static class SpecRow {
        private String orderNo;          // ERP 주문번호(ORDDOC_NO)
        private Integer orderSq;         // 순번(ORDDOC_SQ)
        private Integer lineSq;          // 작업사양 라인(LINE_SQ)
        private String orderDate;        // 주문일(ORD_DT)
        private String deptCd;
        private String deptName;
        private String productionStatus; // POD생산현황(MC2 SYSDEF_NM)
        private String itemCd;
        private String workCd;           // 작업장코드(WRK_CD)
        private String workName;         // 작업코드명(A)
        private String configCd;
        private String configName;       // 구성명(C)
        private String option1Cd;        // OPT_DC
        private String option1Name;      // 옵션1(B)
        private String option2Cd;        // OPT_DC2
        private String option2Name;      // 옵션2(D)
        private String workPlaceCd;      // 작업처(PRPL_CD)
        private String workPlaceName;    // 작업처 코드명(MA_CODEDTL.SYSDEF_NM)
        private String wcFg;             // 내/외부 구분 플래그(WC_FG)
        private BigDecimal horizontal;   // 가로(HRZN_QT)
        private BigDecimal vertical;     // 세로(VTCL_QT)
        private BigDecimal pageQty;      // 페이지(PAGE_QT)
        private String imposePages;      // 조판페이지(ETC_DC3)
        private BigDecimal orderQty;     // 수량(ORD_QT)
        private BigDecimal unitAmount;   // 단가(UNIT_AMT)
        private BigDecimal amount;       // 금액(SAL_AMT)
    }

    @Data
    @Builder
    public static class Result {
        private List<Row> rows;
        private List<Detail> details;
    }
}
