package com.tara.crm.info.entity;

import com.tara.crm.common.audit.BaseEntity;
import com.tara.crm.common.id.SalesPlanId;
import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 월매출계획 — 영업담당자(users.id)·거래처(ERP 코드)·월별 공임/용지 계획금액. */
@Entity
@Table(name = "sales_plan")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SalesPlan extends BaseEntity {

    @EmbeddedId
    private SalesPlanId id;

    /** 저장 시점의 담당자 부서. 조회 시 사용자 현재 부서를 우선 쓰고, 사용자가 없으면 이 값으로 표시. */
    @Column(name = "dept_cd")
    private Integer deptCd;

    @Column(name = "partner_nm", length = 200)
    private String partnerNm;

    @Column(name = "labor_amt", nullable = false)
    private Long laborAmt;

    @Column(name = "paper_amt", nullable = false)
    private Long paperAmt;
}
