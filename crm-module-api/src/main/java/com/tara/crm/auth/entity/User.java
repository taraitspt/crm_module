package com.tara.crm.auth.entity;

import com.tara.crm.common.audit.BaseEntity;
import com.tara.crm.common.id.UserId;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "users")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class User extends BaseEntity {

    @EmbeddedId
    private UserId id;

    @Column(name = "employee_no", nullable = false, length = 20)
    private String employeeNo;

    @Column(name = "password", nullable = false)
    private String password;

    @Column(name = "name", nullable = false, length = 50)
    private String name;

    @Column(name = "phone", length = 20)
    private String phone;

    /** 사무실/직통 연락처. phone 은 휴대폰 번호로 구분. */
    @Column(name = "contact_phone", length = 20)
    private String contactPhone;

    @Column(name = "email", length = 100)
    private String email;

    /** 시트 #1 0504 — 직책 (예: 파트장, 팀장, 사원). 견적서 담당자 표기 등에 사용. */
    @Column(name = "job_title", length = 50)
    private String jobTitle;

    @Column(name = "dept_cd")
    private Integer deptCd;

    @Column(name = "cc_cd", length = 20)
    private String ccCd;

    /** 비용센터명 (CC_NM). */
    @Column(name = "cc_nm", length = 20)
    private String ccNm;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    @Builder.Default
    private UserStatus status = UserStatus.ACTIVE;

    /** 시트 #1 — 2차인증 (이메일 OTP) 활성화 여부. 기본 false. */
    @Column(name = "mfa_enabled", nullable = false)
    @Builder.Default
    private Boolean mfaEnabled = false;

    /** 임시 비밀번호로 발급된 상태 — 다음 로그인 시 새 비밀번호 설정을 강제한다. 변경 완료 시 해제. */
    @Column(name = "must_change_password", nullable = false)
    @Builder.Default
    private Boolean mustChangePassword = false;

    public boolean isActive() {
        return this.status == UserStatus.ACTIVE;
    }

    /** 임시 비밀번호 발급 — 비밀번호 교체 + 강제 변경 플래그 ON. */
    public void applyTempPassword(String encodedPassword) {
        this.password = encodedPassword;
        this.mustChangePassword = true;
    }

    public void changePassword(String encodedPassword) {
        this.password = encodedPassword;
        this.mustChangePassword = false;   // 사용자가 직접 비밀번호를 바꾸면 강제 변경 요구 해제
    }

    public void updateStatus(UserStatus status) {
        this.status = status;
    }

    public void setCcCd(String ccCd) {
        this.ccCd = (ccCd == null || ccCd.isBlank()) ? null : ccCd;
    }

    /** ERP 동기화용 setter — 시트 #65 사원 일괄 upsert. */
    public void setDeptCd(Integer deptCd) { this.deptCd = deptCd; }
    public void setName(String name) { if (name != null && !name.isBlank()) this.name = name; }
    public void setEmail(String email) { this.email = email; }
    public void setPhone(String phone) { this.phone = phone; }
    public void setContactPhone(String contactPhone) { this.contactPhone = contactPhone; }
    public void setJobTitle(String jobTitle) { this.jobTitle = jobTitle; }
    public void setMfaEnabled(Boolean mfaEnabled) { this.mfaEnabled = mfaEnabled != null && mfaEnabled; }

    /** 관리자 '사용자 관리' 화면에서만 바꾼다 — ERP 동기화는 역할·상태를 건드리지 않는다. */
    public void setRole(Role role) { if (role != null) this.role = role; }

    public void setStatus(UserStatus status) { if (status != null) this.status = status; }
}
