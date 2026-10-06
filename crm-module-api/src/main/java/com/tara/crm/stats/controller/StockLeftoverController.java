package com.tara.crm.stats.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.stats.repository.OracleStockLeftoverRepository;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** 매출 > 매출 후 잔여재고 (TPS). ERP 조회 전용 — 매출은 등록됐는데 오늘 기준 재고가 남은 주문 라인(배치). */
@RestController
@RequestMapping("/api/stats/stock-leftover")
@RequiredArgsConstructor
public class StockLeftoverController {

    private final Optional<OracleStockLeftoverRepository> repository;

    @GetMapping
    @Operation(summary = "매출 후 잔여재고 — 매출 등록된 배치(주문번호-순번) 중 재고 > 0. billFrom/billTo 는 마지막 매출일 범위(선택)")
    public ApiResponse<List<Map<String, Object>>> rows(@RequestParam(required = false) String billFrom,
                                                       @RequestParam(required = false) String billTo) {
        LocalDate from = billFrom == null || billFrom.isBlank() ? null : LocalDate.parse(billFrom);
        LocalDate to = billTo == null || billTo.isBlank() ? null : LocalDate.parse(billTo);
        if (from != null && to != null && to.isBefore(from)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "종료일이 시작일보다 앞설 수 없습니다.");
        }
        OracleStockLeftoverRepository oracle = repository.orElseThrow(
                () -> new IllegalStateException("Oracle ERP 연동이 비활성화되어 있습니다."));
        return ApiResponse.ok(oracle.findLeftovers(from, to));
    }
}
