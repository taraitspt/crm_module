package com.tara.crm.integration.erp.dto;

import lombok.*;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ErpPlantDto {
    private String companyCd;
    private String plantCd;
    private String plantNm;
    private String bizareaCd;
    private String bizareaNm;
}
