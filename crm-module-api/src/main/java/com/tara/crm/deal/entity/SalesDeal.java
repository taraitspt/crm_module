package com.tara.crm.deal.entity;

import com.tara.crm.common.audit.BaseEntity;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;

/** 수주 추진(딜) 1건. */
@Entity
@Table(name = "sales_deal")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SalesDeal extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "deal_id")
    private Long dealId;

    @Column(name = "company_cd", nullable = false)
    private Integer companyCd;

    @Column(name = "partner_cd", length = 20)
    private String partnerCd;

    @Column(name = "partner_nm", length = 200)
    private String partnerNm;

    @Column(name = "sales_emp_id", nullable = false, length = 20)
    private String salesEmpId;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "stage", nullable = false, length = 20)
    private String stage;

    @Column(name = "expected_amt", nullable = false)
    private Long expectedAmt;

    @Column(name = "probability", nullable = false)
    private Integer probability;

    @Column(name = "expected_close_dt")
    private LocalDate expectedCloseDt;

    @Column(name = "closed_dt")
    private LocalDate closedDt;

    @Column(name = "lost_reason", length = 500)
    private String lostReason;

    @Lob
    @Column(name = "content")
    private String content;
}
