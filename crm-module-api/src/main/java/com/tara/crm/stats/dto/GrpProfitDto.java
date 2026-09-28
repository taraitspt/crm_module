package com.tara.crm.stats.dto;

import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GrpProfitDto {
    private List<Row> rows;

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Row {
        private String salesDate;
        private String departmentName;
        private String salesEmployeeName;
        private String salesNo;
        private String salesTitle;
        private String salesPartnerName;
        private String orderPartnerName;
        private String orderNo;
        private Integer orderSq;
        private String workPlace;
        private String itemCategory;
        private String detailItemName;
        private String breakdown;
        private Long supplyAmount;
        private Long taxAmount;
        private Long totalAmount;
        private String salesType;
        private String division;
        private String accountingDate;
        private Long productPurchaseAmount;
        private Long outsourcingAmount;
        private Long podProductionAmount;
        private Long purchaseTotalAmount;
        private Long grossProfitAmount;
        private Double marginRate;
        private String remark;
    }
}
