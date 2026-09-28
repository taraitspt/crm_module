package com.tara.crm.stats.dto;

import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ItemPartPerformanceDto {
    private List<Row> rows;
    private Long grandTotal;

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Row {
        private String departmentCd;
        private String departmentName;
        private Long designAmount;
        private Long manualWorkAmount;
        private Long deliveryAmount;
        private Long totalAmount;
        private Integer totalSalesCount;
        private Integer noExtraCostCount;
        private Integer designCount;
        private Integer manualWorkCount;
        private Integer deliveryCount;
        @com.fasterxml.jackson.annotation.JsonIgnore private String itemCode;
        @com.fasterxml.jackson.annotation.JsonIgnore private String itemLabel;
        @com.fasterxml.jackson.annotation.JsonIgnore private String partCode;
        @com.fasterxml.jackson.annotation.JsonIgnore private String partLabel;
        @com.fasterxml.jackson.annotation.JsonIgnore private Long amount;
        private Integer orderCount;
        @com.fasterxml.jackson.annotation.JsonIgnore private Double shareRate;
    }
}
