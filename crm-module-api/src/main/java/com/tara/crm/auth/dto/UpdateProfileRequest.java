package com.tara.crm.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 시트 #1 0504_1 — 마이페이지에서 본인 연락처/이메일을 직접 갱신.
 * 사용자가 견적서 등 외부 문서에 표시될 정보를 자가 수정할 수 있게 한다.
 * 빈 문자열은 NULL 로 처리한다 (User.setPhone/setEmail 의 동작에 의존).
 */
@Getter
@Setter
@NoArgsConstructor
public class UpdateProfileRequest {

    @Size(max = 20, message = "휴대폰은 20자 이내여야 합니다.")
    private String phone;

    @Size(max = 20, message = "연락처는 20자 이내여야 합니다.")
    private String contactPhone;

    @Email(message = "올바른 이메일 형식이어야 합니다.")
    @Size(max = 100, message = "이메일은 100자 이내여야 합니다.")
    private String email;

    /** 직책 — 더 이상 본인이 바꾸지 않는다(관리자 > 사용자 관리). 옛 화면 호환으로 필드만 남기고 서버는 무시한다(2026-10-06). */
    @Size(max = 50, message = "직책은 50자 이내여야 합니다.")
    private String jobTitle;
}
