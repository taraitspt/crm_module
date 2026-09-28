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
            @RequestParam(required = false) String role) {
        return ApiResponse.ok(service.list(keyword, deptCd, role));
    }

    @Operation(summary = "역할·부서·상태 변경")
    @PutMapping("/{userId}")
    public ApiResponse<Void> update(@PathVariable String userId,
                                    @Valid @RequestBody UserAdminDto.UpdateRequest request) {
        service.update(userId, request);
        return ApiResponse.ok();
    }
}
