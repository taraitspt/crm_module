package com.tara.crm.info.dto;

import com.tara.crm.activity.dto.ActivityDto;
import com.tara.crm.deal.dto.DealDto;
import lombok.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** 거래처 카드(360도 뷰) — 기본정보·연락처·계획/실적·딜·활동을 한 번에 내려준다. */
public class PartnerOverviewDto {

    /** ERP 거래처 마스터 기본정보 */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Profile {
        private String partnerCd;
        private String partnerNm;
        private String bizrNo;
        private String ceoNm;
        private String bizType;   // 업태
        private String bizItem;   // 종목
        private String address;
        private String telNo;
        private String faxNo;
        /** ERP 에 등록된 거래처 담당자 (CRM 연락처와 별개) */
        private String erpContactNm;
        private String erpContactDeptNm;
        private String erpContactPosition;
        private String erpContactPhone;
        private String erpContactTel;
        private String erpContactEmail;
    }

    /** 올해 계획 vs 실적 */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Performance {
        private int year;
        private long planAmt;
        private long planLaborAmt;
        private long planPaperAmt;
        private String ownerEmpId;
        private String ownerNm;
        private long curAmt;
        private long prevAmt;
        private Double changeRate;
        private LocalDate lastBillDt;
        /** 월별 계획/실적 — 1~12월 */
        @Builder.Default
        private List<MonthPoint> months = new ArrayList<>();
        private boolean erpAvailable;
        private String erpMessage;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class MonthPoint {
        private String planMm;
        private long planAmt;
        private long actualAmt;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Response {
        private Profile profile;
        private Performance performance;
        @Builder.Default
        private List<PartnerContactDto.Item> contacts = new ArrayList<>();
        @Builder.Default
        private List<DealDto.Item> deals = new ArrayList<>();
        @Builder.Default
        private List<ActivityDto.Item> activities = new ArrayList<>();
        private int activityCount;
        private LocalDate lastActivityDt;
    }
}
