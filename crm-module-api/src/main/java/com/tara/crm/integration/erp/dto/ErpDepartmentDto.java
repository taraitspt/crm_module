package com.tara.crm.integration.erp.dto;

import lombok.*;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ErpDepartmentDto {
    private String deptCd;
    private String deptNm;
    /** MA_DEPT_MST.UP_DEPT_CD — 상위 부서 코드. departments.up_dept_cd 로 저장한다(2026-10-02) */
    private String upDeptCd;
    private String upDeptNm;
}
