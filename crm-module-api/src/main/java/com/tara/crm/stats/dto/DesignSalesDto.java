package com.tara.crm.stats.dto;

import lombok.*;

import java.util.ArrayList;
import java.util.List;

/**
 * 디자인매출통계 (데이터분석 > 디자인매출통계, 2026-09 신설).
 * 디자인 매출 정의(요청서): 내부(I) = 작업처 디자인(S003) 순번 + 일반 주문 디자인비(design_fee),
 *                          외부(O) = 작업처 상품구매(G9999) + 품목구분 디자인(G10S001009) — 현업 확인 전 기본값.
 * 1차: 프론트 선배포용 빈 응답 스텁. 집계 로직은 현업 확인(외부 범위·디자인비 파트 귀속) 후 채운다.
 */
@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DesignSalesDto {
    @Builder.Default private List<Row> rows = new ArrayList<>();
    @Builder.Default private List<CustomerYearlySalesDetailDto.Option> teams = new ArrayList<>();
    @Builder.Default private List<CustomerYearlySalesDetailDto.Option> parts = new ArrayList<>();

    /** 파트 > 영업담당자 > 거래처 > 구분(I/O) 별 월 12칸 집계 행. */
    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Row {
        private String teamCd;
        private String teamName;
        private String partCd;
        private String partName;
        private String salesEmpNo;
        private String salesEmpName;
        private String partnerCd;
        private String partnerName;
        private String businessNo;
        /** I=내부 / O=외부 (합계 T 는 프론트 계산) */
        private String designType;
        private String designTypeLabel;
        private List<Long> monthlyAmounts;
        private Long totalAmount;
    }

    /** 거래처 드릴다운 — 주문 순번 단위 명세. */
    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class DetailRow {
        private String orderDate;
        private String orderNo;
        private Integer orderSq;
        private String orderTitle;
        private String itemName;
        private String workPlaceName;
        private String partnerName;
        private String departmentName;
        private String salesEmpName;
        private String designType;
        private String designTypeLabel;
        /** 디자인 매출액(공급가). S003 순번은 순번 공급가, 일반 주문은 design_fee. */
        private Long amount;
    }
}
