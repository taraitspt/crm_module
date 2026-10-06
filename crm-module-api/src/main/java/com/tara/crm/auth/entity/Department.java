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

    /** 부서장 사번(본부장·팀장 등) — 관리자 › 부서 관리에서 지정, ERP 동기화는 건드리지 않는다(V155) */
    @Column(name = "head_employee_no", length = 20)
    private String headEmployeeNo;

    /** 사용 여부 — "N" 이면 부서 관리 트리·부서 선택에서 숨긴다(V155). 관리자 지정, ERP 동기화는 건드리지 않는다 */
    @Column(name = "use_yn", nullable = false, length = 1)
    @Builder.Default
    private String useYn = "Y";

    /** 같은 상위 부서 안 표시 순서(V155) — 작을수록 위, null 이면 부서 코드 순. 부서 관리에서 끌어다 놓아 정한다 */
    @Column(name = "sort_order")
    private Integer sortOrder;

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

    /** 상위 부서 — ERP 동기화(값이 있을 때)와 관리자 > 부서 관리가 설정한다. null 이면 최상위. */
    public void setUpDeptCd(Integer upDeptCd) {
        this.upDeptCd = upDeptCd;
    }

    public void setSortOrder(Integer sortOrder) {
        this.sortOrder = sortOrder;
    }

    public void setHeadEmployeeNo(String headEmployeeNo) {
        this.headEmployeeNo = (headEmployeeNo == null || headEmployeeNo.isBlank()) ? null : headEmployeeNo.trim();
    }

    public boolean isInUse() {
        return !"N".equals(useYn);
    }

    public void setInUse(boolean inUse) {
        this.useYn = inUse ? "Y" : "N";
    }

    /** 관리자가 부서 관리에서 직접 만든 부서(ERP 에 없는 묶음) — ERP 동기화가 이름을 덮어쓰지 않고, 비어 있으면 지울 수 있다 */
    public boolean isManual() {
        return erpDeptCode == null || erpDeptCode.isBlank();
    }
}
