package com.tara.crm.integration.erp.dto;

import lombok.*;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ErpItemDto {
    private String itemCd;
    private String itemNm;
    private String itemSpecDc;
    private String stdUnitCd;
}
