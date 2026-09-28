package com.tara.crm.production.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.production.dto.ProductionPlanDto;
import com.tara.crm.production.repository.OracleProductionPlanRepository;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

/**
 * 생산현황 > 생산계획현황 (TPS). ERP 조회 전용.
 * 데이터 범위(ResourceScope)는 걸지 않는다 — 메뉴가 보이는 사람은 전체를 본다(2026-09-28 결정).
 */
@RestController
@RequestMapping("/api/production/plan")
@RequiredArgsConstructor
public class ProductionPlanController {

    /** 한 번에 조회할 수 있는 최대 기간(일). 한 달 약 6천 행, ERP 응답 10초 안팎. */
    private static final long MAX_RANGE_DAYS = 31;

    private final Optional<OracleProductionPlanRepository> repository;

    @GetMapping("/plate")
    @Operation(summary = "생산계획현황 — 제판 탭 (계획일 기준)")
    public ApiResponse<List<ProductionPlanDto.PlateRow>> plate(
            @RequestParam String startDate,
            @RequestParam String endDate) {
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
        return ApiResponse.ok(oracle.findPlateRows(start, end));
    }
}
