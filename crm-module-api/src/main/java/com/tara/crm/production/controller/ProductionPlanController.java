package com.tara.crm.production.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.production.dto.ProductionPlanDto;
import com.tara.crm.production.repository.OracleProductionPlanRepository;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * 생산현황 > 생산계획현황 (TPS). ERP 조회 전용.
 * 데이터 범위(ResourceScope)는 걸지 않는다 — 메뉴가 보이는 사람은 전체를 본다(2026-09-28 결정).
 */
@RestController
@RequestMapping("/api/production/plan")
@RequiredArgsConstructor
public class ProductionPlanController {

    /** 한 번에 조회할 수 있는 최대 기간(일). 한 달 수천 행, ERP 응답 수 초. */
    private static final long MAX_RANGE_DAYS = 31;

    private final Optional<OracleProductionPlanRepository> repository;

    /** tab = print(인쇄) / plate(제판) / process(후가공) / fold(접지) / bind(제본). 기간은 계획일 기준. */
    @GetMapping("/{tab}")
    @Operation(summary = "생산계획현황 — 탭별 행 (계획일 기준)")
    public ApiResponse<List<ProductionPlanDto.Row>> rows(
            @PathVariable String tab,
            @RequestParam String startDate,
            @RequestParam String endDate) {
        ProductionPlanDto.Tab t;
        try {
            t = ProductionPlanDto.Tab.valueOf(tab.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "알 수 없는 탭입니다: " + tab);
        }
        LocalDate start = LocalDate.parse(startDate);
        LocalDate end = LocalDate.parse(endDate);
        if (end.isBefore(start)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "종료일이 시작일보다 앞설 수 없습니다.");
        }
        if (ChronoUnit.DAYS.between(start, end) >= MAX_RANGE_DAYS) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회 기간은 최대 " + MAX_RANGE_DAYS + "일입니다.");
        }
        OracleProductionPlanRepository oracle = repository.orElseThrow(
                () -> new IllegalStateException("Oracle ERP 연동이 비활성화되어 있습니다."));
        return ApiResponse.ok(oracle.findRows(t, start, end));
    }
}
