package com.tara.crm.stats.dto;

import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VendorMarginDto {
    private List<VendorMarginRow> vendors;

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class VendorMarginRow {
        private String vendorName;
        private String departmentName;        // 부서명
        private Long orderAmount;             // 매출액
        private Long outsourcingAmount;       // 외주원가
        private Long marginAmount;            // 마진액
        private Double marginRate;            // 마진율 %
        private Double prevMonthMarginRate;   // 전월마진율
        private Double marginRateChange;      // 증감
        private Integer orderCount;           // 건수
        private String remark;                // 비고
    }
}
