package com.tara.crm.auth.entity;

import com.tara.crm.common.audit.BaseEntity;
import com.tara.crm.common.id.DepartmentId;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "departments")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Department extends BaseEntity {

    @EmbeddedId
    private DepartmentId id;

    @Column(name = "dept_nm", nullable = false, length = 100)
    private String deptNm;

    @Column(name = "up_dept_cd")
    private Integer upDeptCd;

    @Column(name = "erp_dept_code", length = 20)
    private String erpDeptCode;

    @Column(name = "cc_cd", length = 20)
    private String ccCd;

    /** 시트 #1 0504_1 — 부서 주소 (견적서/거래명세서 발신자 주소에 사용). */
    @Column(name = "address_zip", length = 10)
    private String addressZip;
    @Column(name = "address_line1", length = 200)
    private String addressLine1;
    @Column(name = "address_line2", length = 200)
    private String addressLine2;

    public void setDeptNm(String deptNm) {
        this.deptNm = deptNm;
    }

    public void setErpDeptCode(String erpDeptCode) {
        this.erpDeptCode = erpDeptCode;
    }
}
