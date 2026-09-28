package com.tara.crm.auth.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;

/** 비밀번호 분실 — ERP ID(로그인 ID)만 입력받아 임시 비밀번호를 Teams 로 발송. */
@Getter
@NoArgsConstructor
public class PasswordResetRequest {
    private Integer companyCd;
    /** ERP 로그인 ID (users.id.userId). */
    private String loginId;
}
