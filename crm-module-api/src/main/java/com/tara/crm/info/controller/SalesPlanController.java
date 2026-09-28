package com.tara.crm.info.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.info.dto.SalesPlanDto;
import com.tara.crm.info.service.SalesPlanService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "SalesPlan", description = "월매출계획 입력 / 매출현황(계획 대비 실적)")
@RestController
@RequestMapping("/api/info/sales-plan")
@RequiredArgsConstructor
public class SalesPlanController {

    private final SalesPlanService salesPlanService;

    @Operation(summary = "담당자 선택 옵션 (활성 사용자)")
    @GetMapping("/users")
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<List<SalesPlanDto.UserOption>> users(@RequestParam(required = false) Integer deptCd) {
        return ApiResponse.ok(salesPlanService.getUsers(deptCd));
    }

    @Operation(summary = "월매출계획 조회 (연도, 선택: 부서/담당자)")
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<List<SalesPlanDto.PlanRow>> list(@RequestParam String planYy,
                                                        @RequestParam(required = false) Integer deptCd,
                                                        @RequestParam(required = false) String salesEmpId) {
        return ApiResponse.ok(salesPlanService.getPlans(planYy, deptCd, salesEmpId));
    }

    @Operation(summary = "월매출계획 저장 — 요청에 포함된 담당자의 해당 연도 계획을 통째로 교체")
    @PutMapping
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<Void> save(@RequestBody SalesPlanDto.SaveRequest request) {
        salesPlanService.savePlans(request);
        return ApiResponse.ok();
    }

    @Operation(summary = "매출현황 — 계획(공임+용지) vs ERP 실적(거래처별 월 매출)")
    @GetMapping("/status")
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<SalesPlanDto.StatusResponse> status(
            @RequestParam String planYy,
            @RequestParam(required = false) Integer deptCd,
            @RequestParam(required = false) String salesEmpId,
            /** 사업부문 — 기본 1000(타라티피에스). 전체를 보려면 "ALL". */
            @RequestParam(required = false, defaultValue = "1000") String plantCd) {
        return ApiResponse.ok(salesPlanService.getStatus(planYy, deptCd, salesEmpId,
                com.tara.crm.activity.controller.PartnerAttentionController.normalizePlant(plantCd)));
    }
}
