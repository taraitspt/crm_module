package com.tara.crm.auth.controller;

import com.tara.crm.auth.dto.ChangePasswordRequest;
import com.tara.crm.auth.dto.LoginRequest;
import com.tara.crm.auth.dto.TokenResponse;
import com.tara.crm.auth.dto.UpdateCcCdRequest;
import com.tara.crm.auth.dto.UpdateProfileRequest;
import com.tara.crm.auth.dto.UserResponse;
import com.tara.crm.auth.service.AuthService;
import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.common.util.SecurityContextUtil;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@Tag(name = "인증", description = "로그인, 로그아웃 API")
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @Operation(summary = "로그인")
    @PostMapping("/login")
    public ResponseEntity<ApiResponse<TokenResponse>> login(@Valid @RequestBody LoginRequest request) {
        TokenResponse tokenResponse = authService.login(request);
        return ResponseEntity.ok(ApiResponse.ok(tokenResponse));
    }

    @Operation(summary = "로그아웃")
    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(Authentication authentication) {
        authService.logout(authentication.getName());
        return ResponseEntity.ok(ApiResponse.ok());
    }

    /** 시트 #1 — 2차인증 OTP 검증. /auth/login 이 mfaRequired=true 반환 시 호출. */
    @Operation(summary = "2차인증 OTP 검증")
    @PostMapping("/mfa/verify")
    public ResponseEntity<ApiResponse<TokenResponse>> verifyMfa(@RequestBody java.util.Map<String, String> body) {
        TokenResponse tr = authService.verifyMfa(body.get("challenge"), body.get("code"));
        return ResponseEntity.ok(ApiResponse.ok(tr));
    }

    /** 시트 #1 — 2차인증 활성/비활성 토글 (마이페이지). */
    @Operation(summary = "2차인증 토글")
    @PutMapping("/me/mfa")
    public ResponseEntity<ApiResponse<UserResponse>> toggleMfa(
            Authentication authentication,
            @RequestBody java.util.Map<String, Boolean> body
    ) {
        String userId = authentication.getName();
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        boolean enabled = Boolean.TRUE.equals(body.get("enabled"));
        UserResponse userResponse = authService.toggleMfa(userId,
                companyCd != null ? companyCd : 1000, enabled);
        return ResponseEntity.ok(ApiResponse.ok(userResponse));
    }

    @Operation(summary = "내 정보 조회")
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserResponse>> getMe(Authentication authentication) {
        String userId = authentication.getName();
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        UserResponse userResponse = authService.getMe(userId, companyCd != null ? companyCd : 1000);
        return ResponseEntity.ok(ApiResponse.ok(userResponse));
    }

    @Operation(summary = "내 비용센터(cc_cd) 변경")
    @PutMapping("/me/cc-cd")
    public ResponseEntity<ApiResponse<UserResponse>> updateMyCcCd(
            Authentication authentication,
            @Valid @RequestBody UpdateCcCdRequest request
    ) {
        String userId = authentication.getName();
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        UserResponse userResponse = authService.updateMyCcCd(
                userId,
                companyCd != null ? companyCd : 1000,
                request.getCcCd()
        );
        return ResponseEntity.ok(ApiResponse.ok(userResponse));
    }

    /** 시트 #1 0504_1 — 마이페이지 연락처/이메일 갱신. 견적서 등에서 사용. */
    @Operation(summary = "내 연락처/이메일 변경")
    @PutMapping("/me/profile")
    public ResponseEntity<ApiResponse<UserResponse>> updateMyProfile(
            Authentication authentication,
            @Valid @RequestBody UpdateProfileRequest request
    ) {
        String userId = authentication.getName();
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        UserResponse userResponse = authService.updateMyProfile(
                userId,
                companyCd != null ? companyCd : 1000,
                request.getPhone(),
                request.getContactPhone(),
                request.getEmail(),
                request.getJobTitle()
        );
        return ResponseEntity.ok(ApiResponse.ok(userResponse));
    }

    /** 시트 #1 0504 — 비밀번호 변경. 현재 비밀번호 검증 후 새 비밀번호 저장. */
    @Operation(summary = "내 비밀번호 변경")
    @PutMapping("/me/password")
    public ResponseEntity<ApiResponse<Void>> changeMyPassword(
            Authentication authentication,
            @Valid @RequestBody ChangePasswordRequest request
    ) {
        String userId = authentication.getName();
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        authService.changeMyPassword(
                userId,
                companyCd != null ? companyCd : 1000,
                request.getCurrentPassword(),
                request.getNewPassword()
        );
        return ResponseEntity.ok(ApiResponse.ok());
    }
}
