package com.tara.crm.info.dto;

import lombok.*;

import java.util.ArrayList;
import java.util.List;

/** 월매출계획 / 매출현황(계획 대비 실적) DTO */
public class SalesPlanDto {

    /** 한 달치 계획 (공임/용지) */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class MonthAmt {
        private String planMm;
        private Long laborAmt;
        private Long paperAmt;
    }

    /** 계획 1행 = 담당자 × 거래처, 12개월 */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class PlanRow {
        private String salesEmpId;
        private String empNm;
        private Integer deptCd;
        private String deptNm;
        private String partnerCd;
        private String partnerNm;
        @Builder.Default
        private List<MonthAmt> months = new ArrayList<>();
    }

    /**
     * 저장 요청. salesEmpIds 에 포함된 담당자의 해당 연도 계획은 rows 내용으로 통째로 교체된다
     * (rows 에 없는 거래처는 삭제). 화면에서 지운 행이 반영되도록 담당자 목록을 명시적으로 보낸다.
     */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class SaveRequest {
        private String planYy;
        private List<String> salesEmpIds;
        private List<PlanRow> rows;
    }

    /** 담당자 선택용 사용자 옵션 */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class UserOption {
        private String id;
        private String name;
        private Integer deptCd;
        private String deptNm;
    }

    /**
     * 매출현황 월 셀: 계획 vs ERP 실적.
     * 계획은 공임/용지로 나뉘지만(planLaborAmt/planPaperAmt), 실적은 ERP 매출전표(SD_BILL)에
     * 공임·용지 구분이 없어 합계(actualAmt)만 내려간다.
     */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class StatusMonth {
        private String planMm;
        /** 공임 + 용지 */
        private Long planAmt;
        private Long planLaborAmt;
        private Long planPaperAmt;
        private Long actualAmt;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class StatusRow {
        private Integer deptCd;
        private String deptNm;
        private String salesEmpId;
        private String empNm;
        private String partnerCd;
        private String partnerNm;
        @Builder.Default
        private List<StatusMonth> months = new ArrayList<>();
        private Long planTotal;
        private Long actualTotal;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class StatusResponse {
        @Builder.Default
        private List<StatusRow> rows = new ArrayList<>();
        private Long planTotal;
        private Long actualTotal;
        /** ERP(Oracle) 실적 조회 성공 여부. false 면 actualAmt 는 전부 0 이고 erpMessage 에 사유. */
        private boolean erpAvailable;
        private String erpMessage;
    }
}
