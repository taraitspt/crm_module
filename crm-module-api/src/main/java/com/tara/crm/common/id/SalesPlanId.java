package com.tara.crm.common.id;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;

/** sales_plan 복합키: 회사·연도·월·영업담당자(users.id)·거래처코드 */
@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class SalesPlanId implements Serializable {

    @Column(name = "company_cd")
    private Integer companyCd;

    @Column(name = "plan_yy", length = 4)
    private String planYy;

    @Column(name = "plan_mm", length = 2)
    private String planMm;

    @Column(name = "sales_emp_id", length = 20)
    private String salesEmpId;

    @Column(name = "partner_cd", length = 20)
    private String partnerCd;
}
