package com.tara.crm.auth.controller;

import com.tara.crm.auth.dto.UserAdminDto;
import com.tara.crm.auth.service.UserAdminService;
import com.tara.crm.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "UserAdmin", description = "사용자 관리 — 역할·부서·상태")
@RestController
@RequestMapping("/api/admin/users")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class UserAdminController {

    private final UserAdminService service;

    @Operation(summary = "사용자 목록")
    @GetMapping
    public ApiResponse<List<UserAdminDto.Item>> list(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Integer deptCd,
            @RequestParam(required = false) String role,
            @RequestParam(required = false) String status) {
        return ApiResponse.ok(service.list(keyword, deptCd, role, status));
    }

    @Operation(summary = "여러 명 상태 일괄 변경 — 재직(ACTIVE) / 미사용·퇴직(INACTIVE). 옛 계정 정리용")
    @PostMapping("/bulk-status")
    public ApiResponse<Integer> bulkStatus(@RequestBody UserAdminDto.BulkStatusRequest request) {
        return ApiResponse.ok(service.bulkStatus(request.getUserIds(), request.getStatus()));
    }

    @Operation(summary = "역할·부서·상태 변경")
    @PutMapping("/{userId}")
    public ApiResponse<Void> update(@PathVariable String userId,
                                    @Valid @RequestBody UserAdminDto.UpdateRequest request) {
        service.update(userId, request);
        return ApiResponse.ok();
    }

    @Operation(summary = "로그인 잠금 해제 — 연속 실패로 잠긴 계정을 풀고 실패 횟수를 0 으로")
    @PostMapping("/{userId}/unlock")
    public ApiResponse<Void> unlock(@PathVariable String userId) {
        service.unlock(userId);
        return ApiResponse.ok();
    }
}
