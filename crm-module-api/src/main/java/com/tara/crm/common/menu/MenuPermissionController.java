package com.tara.crm.common.menu;

import com.tara.crm.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@Tag(name = "MenuPermission", description = "역할별 메뉴 권한 / 데이터 범위")
@RestController
@RequestMapping("/api/menu-permissions")
@RequiredArgsConstructor
public class MenuPermissionController {

    private final MenuPermissionService service;
    private final ResourceScopeService resourceScopeService;

    @Operation(summary = "권한 매트릭스 조회 (관리자 화면)")
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<MenuPermissionDto.Matrix> matrix() {
        return ApiResponse.ok(service.matrix());
    }

    @Operation(summary = "권한 저장 (변경된 셀)")
    @PutMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<Void> save(@RequestBody MenuPermissionDto.SaveRequest request) {
        service.save(request);
        return ApiResponse.ok();
    }

    @Operation(summary = "데이터 범위 매트릭스 조회 — 리소스 × 역할",
            description = "메뉴가 아니라 데이터 종류를 축으로 잡는다. 같은 API 를 여러 화면이 공유하기 때문에 "
                    + "메뉴 단위로 범위를 두면 서버가 호출 화면을 클라이언트 말에 의존해 판단해야 한다.")
    @GetMapping("/scopes")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<ResourceScopeDto.Matrix> scopes() {
        return ApiResponse.ok(resourceScopeService.matrix());
    }

    @Operation(summary = "데이터 범위 저장 (변경된 셀)")
    @PutMapping("/scopes")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<Void> saveScopes(@RequestBody ResourceScopeDto.SaveRequest request) {
        resourceScopeService.save(request);
        return ApiResponse.ok();
    }

    @Operation(summary = "내가 볼 수 있는 메뉴와 리소스별 데이터 범위 — 로그인 후 메뉴 구성에 사용")
    @GetMapping("/me")
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<MenuPermissionDto.MyAccess> myAccess() {
        return ApiResponse.ok(service.myAccess());
    }
}
