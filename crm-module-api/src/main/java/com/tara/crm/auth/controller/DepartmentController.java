package com.tara.crm.auth.controller;

import com.tara.crm.auth.entity.Department;
import com.tara.crm.auth.repository.DepartmentRepository;
import com.tara.crm.auth.service.DepartmentAdminService;
import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.common.util.SecurityContextUtil;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import lombok.Setter;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Tag(name = "Department", description = "부서 목록 · 상위 부서(조직도) 관리")
@RestController
@RequestMapping("/api/departments")
@RequiredArgsConstructor
public class DepartmentController {

    private final DepartmentRepository departmentRepository;
    private final DepartmentAdminService departmentAdminService;

    @GetMapping
    public ApiResponse<List<Map<String, Object>>> list() {
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        List<Map<String, Object>> result = departmentRepository.findAllByCompanyCd(companyCd != null ? companyCd : 1000).stream()
            .filter(Department::isInUse)
            .map(d -> {
                Map<String, Object> row = new java.util.LinkedHashMap<>();
                row.put("companyCd", d.getId().getCompanyCd());
                row.put("deptCd", d.getId().getDeptCd());
                row.put("deptNm", d.getDeptNm());
                row.put("upDeptCd", d.getUpDeptCd());
                return row;
            })
            .collect(Collectors.toList());
        return ApiResponse.ok(result);
    }

    @Operation(summary = "부서 관리 목록 — 상위 부서 이름·인원수 포함 (ADMIN)")
    @GetMapping("/admin")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<List<Map<String, Object>>> adminList() {
        return ApiResponse.ok(departmentAdminService.list());
    }

    @Operation(summary = "상위 부서 지정 — upDeptCd 가 null 이면 최상위 (ADMIN)")
    @PutMapping("/{deptCd}/parent")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<Void> setParent(@PathVariable Integer deptCd, @RequestBody ParentRequest request) {
        departmentAdminService.setParent(deptCd, request.getUpDeptCd());
        return ApiResponse.ok();
    }

    @Operation(summary = "부서장 지정 — employeeNo 가 비면 해제 (ADMIN)")
    @PutMapping("/{deptCd}/head")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<Void> setHead(@PathVariable Integer deptCd, @RequestBody HeadRequest request) {
        departmentAdminService.setHead(deptCd, request.getEmployeeNo());
        return ApiResponse.ok();
    }

    @Operation(summary = "부서 직접 추가 — ERP 에 없는 묶음(본부 노드 등). 번호는 90001 부터 (ADMIN)")
    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<Map<String, Object>> create(@RequestBody CreateRequest request) {
        Integer deptCd = departmentAdminService.create(request.getDeptNm(), request.getUpDeptCd(), request.getHeadEmployeeNo());
        return ApiResponse.ok(Map.of("deptCd", deptCd));
    }

    @Operation(summary = "부서 이름 변경 — 직접 추가한 부서만 (ADMIN)")
    @PutMapping("/{deptCd}/name")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<Void> rename(@PathVariable Integer deptCd, @RequestBody NameRequest request) {
        departmentAdminService.rename(deptCd, request.getDeptNm());
        return ApiResponse.ok();
    }

    @Operation(summary = "사용 / 미사용 — 여러 부서 한 번에. 막힌 부서는 건너뛰고 사유를 돌려준다 (ADMIN)")
    @PostMapping("/use")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<Map<String, Object>> setInUse(@RequestBody UseRequest request) {
        return ApiResponse.ok(departmentAdminService.setInUse(request.getDeptCds(), request.isInUse()));
    }

    @Operation(summary = "여러 부서를 한 상위 부서 아래로 옮기기 — upDeptCd 가 null 이면 최상위. 막힌 부서는 건너뛰고 사유를 돌려준다 (ADMIN)")
    @PostMapping("/move")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<Map<String, Object>> move(@RequestBody MoveRequest request) {
        return ApiResponse.ok(departmentAdminService.moveAll(request.getDeptCds(), request.getUpDeptCd()));
    }

    @Operation(summary = "표시 순서 — 같은 상위 부서 안의 부서들을 보낸 순서대로 (ADMIN, 끌어다 놓기)")
    @PostMapping("/order")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<Void> reorder(@RequestBody OrderRequest request) {
        departmentAdminService.reorder(request.getDeptCds());
        return ApiResponse.ok();
    }

    @Operation(summary = "부서 삭제 — 직접 추가한 부서 중 사람·하위 부서가 없는 것만 (ADMIN)")
    @DeleteMapping("/{deptCd}")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<Void> delete(@PathVariable Integer deptCd) {
        departmentAdminService.delete(deptCd);
        return ApiResponse.ok();
    }

    @Getter @Setter @NoArgsConstructor
    public static class ParentRequest {
        private Integer upDeptCd;
    }

    @Getter @Setter @NoArgsConstructor
    public static class CreateRequest {
        private String deptNm;
        private Integer upDeptCd;
        private String headEmployeeNo;
    }

    @Getter @Setter @NoArgsConstructor
    public static class NameRequest {
        private String deptNm;
    }

    @Getter @Setter @NoArgsConstructor
    public static class OrderRequest {
        private List<Integer> deptCds;
    }

    @Getter @Setter @NoArgsConstructor
    public static class MoveRequest {
        private List<Integer> deptCds;
        private Integer upDeptCd;
    }

    @Getter @Setter @NoArgsConstructor
    public static class UseRequest {
        private List<Integer> deptCds;
        private boolean inUse;
    }

    @Getter @Setter @NoArgsConstructor
    public static class HeadRequest {
        private String employeeNo;
    }
}
