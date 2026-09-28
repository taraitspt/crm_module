package com.tara.crm.service;

import com.tara.crm.auth.dto.LoginRequest;
import com.tara.crm.auth.dto.TokenResponse;
import com.tara.crm.auth.entity.Role;
import com.tara.crm.auth.entity.User;
import com.tara.crm.auth.entity.UserStatus;
import com.tara.crm.auth.jwt.JwtTokenProvider;
import com.tara.crm.auth.repository.UserRepository;
import com.tara.crm.auth.service.AuthHistoryService;
import com.tara.crm.auth.service.AuthService;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.id.UserId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private JwtTokenProvider jwtTokenProvider;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private AuthHistoryService authHistoryService;

    @InjectMocks
    private AuthService authService;

    private User createActiveUser() {
        return User.builder()
                .id(new UserId(1000, "admin"))
                .employeeNo("EMP001")
                .password("$2a$10$encoded")
                .name("관리자")
                .role(Role.ADMIN)
                .status(UserStatus.ACTIVE)
                .deptCd(1000)
                .build();
    }

    @Test
    @DisplayName("로그인 성공 - 올바른 자격증명")
    void login_success() {
        User user = createActiveUser();
        LoginRequest req = new LoginRequest(1000, "EMP001", "admin123");

        when(userRepository.findByCompanyCdAndEmployeeNo(1000, "EMP001"))
                .thenReturn(Optional.of(user));
        when(passwordEncoder.matches("admin123", "$2a$10$encoded"))
                .thenReturn(true);
        when(jwtTokenProvider.generateAccessToken(
                eq("admin"), eq("EMP001"), eq("관리자"), eq("ADMIN"),
                eq(1000), eq(2000), eq(1000)))   // plantCd 는 2000(그래픽스, MySQL 저장 기준값) 고정
                .thenReturn("mock-jwt-token");

        TokenResponse response = authService.login(req);

        assertNotNull(response);
        assertEquals("mock-jwt-token", response.getAccessToken());
        assertEquals("Bearer", response.getTokenType());
    }

    @Test
    @DisplayName("로그인 실패 - 사원번호 미존재")
    void login_fail_userNotFound() {
        LoginRequest req = new LoginRequest(1000, "UNKNOWN", "password");

        when(userRepository.findByCompanyCdAndEmployeeNo(1000, "UNKNOWN"))
                .thenReturn(Optional.empty());

        assertThrows(BusinessException.class, () -> authService.login(req));
    }

    @Test
    @DisplayName("로그인 실패 - 비활성 사용자")
    void login_fail_inactiveUser() {
        User user = User.builder()
                .id(new UserId(1000, "inactive"))
                .employeeNo("EMP002")
                .password("$2a$10$encoded")
                .name("비활성")
                .role(Role.STAFF)
                .status(UserStatus.INACTIVE)
                .build();

        LoginRequest req = new LoginRequest(1000, "EMP002", "password");

        when(userRepository.findByCompanyCdAndEmployeeNo(1000, "EMP002"))
                .thenReturn(Optional.of(user));

        assertThrows(BusinessException.class, () -> authService.login(req));
    }

    @Test
    @DisplayName("로그인 실패 - 비밀번호 불일치")
    void login_fail_wrongPassword() {
        User user = createActiveUser();
        LoginRequest req = new LoginRequest(1000, "EMP001", "wrong");

        when(userRepository.findByCompanyCdAndEmployeeNo(1000, "EMP001"))
                .thenReturn(Optional.of(user));
        when(passwordEncoder.matches("wrong", "$2a$10$encoded"))
                .thenReturn(false);

        assertThrows(BusinessException.class, () -> authService.login(req));
    }

    @Test
    @DisplayName("로그인 - companyCd 미입력 시 기본값 1000 적용")
    void login_defaultCompanyCd() {
        User user = createActiveUser();
        LoginRequest req = new LoginRequest(null, "EMP001", "admin123");

        when(userRepository.findByCompanyCdAndEmployeeNo(1000, "EMP001"))
                .thenReturn(Optional.of(user));
        when(passwordEncoder.matches("admin123", "$2a$10$encoded"))
                .thenReturn(true);
        when(jwtTokenProvider.generateAccessToken(anyString(), anyString(), anyString(),
                anyString(), anyInt(), anyInt(), anyInt()))
                .thenReturn("token");

        TokenResponse response = authService.login(req);
        assertNotNull(response);
    }

    // --- resetPassword 보안(사용자 열거 방지) 회귀방지 ---

    @Test
    @DisplayName("resetPassword — 미존재 ERP ID도 INVALID_CREDENTIALS (열거 차단)")
    void resetPassword_unknownUser_invalidCredentials() {
        when(userRepository.findByCompanyCdAndUserId(1000, "NOPE")).thenReturn(Optional.empty());
        BusinessException ex = assertThrows(BusinessException.class,
                () -> authService.resetPassword(1000, "NOPE"));
        assertEquals(com.tara.crm.common.exception.ErrorCode.INVALID_CREDENTIALS, ex.getErrorCode());
    }
}
