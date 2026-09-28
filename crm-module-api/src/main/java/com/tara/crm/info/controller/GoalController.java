package com.tara.crm.info.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.info.dto.GoalDto;
import com.tara.crm.info.service.GoalService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Info - 목표관리", description = "파트/AM 목표 조회 및 입력 API")
@RestController
@RequestMapping("/api/info")
@RequiredArgsConstructor
public class GoalController {

    private final GoalService goalService;

    @Operation(summary = "파트 목표 조회")
    @GetMapping("/part-goals")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ApiResponse<List<GoalDto.PartGoalItem>> getPartGoals(
            @RequestParam(name = "year") String planYy, @RequestParam(name = "month") String planMm) {
        return ApiResponse.ok(goalService.getPartGoals(planYy, planMm));
    }

    @Operation(summary = "파트 목표 저장 (upsert)")
    @PutMapping("/part-goals")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ApiResponse<Void> savePartGoals(@RequestBody GoalDto.SavePartGoalsRequest request) {
        goalService.savePartGoals(request);
        return ApiResponse.ok();
    }

    @Operation(summary = "AM 목표 조회")
    @GetMapping("/am-goals")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ApiResponse<List<GoalDto.AmGoalItem>> getAmGoals(
            @RequestParam(name = "year") String planYy, @RequestParam(name = "month") String planMm) {
        return ApiResponse.ok(goalService.getAmGoals(planYy, planMm));
    }

    @Operation(summary = "AM 목표 저장 (upsert)")
    @PutMapping("/am-goals")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ApiResponse<Void> saveAmGoals(@RequestBody GoalDto.SaveAmGoalsRequest request) {
        goalService.saveAmGoals(request);
        return ApiResponse.ok();
    }

    @Operation(summary = "AM 연간 목표 조회 (내부/외부 구분, 1~12월)")
    @GetMapping("/am-goals-yearly")
    // 목표입력은 전체 role 접근 — 단, 서비스에서 MANAGER/PART_LEADER/STAFF 는 본인 부서로 강제(applyDeptScope). 그 외는 전체.
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<List<GoalDto.AmGoalYearlyItem>> getAmGoalsYearly(
            @RequestParam(name = "year") String planYy,
            @RequestParam(name = "deptCd", required = false) String deptCd,
            @RequestParam(name = "deptCds", required = false) List<String> deptCds,
            @RequestParam(name = "plantCd", required = false) Integer plantCd,
            @RequestParam(name = "salesEmpId", required = false) String salesEmpId) {
        // 시트 #5: deptCds(N개) 우선, 없으면 deptCd 단일로 호환.
        List<String> effective = (deptCds != null && !deptCds.isEmpty())
            ? deptCds
            : (deptCd != null && !deptCd.isBlank() ? List.of(deptCd) : null);
        return ApiResponse.ok(goalService.getAmGoalsYearly(planYy, effective, plantCd, salesEmpId));
    }

    @Operation(summary = "AM 연간 목표 저장 (내부/외부 구분)")
    @PutMapping("/am-goals-yearly")
    // 목표입력 저장도 전체 role — 단, 서비스에서 MANAGER/PART_LEADER/STAFF 는 본인 부서 건만 저장(다른 부서 저장 차단).
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<Void> saveAmGoalsYearly(@RequestBody GoalDto.SaveAmGoalYearlyRequest request) {
        goalService.saveAmGoalsYearly(request);
        return ApiResponse.ok();
    }
}
