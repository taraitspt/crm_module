package com.tara.crm.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
@AllArgsConstructor
public class TokenResponse {

    private String accessToken;
    private String tokenType;
    /** 시트 #1 MFA — 2차인증 필요 시 mfaRequired=true + mfaChallenge 발급, accessToken 은 null. */
    private Boolean mfaRequired;
    private String mfaChallenge;
    /** 임시 비밀번호로 로그인한 경우 true — 프론트가 새 비밀번호 설정 화면으로 강제 유도. */
    private Boolean passwordResetRequired;
}
