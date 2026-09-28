package com.tara.crm.auth.dto;

import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class UpdateCcCdRequest {

    /**
     * 비용센터 코드 (cc_cd).
     * - 4자 영숫자 또는 빈 문자열(NULL 처리) 허용.
     */
    @Pattern(regexp = "^$|^[A-Za-z0-9]{4}$", message = "cc_cd는 4자 영숫자 또는 빈 문자열이어야 합니다.")
    private String ccCd;
}
