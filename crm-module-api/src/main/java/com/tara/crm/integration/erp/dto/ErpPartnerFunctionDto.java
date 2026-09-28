package com.tara.crm.integration.erp.dto;

import lombok.*;

@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class ErpPartnerFunctionDto {
    private String companyCd;
    private String partnerCd;
    private String partnerNm;
    private String salesorgnCd;
    private String dischCd;
    private String prductgrpCd;
    private String prtnrFnCd;
    private String prtnrCd;
    private String partnerBpName;
    private String partnerBpDeptCd;
    private String partnerBpDeptName;
    private String defaultYn;
}
