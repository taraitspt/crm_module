package com.tara.crm.info.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.*;

/** 고객 담당자 연락처 DTO */
public class PartnerContactDto {

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Item {
        private Long contactId;
        private String partnerCd;
        private String name;
        private String positionNm;
        private String deptNm;
        private String phone;
        private String tel;
        private String email;
        private boolean isPrimary;
        private String memo;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class SaveRequest {
        @NotBlank(message = "거래처는 필수입니다.")
        private String partnerCd;
        @NotBlank(message = "이름은 필수입니다.")
        private String name;
        private String positionNm;
        private String deptNm;
        private String phone;
        private String tel;
        private String email;
        private Boolean isPrimary;
        private String memo;
    }
}
