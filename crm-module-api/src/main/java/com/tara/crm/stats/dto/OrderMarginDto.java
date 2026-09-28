package com.tara.crm.stats.dto;

import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OrderMarginDto {
    private List<OrderMarginRow> orders;

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class OrderMarginRow {
        private String orderNo;
        private Integer orderSq;
        private String orderKey;
        private String vendorName;            // 거래처명
        private String departmentName;        // 영업부서
        private String managerName;           // 담당자
        private String workName;              // 작업명
        private Long orderAmount;             // 매출액
        private Long outsourcingAmount;       // 외주원가
        private Long marginAmount;            // 마진액
        private Double marginRate;            // 마진율 %
        private String salesDate;
        private String remark;                // 비고
    }
}
