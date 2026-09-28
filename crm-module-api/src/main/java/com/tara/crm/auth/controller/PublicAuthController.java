package com.tara.crm.auth.controller;

import com.tara.crm.auth.dto.PasswordResetRequest;
import com.tara.crm.auth.service.AuthService;
import com.tara.crm.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Tag(name = "공개 인증", description = "인증 불필요 공개 API (비밀번호 찾기 등)")
@RestController
@RequestMapping("/api/public")
@RequiredArgsConstructor
public class PublicAuthController {

    private final AuthService authService;

    @Operation(summary = "비밀번호 찾기 — ERP ID로 임시 비밀번호 Teams 발송")
    @PostMapping("/password-reset")
    public ResponseEntity<ApiResponse<Void>> resetPassword(@RequestBody PasswordResetRequest req) {
        authService.resetPassword(req.getCompanyCd(), req.getLoginId());
        return ResponseEntity.ok(ApiResponse.ok());
    }
}
