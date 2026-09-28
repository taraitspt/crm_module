package com.tara.crm.auth.dto;

import com.tara.crm.auth.entity.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
@AllArgsConstructor
public class UserResponse {

    private String id;
    private Integer companyCd;
    private String employeeNo;
    private String name;
    private String phone;
    private String contactPhone;
    private String email;
    private String role;
    private String status;
    private Integer deptCd;
    private String departmentName;
    private String ccCd;
    /** 시트 #1 0504 — 직책 (예: 파트장, 팀장, 사원). */
    private String jobTitle;
    /** 시트 #1 — 2차인증 활성 여부. */
    private Boolean mfaEnabled;

    public static UserResponse from(User user) {
        return from(user, null);
    }

    public static UserResponse from(User user, String departmentName) {
        return UserResponse.builder()
                .id(user.getId().getId())
                .companyCd(user.getId().getCompanyCd())
                .employeeNo(user.getEmployeeNo())
                .name(user.getName())
                .phone(user.getPhone())
                .contactPhone(user.getContactPhone())
                .email(user.getEmail())
                .role(user.getRole().name())
                .status(user.getStatus().name())
                .deptCd(user.getDeptCd())
                .departmentName(departmentName)
                .ccCd(user.getCcCd())
                .jobTitle(user.getJobTitle())
                .mfaEnabled(user.getMfaEnabled() != null && user.getMfaEnabled())
                .build();
    }
}
