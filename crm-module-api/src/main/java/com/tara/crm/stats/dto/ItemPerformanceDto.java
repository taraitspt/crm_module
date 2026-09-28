package com.tara.crm.stats.dto;

import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ItemPerformanceDto {
    private List<CategoryPerformance> categories;
    private Long grandTotal;

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class CategoryPerformance {
        private String category;
        private String categoryLabel;
        private String categoryCode;       // 품목코드
        private String classification;     // 분류
        private Long totalAmount;          // 매출액
        private Long costAmount;           // 원가
        private Long marginAmount;         // 마진액
        private Double marginRate;         // 마진율
        private Integer orderCount;        // 판매수량
        private Double shareRate;          // 비중 %
        private String topVendor;          // 주요거래처
    }
}
