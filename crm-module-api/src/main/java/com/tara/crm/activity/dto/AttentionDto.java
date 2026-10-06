package com.tara.crm.activity.dto;

import lombok.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 관리 필요 거래처 — ERP 매출 + 월매출계획 + 영업활동을 합쳐 "지금 챙겨야 할 곳"을 뽑는다. */
public class AttentionDto {

    /**
     * 판정 사유. 한 거래처에 여러 개가 동시에 붙을 수 있다.
     *
     * 주의 신호
     *  CHURN     : 작년엔 거래했는데 올해 매출이 0 — 이탈
     *  DECLINE   : 올해 매출이 작년의 절반 미만 — 급감
     *  NO_PLAN   : 올해 매출이 있는데 월매출계획에 없음 — 계획 누락
     *  NO_CONTACT: 계획에 있는데 최근 영업활동 기록이 없음 — 장기 미접촉
     *
     * 기회 신호 — 잘 되는 곳도 방치하면 뺏긴다. 주의 신호와 같은 화면에서 본다.
     *  VIP    : 올해 매출 상위 N위 — 핵심 거래처
     *  GROWTH : 올해 매출이 작년 대비 기준(기본 130%) 이상 — 성장
     *  NEW    : 작년 거래가 없다가 올해 발생 — 신규
     */
    /** PROSPECT = 개척 중: 매출(올해·작년)은 없지만 영업활동이 있는 거래처 — 활동만으로도 관리필요에 올린다(2026-10-06). */
    public enum Reason { CHURN, DECLINE, NO_PLAN, NO_CONTACT, VIP, GROWTH, NEW, PROSPECT }

    /** 거래처를 담당하는 부서 한 곳과 그 부서가 올린 매출 */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class DeptShare {
        private Integer deptCd;
        private String deptNm;
        /** 비용센터코드 — 부서명을 못 찾았을 때 대신 보여준다 */
        private String ccCd;
        private long amt;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Item {
        private String partnerCd;
        private String partnerNm;
        /**
         * 담당부서 — 올해 이 거래처에 매출을 올린 부서들(매출 큰 순).
         * 계획 등록 여부와 무관하며, 한 거래처를 여러 부서가 나눠 담당할 수 있어 복수다.
         */
        @Builder.Default
        private List<DeptShare> depts = new ArrayList<>();
        /** 올해 전표가 없어 작년 전표에서 담당부서를 가져온 경우 — 화면에서 "작년 기준"으로 표시 */
        private boolean deptFromPrevYear;
        /** 표시용 요약 — depts 를 쉼표로 이은 값 */
        private String deptNm;
        /** 작년 매출 */
        private long prevAmt;
        /** 올해 매출 */
        private long curAmt;
        /** 작년 대비 증감률(%) — 작년이 0이면 null */
        private Double changeRate;
        /** 마지막 ERP 매출 전표일 */
        private LocalDate lastBillDt;
        private boolean hasPlan;
        /** 올해 계획 금액(공임+용지) */
        private long planAmt;
        private String ownerEmpId;
        private String ownerNm;
        private LocalDate lastActivityDt;
        /** 마지막 활동 이후 경과일 — 활동이 없으면 null */
        private Integer daysSinceActivity;
        /** 올해 매출 순위 (1 = 최대). VIP 판정 근거이자 화면 표시용 */
        private Integer salesRank;
        @Builder.Default
        private List<String> reasons = new ArrayList<>();
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Response {
        @Builder.Default
        private List<Item> items = new ArrayList<>();
        /** 사유별 건수 — 화면 상단 요약 타일 */
        @Builder.Default
        private Map<String, Integer> byReason = new LinkedHashMap<>();
        private int total;
        /** 조회 기간 — 1~12월. 올해·작년을 같은 구간으로 자른다. */
        private int fromMm;
        private int toMm;
        /** 판정에 쓴 기준값 (화면 안내용) */
        private int noContactDays;
        private long minAmt;
        /** 성장 판정 기준(%) */
        private int growthRate;
        /** VIP 로 볼 올해 매출 상위 건수 */
        private int vipTopN;
        private boolean erpAvailable;
        private String erpMessage;
    }
}
