package com.tara.crm.activity.entity;

import com.tara.crm.common.audit.BaseEntity;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;

/** 영업활동 1건 — 담당자·거래처·일자 기준 기록. */
@Entity
@Table(name = "sales_activity")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SalesActivity extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "activity_id")
    private Long activityId;

    @Column(name = "company_cd", nullable = false)
    private Integer companyCd;

    @Column(name = "activity_dt", nullable = false)
    private LocalDate activityDt;

    @Column(name = "sales_emp_id", nullable = false, length = 20)
    private String salesEmpId;

    @Column(name = "partner_cd", length = 20)
    private String partnerCd;

    @Column(name = "partner_nm", length = 200)
    private String partnerNm;

    @Column(name = "activity_type", nullable = false, length = 20)
    private String activityType;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Lob
    @Column(name = "content")
    private String content;

    @Column(name = "next_action_dt")
    private LocalDate nextActionDt;

    @Column(name = "next_action", length = 500)
    private String nextAction;

    @Column(name = "amount")
    private Long amount;

    /** 연결된 수주 추진. 없으면 null — 딜과 무관한 일반 활동. */
    @Column(name = "deal_id")
    private Long dealId;
}
