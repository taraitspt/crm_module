package com.tara.crm.integration.erp.dto;

import lombok.*;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ErpDepartmentDto {
    private String deptCd;
    private String deptNm;
    private String upDeptNm;
}
