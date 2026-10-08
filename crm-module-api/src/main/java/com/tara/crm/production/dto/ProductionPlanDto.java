package com.tara.crm.production.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

/** 생산계획현황 (TPS, 공장 1000) — ERP 생산계획현황 화면의 탭별 행. */
public class ProductionPlanDto {

    /** 탭 — ERP 화면 탭 순서(인쇄·제판·후가공·접지·제본). URL 경로값이 enum 이름 소문자. */
    public enum Tab { PRINT, PLATE, PROCESS, FOLD, BIND }

    /**
     * 한 행 = 계획번호·계획순번·하위순번 단위. 다섯 탭 컬럼의 합집합이라 탭에 없는 값은 null 로 내려간다
     * (어느 탭이 어떤 컬럼을 쓰는지는 화면 컬럼 정의가 안다). 탭별 DTO 다섯 개보다 한 벌이 다루기 쉽다.
     */
    @Data
    @Builder
    public static class Row {
        // ── 공통 ──
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
        /** 제판 탭은 ERP 정본 그대로 용지(PPIX.MTRIL_CD) 기준 CI_ITEM 명이라 용지명과 같게 나온다. */
        private String itemName;
        private String detailItemName;
        /** 주문수량 — 접지·제본에선 작업수량(ORD_QT) */
        private BigDecimal orderQty;
        private String configName;
        private String processName;
        /** 계열(INTLTSH_NM) — 제판 탭에는 없음 */
        private String seriesName;
        private String workName;
        /** 대수 — 제본 탭에는 없음(전체대수 fullPressCount) */
        private BigDecimal pressSq;
        private String equipmentName;
        /** 외주 발주 업체 — 설비가 외주 자리표시("외주(톰슨)" 등)일 때 실제 업체. 발주 없으면 null. */
        private String vendorName;
        /** 외주 발주 납기요청일(= 입고요청일) yyyy-MM-dd. */
        private String poReqDate;
        /** 재단규격 / 터잡기 / 면수 / 절수 — 제본 탭에는 없음 */
        private String cutSize;
        private String imposition;
        private BigDecimal pages;
        private BigDecimal cutCount;
        /** 사내단가/금액 */
        private BigDecimal workUnitPrice;
        private BigDecimal workAmount;
        /** 표준단가/금액 */
        private BigDecimal stdUnitPrice;
        private BigDecimal stdAmount;
        /** 대수마감여부 Y/N */
        private String pressCloseYn;
        /** 완료 = 대수마감 Y 또는 외부입고 설비 (ProductionRules — 주문 타임라인와 같은 기준) */
        private String doneYn;
        /** 설비가 외부입고(…) — 대수마감 없이 완료로 본다 */
        private String extYn;
        /** 실적상태 코드(MA_CODEDTL CI/P00070) — 실적 연동 전이면 null */
        private String resultStatusCd;
        /** 실적상태명 — 실적 연동 전이면 '실적없음' */
        private String resultStatusName;
        /** 실적일자 yyyy-MM-dd */
        private String resultDate;

        // ── 인쇄·제판 ──
        private String materialCd;
        private String materialName;
        private BigDecimal generalFront;
        private BigDecimal generalBack;
        private BigDecimal spotFront;
        private BigDecimal spotBack;
        /** 판수 */
        private BigDecimal plateCount;
        /** 합대모품목여부 / 합대자품목여부 / 합대기준순번 */
        private String groupParentYn;
        private String groupChildYn;
        private BigDecimal groupSq;

        // ── 인쇄 ──
        private BigDecimal startPage;
        private BigDecimal endPage;
        /** 제판정보(PLMK_NM) */
        private String plateInfoName;
        /** 정미/여분/정미여분합/조정 연수 */
        private BigDecimal netReam;
        private BigDecimal spareReam;
        private BigDecimal fullReam;
        private BigDecimal adjReam;
        /** 재단횟수 */
        private BigDecimal cutTimes;
        /** 정미/여분/정미여분합/조정/정미조정합 매수 */
        private BigDecimal netSheets;
        private BigDecimal spareSheets;
        private BigDecimal fullSheets;
        private BigDecimal adjSheets;
        private BigDecimal adjSheetsSum;
        /** 통수 */
        private BigDecimal tongCount;
        /** 합대 정미/여분/조정 */
        private BigDecimal groupNet;
        private BigDecimal groupSpare;
        private BigDecimal groupAdj;

        // ── 후가공 ──
        /** 작업수량(PROC_QT) */
        private BigDecimal procQty;

        // ── 접지·제본 ──
        /** 작업단위(ORD_UNIT_CD) */
        private String orderUnitCd;

        // ── 제본 ──
        private BigDecimal fullPressCount;
        private BigDecimal fullPageCount;
        private BigDecimal totalPages;
        /** 제품여부 YES/NO */
        private String lastYn;
    }
}
