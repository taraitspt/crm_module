package com.tara.crm.common.id;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.*;

import java.io.Serializable;

@Embeddable
@Getter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class GoalMstId implements Serializable {

    @Column(name = "company_cd")
    private Integer companyCd;

    @Column(name = "plant_cd")
    private Integer plantCd;

    @Column(name = "plan_yy", length = 4)
    private String planYy;

    @Column(name = "plan_mm", length = 2)
    private String planMm;

    @Column(name = "dept_cd", length = 10)
    private String deptCd;

    @Column(name = "sales_emp_id", length = 20)
    private String salesEmpId;

    @Column(name = "field_cd", length = 10)
    private String fieldCd;
}
