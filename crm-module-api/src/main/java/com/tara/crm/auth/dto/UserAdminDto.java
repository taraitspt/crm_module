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
        private String role;
        /** 역할에서 파생된 리소스별 데이터 범위 — 리소스 → NONE / SELF / DEPT / ALL */
        private java.util.Map<String, String> scopes;
        private String status;
        private String email;
        private String phone;
        private boolean mustChangePassword;
    }

    /** 역할·부서·상태만 바꾼다. 이름·연락처는 ERP 동기화가 주인이라 여기서 손대지 않는다. */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class UpdateRequest {
        @NotBlank(message = "역할은 필수입니다.")
        private String role;
        private Integer deptCd;
        private String status;
    }
}
