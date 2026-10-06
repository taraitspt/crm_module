package com.tara.crm.auth.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.*;

/** 사용자 관리(관리자) DTO */
public class UserAdminDto {

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Item {
        private String id;
        private String employeeNo;
        private String name;
        private Integer deptCd;
        private String deptNm;
        /** 직책 — JobTitle.ALL 중 하나 (매니저/파트장/센터장/팀장/본부장/대표이사/회장). 관리자만 바꾼다 */
        private String jobTitle;
        private String role;
        /** 역할에서 파생된 리소스별 데이터 범위 — 리소스 → NONE / SELF / DEPT / ALL */
        private java.util.Map<String, String> scopes;
        private String status;
        private String email;
        private String phone;
        private boolean mustChangePassword;
        /** 연속 로그인 실패 횟수 */
        private int failedLoginCount;
        /** 잠금 해제 시각 — null 이면 잠기지 않음 */
        private java.time.LocalDateTime lockedUntil;
        /** 지금 잠겨 있는가(lockedUntil 이 미래) */
        private boolean locked;
    }

    /** 역할·부서·직책·상태만 바꾼다. 이름·연락처는 ERP 동기화가 주인이라 여기서 손대지 않는다. */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class UpdateRequest {
        @NotBlank(message = "역할은 필수입니다.")
        private String role;
        private Integer deptCd;
        /** 직책 — 비우면 바꾸지 않는다. JobTitle.ALL 밖의 값은 400 */
        private String jobTitle;
        private String status;
    }

    /** 여러 명 상태 일괄 변경 — status = ACTIVE(재직) / INACTIVE(미사용·퇴직) */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class BulkStatusRequest {
        private java.util.List<String> userIds;
        private String status;
    }
}
