package com.tara.crm.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 시트 #1 0504 — 마이페이지 비밀번호 변경 요청.
 * 현재 비밀번호로 본인 확인 후 새 비밀번호로 교체한다.
 */
@Getter
@Setter
@NoArgsConstructor
public class ChangePasswordRequest {

    @NotBlank(message = "현재 비밀번호를 입력하세요.")
    private String currentPassword;

    @NotBlank(message = "새 비밀번호를 입력하세요.")
    @Size(min = 8, max = 64, message = "새 비밀번호는 8~64자여야 합니다.")
    private String newPassword;
}
