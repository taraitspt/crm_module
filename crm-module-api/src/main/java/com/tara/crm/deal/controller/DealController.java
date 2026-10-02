package com.tara.crm.deal.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.deal.dto.DealDto;
import com.tara.crm.deal.service.DealService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@Tag(name = "SalesDeal", description = "수주 추진(딜) 파이프라인")
@RestController
@RequestMapping("/api/deals")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class DealController {

    private final DealService dealService;

    @Operation(summary = "파이프라인 조회 (목록 + 단계별 집계)")
    @GetMapping
    public ApiResponse<DealDto.Pipeline> pipeline(
            @RequestParam(required = false) String salesEmpId,
            @RequestParam(required = false) String partnerCd,
            @RequestParam(required = false) String stage,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.ok(dealService.pipeline(salesEmpId, partnerCd, stage, keyword));
    }

    @Operation(summary = "딜 등록")
    @PostMapping
    public ApiResponse<Long> create(@Valid @RequestBody DealDto.SaveRequest request) {
        return ApiResponse.ok(dealService.create(request));
    }

    @Operation(summary = "딜 수정")
    @PutMapping("/{id}")
    public ApiResponse<Void> update(@PathVariable Long id, @Valid @RequestBody DealDto.SaveRequest request) {
        dealService.update(id, request);
        return ApiResponse.ok();
    }

    @Operation(summary = "단계 이동 (칸반 드래그 등)")
    @PatchMapping("/{id}/stage")
    public ApiResponse<Void> changeStage(@PathVariable Long id, @Valid @RequestBody DealDto.StageRequest request) {
        dealService.changeStage(id, request);
        return ApiResponse.ok();
    }

    @Operation(summary = "딜 삭제")
    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        dealService.delete(id);
        return ApiResponse.ok();
    }
}
