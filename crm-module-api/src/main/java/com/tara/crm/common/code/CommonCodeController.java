package com.tara.crm.common.code;

import com.tara.crm.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Common - 공통코드", description = "공통 코드 조회/관리 API")
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class CommonCodeController {

    private final CommonCodeService service;

    /** 드롭다운용 — 그룹별 사용중 코드. (인증된 사용자 전체) */
    @Operation(summary = "공통코드 조회 (그룹별, 사용중)")
    @GetMapping("/lookup/codes")
    public ApiResponse<List<CommonCodeDto.Item>> lookup(@RequestParam String group) {
        return ApiResponse.ok(service.listActive(group));
    }

    // ── 관리자 관리 ──

    @Operation(summary = "공통코드 그룹 목록")
    @GetMapping("/admin/common-codes/groups")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<List<String>> groups() {
        return ApiResponse.ok(service.groups());
    }

    @Operation(summary = "공통코드 전체 조회 (그룹별, 미사용 포함)")
    @GetMapping("/admin/common-codes")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<List<CommonCodeDto.Item>> list(@RequestParam String group) {
        return ApiResponse.ok(service.listAll(group));
    }

    @Operation(summary = "공통코드 등록/수정")
    @PostMapping("/admin/common-codes")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<Void> save(@RequestBody CommonCodeDto.Item request) {
        service.save(request);
        return ApiResponse.ok();
    }

    @Operation(summary = "공통코드 삭제")
    @DeleteMapping("/admin/common-codes")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<Void> delete(@RequestParam String group, @RequestParam String code) {
        service.delete(group, code);
        return ApiResponse.ok();
    }
}
