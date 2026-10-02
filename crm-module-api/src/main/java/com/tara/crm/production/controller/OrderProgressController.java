package com.tara.crm.production.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.production.repository.OracleOrderProgressRepository;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 생산현황 > 주문진행현황 (TPS). ERP 조회 전용. 주문일 기준 기간(최대 92일).
 * 데이터 범위(ResourceScope)는 걸지 않는다 — 생산현황 화면들과 같은 결정. 모바일은 화면에서 내 담당(사번)으로 거른다.
 */
@RestController
@RequestMapping("/api/production/order-progress")
@RequiredArgsConstructor
public class OrderProgressController {

    private static final long MAX_RANGE_DAYS = 92;

    private final Optional<OracleOrderProgressRepository> repository;

    @GetMapping
    @Operation(summary = "주문진행현황 — 주문일 기간(최대 92일), 주문번호×순번 단위, 진행상태·처리일자 포함")
    public ApiResponse<List<Map<String, Object>>> rows(@RequestParam String startDate, @RequestParam String endDate) {
        LocalDate start = LocalDate.parse(startDate);
        LocalDate end = LocalDate.parse(endDate);
        if (end.isBefore(start)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "종료일이 시작일보다 앞설 수 없습니다.");
        }
        if (ChronoUnit.DAYS.between(start, end) >= MAX_RANGE_DAYS) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회 기간은 최대 " + MAX_RANGE_DAYS + "일입니다.");
        }
        OracleOrderProgressRepository oracle = repository.orElseThrow(
                () -> new IllegalStateException("Oracle ERP 연동이 비활성화되어 있습니다."));
        return ApiResponse.ok(oracle.findRows(start, end));
    }
}
