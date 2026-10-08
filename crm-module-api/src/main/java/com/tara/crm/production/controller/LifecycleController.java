package com.tara.crm.production.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.production.repository.OracleLifecycleRepository;
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
import java.util.Map;
import java.util.Optional;

/**
 * 생산현황 > 주문 타임라인 (TPS). ERP 생산계획 조회 전용, 데이터 범위는 걸지 않는다(생산 메뉴 공통).
 * 목록은 계획일 기간(최대 31일), 상세는 주문(또는 의뢰)번호·순번 하나.
 */
@RestController
@RequestMapping("/api/production/lifecycle")
@RequiredArgsConstructor
public class LifecycleController {

    private static final long MAX_RANGE_DAYS = 31;

    private final Optional<OracleLifecycleRepository> repository;

    @GetMapping
    @Operation(summary = "주문 타임라인 목록 — 계획일 기간에 걸린 주문 순번별 공정 진행(대수마감) 집계")
    public ApiResponse<List<Map<String, Object>>> lines(@RequestParam String startDate, @RequestParam String endDate) {
        LocalDate start = LocalDate.parse(startDate);
        LocalDate end = LocalDate.parse(endDate);
        if (end.isBefore(start)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "종료일이 시작일보다 앞설 수 없습니다.");
        }
        if (ChronoUnit.DAYS.between(start, end) >= MAX_RANGE_DAYS) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회 기간은 최대 " + MAX_RANGE_DAYS + "일입니다.");
        }
        return ApiResponse.ok(oracle().findLines(start, end));
    }

    @GetMapping("/{orderNo}/{orderSq}")
    @Operation(summary = "주문 타임라인 상세 — 순번 하나의 제판·인쇄·후가공·접지·제본 계획 행과 대수마감·실적일")
    public ApiResponse<List<Map<String, Object>>> stages(@PathVariable String orderNo, @PathVariable int orderSq) {
        return ApiResponse.ok(oracle().findStages(orderNo.trim(), orderSq));
    }

    private OracleLifecycleRepository oracle() {
        return repository.orElseThrow(() -> new IllegalStateException("Oracle ERP 연동이 비활성화되어 있습니다."));
    }
}
