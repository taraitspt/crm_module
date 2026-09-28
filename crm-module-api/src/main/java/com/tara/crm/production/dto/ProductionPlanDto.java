package com.tara.crm.production.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

/** 생산계획현황 (TPS, 공장 1000) — ERP 생산계획현황 화면의 탭별 행. */
public class ProductionPlanDto {

    /** 제판 탭 한 행 = 계획번호·계획순번·하위순번 단위. */
    @Data
    @Builder
    public static class PlateRow {
        private String planNo;
        private Integer planSq;
        private Integer planLowSq;
        /** 계획일 yyyy-MM-dd */
        private String planDate;
        private String orderNo;
        private String orderName;
        private Integer orderSq;
        private String partnerName;
        private String itemCd;
        /** ERP 정본 그대로 — 용지(PPIX.MTRIL_CD) 기준 CI_ITEM 명이라 용지명과 같게 나온다. */
        private String itemName;
        private String detailItemName;
        private BigDecimal orderQty;
        private String configName;
        private String processName;
        private String workName;
        /** 대수 */
        private BigDecimal pressSq;
        private String equipmentName;
        private String materialCd;
        private String materialName;
        /** 재단규격 */
        private String cutSize;
        /** 면수 */
        private BigDecimal pages;
        /** 터잡기 */
        private String imposition;
        /** 절수 */
        private BigDecimal cutCount;
        private BigDecimal generalFront;
        private BigDecimal generalBack;
        private BigDecimal spotFront;
        private BigDecimal spotBack;
        /** 판수 */
        private BigDecimal plateCount;
        /** 합대모품목여부 */
        private String groupParentYn;
        /** 합대자품목여부 */
        private String groupChildYn;
        /** 합대기준순번 */
        private BigDecimal groupSq;
        /** 사내단가/금액 */
        private BigDecimal workUnitPrice;
        private BigDecimal workAmount;
        /** 표준단가/금액 */
        private BigDecimal stdUnitPrice;
        private BigDecimal stdAmount;
        /** 대수마감여부 Y/N */
        private String pressCloseYn;
        /** 실적상태 코드(MA_CODEDTL CI/P00070) — 실적 연동 전이면 null */
        private String resultStatusCd;
        /** 실적상태명 — 실적 연동 전이면 '실적없음' */
        private String resultStatusName;
        /** 실적일자 yyyy-MM-dd */
        private String resultDate;
    }
}
